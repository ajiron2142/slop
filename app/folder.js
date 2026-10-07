// Read-only access to a folder the user connects to a chat (Chrome and Edge only).
// The model gets two tools, list_files and read_file. When it calls one,
// the browser reads from the folder and sends the result back. Nothing is ever written.

export const folderSupported = typeof window.showDirectoryPicker === 'function';

export const pickFolder = () => window.showDirectoryPicker({ mode: 'read' });

// The browser asks the user again after a reload; this needs a click or key press, which sending is.
export async function allowRead(handle) {
  const opts = { mode: 'read' };
  return (await handle.queryPermission(opts)) === 'granted' || (await handle.requestPermission(opts)) === 'granted';
}

export const folderPrompt = (handle) =>
  `The user connected their local folder "${handle.name}" to this chat (read-only). ` +
  'Use list_files and read_file to look at it when that helps answer.';

export const FOLDER_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List the files in the connected folder, or in a subfolder of it, including subfolders. Paths are relative to the folder.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Subfolder to list, e.g. "src". Empty for the whole folder.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a text file from the connected folder.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path relative to the folder, e.g. "src/app.js".' } },
        required: ['path'],
      },
    },
  },
];

const SKIP = new Set(['.git', 'node_modules', '.venv', '__pycache__', 'dist', 'build']);
const MAX_FILES = 500;
const MAX_READ = 512 * 1024;

// Runs one tool call. Returns a short label for the chat and the text the model gets back.
export async function runTool(root, name, argsJson) {
  let path = '';
  try {
    path = String(JSON.parse(argsJson || '{}').path ?? '');
    if (name === 'list_files') {
      const files = await listFiles(await resolve(root, path, 'dir'), cleanPath(path));
      const more = files.length > MAX_FILES ? '\n…(cut off at 500 files; list a subfolder to see more)' : '';
      return { label: `Listed ${cleanPath(path) || root.name}`, result: files.slice(0, MAX_FILES).join('\n') + more || '(empty folder)' };
    }
    if (name === 'read_file') {
      const file = await (await resolve(root, path, 'file')).getFile();
      if (file.size > MAX_READ) throw new Error('file is larger than 512 KB');
      const text = await file.text();
      if (text.includes('\0')) throw new Error('not a text file');
      return { label: `Read ${cleanPath(path)}`, result: text };
    }
    throw new Error(`unknown tool ${name}`);
  } catch (e) {
    return { label: `Couldn't open ${cleanPath(path) || name}`, result: `Error: ${e.message}` };
  }
}

const cleanPath = (path) => path.split('/').filter((p) => p && p !== '.').join('/');

async function resolve(root, path, kind) {
  const parts = cleanPath(path).split('/').filter(Boolean);
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

async function listFiles(dir, prefix, out = []) {
  const entries = [];
  for await (const entry of dir.values()) entries.push(entry);
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (out.length > MAX_FILES) break;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === 'file') out.push(path);
    else if (!SKIP.has(entry.name)) await listFiles(entry, path, out);
  }
  return out;
}
