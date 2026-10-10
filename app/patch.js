import { el } from './dom.js';

// Patches (optional add-on): when a folder or GitLab project is connected, the model is asked to
// answer change requests with one git patch in a ```diff block. A valid patch shows as a block to
// review (each file a row that opens into its diff, with the totals) and a "Copy for terminal"
// button. The copied text is one readable command: pasted in the repo folder, Enter applies the
// whole patch with git (all of it or nothing) and prints what changed. slop itself never writes.
//
// Rules, all fixed: a block is a patch only if every line is a line git patches are made of
// (file headers, @@ hunk headers, and lines starting with a space, + or -); anything else, or a line
// that is exactly the end marker, leaves it a plain code block with a note saying which line. The
// command is always `git apply --recount --stat --summary --apply` with the patch between
// <<'END_OF_PATCH' and END_OF_PATCH, so the shell treats the patch as data and runs nothing in it.
//
// To remove it: delete this file, styles/components/patch.css and tests/suites/patch.mjs, their
// lines in index.html and tests/run.mjs, and the lines marked "patch" in main.js and messages.js.

export const MARKER = 'END_OF_PATCH';

// For the system prompt. `roots` are the prefixes the model's paths start with in this chat (the
// folder's name, the GitLab project's path); a patch's paths start at the repo's root instead.
export const patchPrompt = (roots) =>
  'To change files, reply with one git patch in a ```diff block, exactly as `git diff` prints it: for each file a ' +
  '"diff --git a/… b/…" line, its --- and +++ lines, then @@ hunks. Write it against the files as you last read them, ' +
  `put every change in one patch, and give paths from the repo's root, without ${roots.map((r) => `"${r}/"`).join(' or ')}. ` +
  "You can't change files yourself: the user reviews the patch here and applies it with git.";

const FILE_HEADER = /^(index [0-9a-f]+\.\.[0-9a-f]+( \d+)?|--- (a\/.+|\/dev\/null)|\+\+\+ (b\/.+|\/dev\/null)|(new|deleted) file mode \d+|old mode \d+|new mode \d+|(dis)?similarity index \d+%|rename (from|to) .+|copy (from|to) .+)$/;
const HUNK = /^@@ -\d+(,\d+)? \+\d+(,\d+)? @@/;

// The files a patch changes, or { error } naming the first line that breaks the rules.
export function parsePatch(text) {
  const lines = text.replace(/\n$/, '').split('\n');
  const files = [];
  let file = null;
  let inHunk = false;
  for (const [i, line] of lines.entries()) {
    const bad = (why) => ({ error: `line ${i + 1} ${why}: ${JSON.stringify(line.slice(0, 80))}` });
    if (line === MARKER) return bad('is the end marker the command uses');
    const start = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (start) {
      file = { path: start[2], kind: '', adds: 0, dels: 0, lines: [] };
      files.push(file);
      inHunk = false;
    } else if (!file) {
      return bad('should start the patch with "diff --git a/… b/…"');
    } else if (HUNK.test(line)) {
      inHunk = true;
      file.lines.push(line);
    } else if (inHunk && /^[ +\-\\]/.test(line)) {
      if (line[0] === '+') file.adds++;
      if (line[0] === '-') file.dels++;
      file.lines.push(line);
    } else if (inHunk && line === '') {
      file.lines.push(' '); // an empty context line whose space was trimmed; git reads it the same way
    } else if (!inHunk && FILE_HEADER.test(line)) {
      if (/^new file mode|^--- \/dev\/null/.test(line)) file.kind = 'new';
      if (/^deleted file mode|^\+\+\+ \/dev\/null/.test(line)) file.kind = 'deleted';
      if (/^rename to /.test(line)) { file.kind = 'renamed'; file.path = line.slice(10); }
      if (line.startsWith('+++ b/')) file.path = line.slice(6);
    } else {
      return bad("isn't part of a git patch");
    }
  }
  return files.length ? { files } : { error: 'there are no files in it' };
}

// The text "Copy for terminal" puts on the clipboard.
export function patchCommand(text) {
  return `git apply --recount --stat --summary --apply <<'${MARKER}'\n${text.replace(/\n?$/, '\n')}${MARKER}`;
}

// For messages.js: a ```diff block becomes a patch block ({ node }), stays a code block with a note
// saying why ({ note }), or isn't a diff block at all (null).
export function patchBlock(lang, text) {
  if (lang !== 'diff' && lang !== 'patch') return null;
  const parsed = parsePatch(text);
  if (parsed.error) return { note: el('div', 'patch-note', `Not a patch slop can apply: ${parsed.error}.`) };
  const { files } = parsed;
  const adds = files.reduce((n, f) => n + f.adds, 0);
  const dels = files.reduce((n, f) => n + f.dels, 0);

  const copy = el('button', 'patch-copy', 'Copy for terminal');
  copy.type = 'button';
  copy.title = `Copies a git apply command for ${files.length === 1 ? 'this file' : `these ${files.length} files`}. Paste it in your repo folder and press Enter.`;
  copy.addEventListener('click', async () => {
    try {
      await copy.ownerDocument.defaultView.navigator.clipboard.writeText(patchCommand(text));
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Copy failed';
    }
    setTimeout(() => { copy.textContent = 'Copy for terminal'; }, 1200);
  });
  const head = el('div', 'patch-head');
  head.append(el('b', '', 'Patch'), counts(`${files.length} file${files.length === 1 ? '' : 's'} · `, adds, dels), el('span', 'patch-space'), copy);

  const node = el('div', 'patch');
  node.append(head, ...files.map((f, i) => fileRow(f, i === 0)), el('div', 'patch-foot', 'Paste it in your repo folder and press Enter: git applies all of it or nothing, and lists what changed.'));
  return { node };
}

function counts(prefix, adds, dels) {
  const span = el('span', 'patch-counts', prefix);
  if (adds) span.append(el('span', 'patch-add', `+${adds}`));
  if (adds && dels) span.append(' ');
  if (dels) span.append(el('span', 'patch-del', `−${dels}`));
  return span;
}

// One file: a row that opens into its diff. The first file starts open.
function fileRow(f, open) {
  const row = el('button', 'patch-row');
  row.type = 'button';
  const name = el('span', 'patch-path', f.path);
  if (f.kind) name.append(el('span', `patch-tag ${f.kind}`, f.kind));
  row.append(el('span', 'patch-tw'), name, counts('', f.adds, f.dels));
  const diff = el('pre', 'patch-diff');
  for (const line of f.lines) {
    const cls = line.startsWith('@@') ? 'hunk' : line[0] === '+' ? 'add' : line[0] === '-' ? 'del' : '';
    diff.append(el('span', cls, line), '\n');
  }
  const wrap = el('div', 'patch-file');
  const show = (value) => { diff.hidden = !value; row.setAttribute('aria-expanded', String(value)); row.firstChild.textContent = value ? '▾' : '▸'; };
  row.addEventListener('click', () => show(diff.hidden));
  show(open);
  wrap.append(row, diff);
  return wrap;
}
