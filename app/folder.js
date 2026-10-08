// Read-only access to a folder the user connects to a chat (Chrome and Edge only).
// The model gets three tools: list_files, search_files and read_file. When it calls one,
// the browser reads from the folder and sends the result back. Nothing is ever written.
// Results are kept short on purpose: every line the model gets back costs tokens.

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
  'You can call several tools at once.';

const str = (description) => ({ type: 'string', description });
const int = (description) => ({ type: 'integer', description });
const tool = (name, description, properties, required = []) =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

export const FOLDER_TOOLS = [
  tool('list_files', 'List file paths in the connected folder or a subfolder, including subfolders.', {
    path: str('Subfolder, e.g. "src". Empty for the whole folder.'),
    pattern: str('Only names matching this glob, e.g. "*.yaml" or "src/**/*.test.js".'),
  }),
  tool('search_files', 'Search file contents, like grep. Returns matching lines with line numbers, grouped by file. Case-insensitive unless the query has capitals.', {
    query: str('Text to find, or a regular expression when regex is true.'),
    path: str('Subfolder to search. Empty for the whole folder.'),
    pattern: str('Only files matching this glob, e.g. "*.py".'),
    regex: { type: 'boolean', description: 'Treat query as a JavaScript regular expression.' },
  }, ['query']),
  tool('read_file', `Read a text file. Long files come back ${1000} lines at a time; ask for the next part with start_line.`, {
    path: str('File path, e.g. "src/app.js".'),
    start_line: int('First line to read (from 1).'),
    end_line: int('Last line to read.'),
  }, ['path']),
];

// Folders that are never listed or searched, and files that only add noise to searches.
const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', 'dist', 'build', '.next', '.cache', 'coverage', '.terraform', '.idea', 'target']);
const NOISE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|go\.sum)$|\.(min\.(js|css)|map|png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|jar|woff2?|ttf|exe|dll|so|dylib|bin)$/i;
const MAX_FILES = 500; // per listing
const MAX_SCAN = 5000; // files per search
const MAX_MATCHES = 100; // lines per search
const PER_FILE = 15; // lines per file in a search
const MAX_LINES = 1000; // lines per read
const MAX_CHARS = 100_000; // characters per read, for minified files with huge lines
const MAX_BYTES = 4 * 1024 * 1024;

// Runs one tool call. Returns a short label for the chat and the text the model gets back.
export async function runTool(root, name, argsJson) {
  let args = {};
  try {
    args = JSON.parse(argsJson || '{}');
    const path = cleanPath(args.path);
    if (name === 'list_files') return { label: `Listed ${path || root.name}`, result: await list(root, path, args.pattern) };
    if (name === 'search_files') return { label: `Searched "${args.query}"${path ? ` in ${path}` : ''}`, result: await search(root, path, args) };
    if (name === 'read_file') return await read(root, path, args);
    throw new Error(`unknown tool ${name}`);
  } catch (e) {
    return { label: `Couldn't ${name === 'search_files' ? 'search' : 'open'} ${cleanPath(args.path) || args.query || name}`, result: `Error: ${e.message}` };
  }
}

export const cleanPath = (path) => String(path ?? '').split('/').filter((p) => p && p !== '.').join('/');

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

// Every file under dir, in name order, as [path, handle]. Stops after `limit`.
async function walk(dir, prefix, limit, out = []) {
  const entries = [];
  for await (const entry of dir.values()) entries.push(entry);
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (out.length >= limit) break;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === 'file') out.push([path, entry]);
    else if (!SKIP_DIRS.has(entry.name)) await walk(entry, path, limit, out);
  }
  return out;
}

async function list(root, path, pattern) {
  const test = globTest(pattern);
  const files = (await walk(await resolve(root, path, 'dir'), path, Infinity)).map(([p]) => p).filter(test);
  if (!files.length) return pattern ? `No files match ${pattern}.` : '(empty folder)';
  const more = files.length > MAX_FILES ? `\n…and ${files.length - MAX_FILES} more. Narrow it with path or pattern.` : '';
  return files.slice(0, MAX_FILES).join('\n') + more;
}

async function search(root, path, { query, pattern, regex }) {
  if (!query) throw new Error('no query given');
  const flags = /[A-Z]/.test(query) ? '' : 'i';
  let re;
  try { re = new RegExp(regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags); } catch (e) { throw new Error(`bad regular expression: ${e.message}`); }

  const test = globTest(pattern);
  const files = (await walk(await resolve(root, path, 'dir'), path, MAX_SCAN)).filter(([p]) => test(p) && !NOISE.test(p));
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
      out.push(files[i + j][0], ...shown.map((n) => `  ${n + 1}: ${excerpt(lines[n], re)}`));
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

// One line of a search result: trimmed, and cut to ~160 characters around the match.
function excerpt(line, re) {
  const text = line.trim();
  if (text.length <= 160) return text;
  const at = Math.max(0, (text.search(re) || 0) - 60);
  return `${at ? '…' : ''}${text.slice(at, at + 160)}…`;
}

async function read(root, path, { start_line, end_line }) {
  const file = await (await resolve(root, path, 'file')).getFile();
  if (file.size > MAX_BYTES) throw new Error('file is larger than 4 MB');
  const text = await file.text();
  if (text.includes('\0')) throw new Error('not a text file');
  const lines = text.split('\n');
  if (lines.length > 1 && lines.at(-1) === '') lines.pop(); // a final newline isn't another line
  const ranged = start_line != null || end_line != null;
  // A short file asked for whole comes back as is: line numbers would only add tokens.
  if (!ranged && lines.length <= MAX_LINES && text.length <= MAX_CHARS) return { label: `Read ${path}`, result: text };

  const from = Math.min(Math.max(1, start_line ?? 1), lines.length);
  const to = Math.min(lines.length, end_line ?? Infinity, from + MAX_LINES - 1);
  let body = '';
  let last = from - 1;
  for (let n = from; n <= to && body.length < MAX_CHARS; n++, last++) body += `${n}\t${lines[n - 1].slice(0, MAX_CHARS)}\n`;
  const rest = last < lines.length ? `(lines ${from}–${last} of ${lines.length}; next: start_line ${last + 1})` : `(lines ${from}–${last} of ${lines.length})`;
  return { label: `Read ${path}${ranged ? `:${from}–${last}` : ''}`, result: body + rest };
}
