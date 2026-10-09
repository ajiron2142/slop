// Read-only access to a folder the user connects to a chat (Chrome and Edge only).
// The model gets three tools: list_files, search_files and read_file. When it calls one,
// the browser reads from the folder and sends the result back. Nothing is ever written.
// Results are kept short on purpose: every line the model gets back costs tokens.

import { MAX_LINES, MAX_CHARS, queryRegex, splitLines, excerpt, numberedRange } from './lines.js';
import { ignoreRulesFor, withIgnoreFile, isIgnored } from './ignore.js';

export const folderSupported = typeof window.showDirectoryPicker === 'function';

export const pickFolder = () => window.showDirectoryPicker({ mode: 'read' });

// The browser asks the user again after a reload; this needs a click or key press, which sending is.
export async function allowRead(handle) {
  const opts = { mode: 'read' };
  return (await handle.queryPermission(opts)) === 'granted' || (await handle.requestPermission(opts)) === 'granted';
}

export const folderPrompt = (handle) =>
  `The user connected their local folder "${handle.name}" to this chat (read-only). ` +
  'To find something, use search_files first, then read_file with start_line/end_line around the matches ' +
  'instead of reading whole files. Use list_files to see how the folder is laid out. ' +
  'You can call several tools at once. ' +
  `Every path starts with the folder's name, like "${handle.name}/src/app.js"; "${handle.name}" alone is the whole folder.`;

const str = (description) => ({ type: 'string', description });
const int = (description) => ({ type: 'integer', description });
const tool = (name, description, properties, required = []) =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

export const FOLDER_TOOLS = [
  tool('list_files', 'List file paths in the connected folder or a subfolder, including subfolders. Leaves out what the folder\'s .gitignore files list.', {
    path: str('Subfolder, starting with the folder\'s name like every path. Empty for the whole folder.'),
    pattern: str('Only names matching this glob, e.g. "*.yaml". A pattern with "/" matches the whole path, folder name included.'),
  }),
  tool('search_files', 'Search file contents, like grep. Returns matching lines with line numbers, grouped by file. Case-insensitive unless the query has capitals. Leaves out what the .gitignore files list, and lockfiles, minified and binary files (read_file still opens them).', {
    query: str('Text to find, or a regular expression when regex is true.'),
    path: str('Subfolder to search, starting with the folder\'s name. Empty for the whole folder.'),
    pattern: str('Only files matching this glob, e.g. "*.py".'),
    regex: { type: 'boolean', description: 'Treat query as a JavaScript regular expression.' },
  }, ['query']),
  tool('read_file', `Read a text file. Long files come back ${1000} lines at a time; ask for the next part with start_line.`, {
    path: str('File path, starting with the folder\'s name.'),
    start_line: int('First line to read (from 1).'),
    end_line: int('Last line to read.'),
  }, ['path']),
];

// Files searches leave out because they only add noise; listing and reading still show them.
const NOISE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|go\.sum)$|\.(min\.(js|css)|map|png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|jar|woff2?|ttf|exe|dll|so|dylib|bin)$/i;
const MAX_FILES = 500; // per listing
const MAX_SCAN = 5000; // files per search
const MAX_MATCHES = 100; // lines per search
const PER_FILE = 15; // lines per file in a search
const MAX_BYTES = 4 * 1024 * 1024;

// Runs one tool call. Returns a short label for the chat and the text the model gets back.
export async function runTool(root, name, argsJson) {
  let args = {};
  try {
    args = JSON.parse(argsJson || '{}');
    const path = args.path ? fromModel(root, args.path) : '';
    if (name === 'list_files') return { label: `Listed ${forModel(root, path)}`, result: await list(root, path, args.pattern) };
    if (name === 'search_files') return { label: `Searched "${args.query}"${path ? ` in ${forModel(root, path)}` : ''}`, result: await search(root, path, args) };
    if (name === 'read_file') return await read(root, path, args);
    throw new Error(`unknown tool ${name}`);
  } catch (e) {
    return { label: `Couldn't ${name === 'search_files' ? 'search' : 'open'} ${args.path || args.query || name}`, result: `Error: ${e.message}` };
  }
}

// Paths between the app and the model always start with the folder's name: "test/src/app.js" in a
// folder called test, and "test" for the folder itself. (The browser never says where the folder is
// on disk, so that's as full as a path can be.) Inside the app, paths are relative to the folder.
// One fixed rule both ways, so nothing is guessed.
export function fromModel(root, path) {
  const parts = String(path ?? '').split('/').filter((p) => p && p !== '.');
  if (parts.includes('..')) throw new Error('paths must stay inside the folder');
  if (parts[0] !== root.name) throw new Error(`paths start with the folder's name, like "${root.name}/${parts.join('/') || '…'}"`);
  return parts.slice(1).join('/');
}

export const forModel = (root, path) => (path ? `${root.name}/${path}` : root.name);

async function resolve(root, path, kind) {
  const parts = path.split('/').filter(Boolean);
  if (parts.includes('..')) throw new Error('paths must stay inside the folder');
  let dir = root;
  const last = kind === 'file' ? parts.pop() : null;
  for (const part of parts) dir = await dir.getDirectoryHandle(part);
  if (kind === 'file') {
    if (!last) throw new Error('no file path given');
    return dir.getFileHandle(last);
  }
  return dir;
}

// "*.yaml" matches by name anywhere; a pattern with a "/" matches the whole path.
function globTest(pattern) {
  if (!pattern) return () => true;
  const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?|\*|\?/g, (m) => (m === '?' ? '[^/]' : m === '*' ? '[^/]*' : '.*'))}$`, 'i');
  return pattern.includes('/') ? (path) => re.test(path) : (path) => re.test(path.slice(path.lastIndexOf('/') + 1));
}

// Every file under dir, in name order, as [path, handle], leaving out what the .gitignore files
// list (ignore.js). Stops after `limit`.
async function walk(dir, prefix, limit, rules, out = []) {
  const entries = [];
  for await (const entry of dir.values()) entries.push(entry);
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (out.length >= limit) break;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (isIgnored(rules, path, entry.kind === 'directory')) continue;
    if (entry.kind === 'file') out.push([path, entry]);
    else await walk(entry, path, limit, await withIgnoreFile(entry, path, rules), out);
  }
  return out;
}

async function list(root, path, pattern) {
  const test = globTest(pattern);
  const files = (await walk(await resolve(root, path, 'dir'), path, Infinity, await ignoreRulesFor(root, path))).map(([p]) => forModel(root, p)).filter(test);
  if (!files.length) return pattern ? `No files match ${pattern}.` : '(empty folder)';
  const more = files.length > MAX_FILES ? `\n…and ${files.length - MAX_FILES} more. Narrow it with path or pattern.` : '';
  return files.slice(0, MAX_FILES).join('\n') + more;
}

async function search(root, path, { query, pattern, regex }) {
  const re = queryRegex(query, regex);

  const test = globTest(pattern);
  const files = (await walk(await resolve(root, path, 'dir'), path, MAX_SCAN, await ignoreRulesFor(root, path))).filter(([p]) => test(forModel(root, p)) && !NOISE.test(p));
  const out = [];
  let total = 0;
  let hitFiles = 0;
  // Read a few files at a time; results stay in path order.
  for (let i = 0; i < files.length && total < MAX_MATCHES; i += 16) {
    const texts = await Promise.all(files.slice(i, i + 16).map(([p, handle]) => readText(root, p, handle)));
    texts.forEach((text, j) => {
      if (text == null || total >= MAX_MATCHES || !re.test(text)) return;
      const lines = text.split('\n');
      const hits = [];
      for (let n = 0; n < lines.length && hits.length < PER_FILE + 1; n++) if (re.test(lines[n])) hits.push(n);
      const shown = hits.slice(0, Math.min(PER_FILE, MAX_MATCHES - total));
      out.push(forModel(root, files[i + j][0]), ...shown.map((n) => `  ${n + 1}: ${excerpt(lines[n], re)}`));
      if (hits.length > shown.length) out.push('  …more in this file');
      total += shown.length;
      hitFiles++;
    });
  }
  if (!out.length) return `No matches for ${regex ? `/${query}/` : `"${query}"`} in ${files.length} files.`;
  const capped = total >= MAX_MATCHES ? ` (stopped at ${MAX_MATCHES}; narrow it with path or pattern)` : '';
  return `${total} matching lines in ${hitFiles} files${capped}\n${out.join('\n')}`;
}

// File text for searching, or null for binary and very large files. Kept per folder until the
// file changes, so the model's follow-up searches don't read everything again.
const cache = new WeakMap();
async function readText(root, path, handle) {
  const files = cache.get(root) ?? cache.set(root, new Map()).get(root);
  const file = await handle.getFile();
  const hit = files.get(path);
  if (hit && hit.modified === file.lastModified && hit.size === file.size) return hit.text;
  let text = null;
  if (file.size <= MAX_BYTES) {
    text = await file.text();
    if (text.includes('\0')) text = null;
  }
  files.set(path, { modified: file.lastModified, size: file.size, text });
  return text;
}

async function read(root, path, { start_line, end_line }) {
  const file = await (await resolve(root, path, 'file')).getFile();
  if (file.size > MAX_BYTES) throw new Error('file is larger than 4 MB');
  const text = await file.text();
  if (text.includes('\0')) throw new Error('not a text file');
  const lines = splitLines(text);
  const ranged = start_line != null || end_line != null;
  // A short file asked for whole comes back as is: line numbers would only add tokens.
  if (!ranged && lines.length <= MAX_LINES && text.length <= MAX_CHARS) return { label: `Read ${forModel(root, path)}`, result: text };

  const { from, last, text: result } = numberedRange(lines, start_line, end_line);
  return { label: `Read ${forModel(root, path)}${ranged ? `:${from}–${last}` : ''}`, result };
}
