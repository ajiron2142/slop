// Smart paste: a very long paste (a log, command output) isn't put into the message. The text
// stays in memory while the page is open; the model gets a short preview plus two tools to
// search and read the rest, so a big log costs a few hundred tokens instead of the whole thing
// on every message. Nothing is saved, so there's nothing to clean up: a reload forgets it.
//
// To remove it: delete this file and the lines marked "smart paste" in composer.js, api.js,
// main.js and composer.css, and tests/suites/paste.mjs.

import { queryRegex, splitLines, excerpt, numberedRange } from './lines.js';

const BIG_LINES = 500;
const BIG_CHARS = 40_000; // ~10k tokens; also catches huge single-line pastes
const MAX_PASTE = 50 * 1024 * 1024;
const MAX_MATCHES = 100;
const PREVIEW = 10; // lines shown from each end

const pastes = new Map(); // id -> lines; in memory only

export function isBigPaste(text) {
  if (text.length > BIG_CHARS) return true;
  let lines = 1;
  for (let i = text.indexOf('\n'); i !== -1 && lines <= BIG_LINES; i = text.indexOf('\n', i + 1)) lines++;
  return lines > BIG_LINES;
}

// The attachment for the message box. Its text lives in `pastes`, never on the attachment.
export function createPaste(text) {
  if (text.length > MAX_PASTE) throw new Error('That paste is larger than 50 MB.');
  const id = crypto.randomUUID().slice(0, 8);
  const lines = splitLines(text);
  pastes.set(id, lines);
  return { kind: 'paste', id, lines: lines.length, name: `${shortCount(lines.length)} lines` };
}

// 640, 1.2k, 18.4k: short enough for a chip.
const shortCount = (n) => (n < 1000 ? String(n) : `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`);

// What the model sees in place of the paste.
export function pasteNote(file) {
  const lines = pastes.get(file.id);
  if (!lines) {
    return `<pasted lines="${file.lines}">(No longer available: pastes are only kept until the page reloads. Ask the user to paste it again if you need it.)</pasted>`;
  }
  const cut = (l) => l.slice(0, 300);
  const head = lines.slice(0, PREVIEW).map(cut).join('\n');
  const tail = lines.length > PREVIEW * 2 ? lines.slice(-PREVIEW).map(cut).join('\n') : '';
  return `<pasted id="${file.id}" lines="${lines.length}">\n` +
    `The user pasted ${lines.length} lines. They are not in this message: use search_paste and read_paste with id "${file.id}" to look at them.\n` +
    `--- first lines ---\n${head}\n${tail ? `--- last lines ---\n${tail}\n` : ''}</pasted>`;
}

// Whether a chat has a paste the model can still look at (the tools are only sent then).
export const hasPastes = (messages) => messages.some((m) => m.files?.some((f) => f.kind === 'paste' && pastes.has(f.id)));

const str = (description) => ({ type: 'string', description });
export const PASTE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_paste',
      description: 'Search text the user pasted, like grep. Returns matching lines with line numbers. Case-insensitive unless the query has capitals.',
      parameters: {
        type: 'object',
        properties: { id: str('The paste id.'), query: str('Text to find, or a regular expression when regex is true.'), regex: { type: 'boolean', description: 'Treat query as a JavaScript regular expression.' } },
        required: ['id', 'query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_paste',
      description: 'Read lines of text the user pasted, up to 1000 at a time.',
      parameters: {
        type: 'object',
        properties: { id: str('The paste id.'), start_line: { type: 'integer', description: 'First line (from 1).' }, end_line: { type: 'integer', description: 'Last line.' } },
        required: ['id'],
      },
    },
  },
];

export const isPasteTool = (name) => name === 'search_paste' || name === 'read_paste';

export function runPasteTool(name, argsJson) {
  try {
    const args = JSON.parse(argsJson || '{}');
    const lines = pastes.get(String(args.id));
    if (!lines) throw new Error('no paste with that id; it may have been lost on a reload');
    if (name === 'read_paste') {
      const { from, last, text } = numberedRange(lines, args.start_line, args.end_line);
      return { label: `Read paste lines ${from}–${last}`, result: text };
    }
    const re = queryRegex(args.query, args.regex);
    const out = [];
    let total = 0;
    for (let n = 0; n < lines.length; n++) {
      if (!re.test(lines[n])) continue;
      if (out.length < MAX_MATCHES) out.push(`${n + 1}: ${excerpt(lines[n], re)}`);
      total++;
    }
    const label = `Searched paste for "${args.query}"`;
    if (!total) return { label, result: `No matches in ${lines.length} lines.` };
    const more = total > out.length ? ` (showing the first ${out.length}; narrow the search or read around them)` : '';
    return { label, result: `${total} matching lines${more}\n${out.join('\n')}` };
  } catch (e) {
    return { label: "Couldn't search the paste", result: `Error: ${e.message}` };
  }
}
