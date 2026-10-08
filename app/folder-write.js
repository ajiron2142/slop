// Optional add-on: lets the model create and edit files in a connected folder, with your approval.
// Each change shows in the side panel as a diff with Apply / Skip / Apply all remaining, and the
// latest reply's changes can be undone in one click. Nothing here is saved: edit access, the
// review and Undo last until you reload or send another message. Git is the long-term undo.
//
// To remove it: delete this file, styles/components/folder-write.css, tests/suites/write.mjs and
// their lines in index.html and tests/run.mjs (including the "folder-edit" menu item), then
// remove or simplify each line marked "write mode" in main.js and composer.js. The side panel
// (components/panel.js) stays; it's generic and simply never opens.

import { el } from './dom.js';
import { cleanPath } from './folder.js';

export const pickEditableFolder = () => window.showDirectoryPicker({ mode: 'readwrite' });

export const writePrompt =
  'You can also change files in this folder; the user reviews each change before it is written. ' +
  'Use edit_file to change part of a file: old_text must match the file exactly and appear once ' +
  '(copy it without the line numbers read_file adds). Use write_file for new files. ' +
  "If the user skips a change, don't make it again unless they ask.";

const str = (description) => ({ type: 'string', description });
export const WRITE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace one exact piece of text in a file. The user reviews the change first.',
      parameters: {
        type: 'object',
        properties: {
          path: str('File path, e.g. "deploy/route.yaml".'),
          old_text: str('The exact current text to replace, without line numbers. Must appear exactly once.'),
          new_text: str('The text to put in its place.'),
        },
        required: ['path', 'old_text', 'new_text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create a new file, or replace the whole content of a small one. The user reviews it first.',
      parameters: {
        type: 'object',
        properties: { path: str('File path, e.g. "scripts/check-db.sh".'), content: str('The complete file content.') },
        required: ['path', 'content'],
      },
    },
  },
];

const MAX_REWRITE = 100 * 1024; // larger files must use edit_file
const STATUS = { waiting: 'waiting', applied: 'applied', created: 'created', skipped: 'skipped' };

// The review state for the latest reply. `onChange` lets the chat redraw its status line;
// `canShow` says whether that chat is on screen, so the panel never opens over another chat.
export function createWriter({ panel, onChange, canShow = () => true }) {
  let reply = null; // { msg, root, changes: [], applyAll, done, undone }
  let selected = 0;
  let pending = null; // { resolve } while a change waits for you
  let version = 0;
  const changed = () => { version++; onChange(); if (panel.showing('changes')) show(); };

  // ---- the panel ----

  function button(label, cls, onClick) {
    const b = el('button', `btn ${cls}`, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function show() {
    if (!reply?.changes.length) return;
    const list = el('div', 'changes');
    reply.changes.forEach((c, i) => {
      const row = el('button', `change${i === selected ? ' on' : ''}`);
      row.type = 'button';
      row.append(el('span', 'change-path', c.path), counts(c), el('span', `change-status ${c.status}`, STATUS[c.status]));
      row.addEventListener('click', () => { selected = i; show(); });
      list.append(row);
    });
    const c = reply.changes[selected];
    const view = el('div', 'changes-view');
    view.append(list, el('div', 'change-title', c.path), diffNode(c.lines));

    const applied = reply.changes.filter((x) => x.status === 'applied' || x.status === 'created').length;
    const foot = pending
      ? [
          button('Apply', 'primary', () => decide('apply')),
          button('Skip', '', () => decide('skip')),
          button('Apply all remaining', '', () => { reply.applyAll = true; decide('apply'); }),
        ]
      : reply.undone
        ? [el('span', 'changes-note', 'Undone.')]
        : reply.done && applied
          ? [el('span', 'changes-note', `${applied} file${applied > 1 ? 's' : ''} changed`), button('↶ Undo this reply', 'undo', undo)]
          : [el('span', 'changes-note', 'Working…')];
    panel.open({ key: 'changes', title: 'Changes · this reply', body: view, foot });
  }

  function decide(choice) {
    const p = pending;
    pending = null;
    p?.resolve(choice);
  }

  // ---- the chat ----

  // A status line under the reply that changed files: what's waiting, Review, Undo.
  function decoration(msg) {
    if (!reply || reply.msg !== msg || !reply.changes.length) return null;
    const applied = reply.changes.filter((c) => c.status === 'applied' || c.status === 'created').length;
    const line = el('div', 'write-log');
    if (pending) line.append(el('span', 'waiting', `Waiting for you: ${reply.changes[selected].path}`));
    else if (reply.undone) line.append(el('span', '', 'Changes undone'));
    else line.append(el('span', '', applied ? `${applied} file${applied === 1 ? '' : 's'} changed` : 'No changes applied'));
    const review = el('button', 'link', 'Review');
    review.type = 'button';
    review.addEventListener('click', show);
    line.append(review);
    if (reply.done && applied && !reply.undone) {
      const u = el('button', 'link', '↶ Undo');
      u.type = 'button';
      u.addEventListener('click', undo);
      line.append(u);
    }
    return { key: `w${version}`, node: line };
  }

  // ---- running the tools ----

  async function run(root, call, signal) {
    let args = {};
    const name = call.function.name;
    try {
      args = JSON.parse(call.function.arguments || '{}');
      const path = cleanPath(args.path);
      if (!path || path.split('/').includes('..')) throw new Error('give a path inside the folder');
      const before = await readText(root, path);
      let after;
      if (name === 'edit_file') {
        if (before == null) throw new Error(`${path} doesn't exist; use write_file to create it`);
        const old = String(args.old_text ?? '');
        const count = old ? before.split(old).length - 1 : 0;
        if (count === 0) throw new Error(`old_text wasn't found in ${path}. Read the file again and copy the text exactly, without line numbers`);
        if (count > 1) throw new Error(`old_text appears ${count} times in ${path}; include more surrounding lines so it's unique`);
        after = before.replace(old, () => String(args.new_text ?? ''));
      } else {
        if (before != null && before.length > MAX_REWRITE) throw new Error(`${path} is large; change it with edit_file instead`);
        after = String(args.content ?? '');
      }
      if (after === before) return { label: `Left ${path} as is`, result: 'No change needed: the file already has that content.' };

      reply.root = root;
      const change = { path, before, after, lines: diffLines(before ?? '', after, before == null), status: 'waiting' };
      reply.changes.push(change);
      selected = reply.changes.length - 1;

      let choice = 'apply';
      if (!reply.applyAll) {
        choice = await new Promise((resolve, reject) => {
          pending = { resolve };
          signal.addEventListener('abort', () => { pending = null; change.status = 'skipped'; reject(new DOMException('Stopped', 'AbortError')); }, { once: true });
          changed();
          if (canShow()) show();
        });
      }
      if (choice === 'skip') {
        change.status = 'skipped';
        changed();
        return { label: `Skipped ${path}`, result: `The user skipped this change to ${path}. Don't make it again unless they ask.` };
      }
      await writeText(root, path, after);
      change.status = before == null ? 'created' : 'applied';
      changed();
      const { add, del } = change.lines.stats;
      return before == null
        ? { label: `Created ${path}`, result: `Created ${path}.` }
        : { label: `Edited ${path} (+${add} −${del})`, result: `Applied the change to ${path}.` };
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      return { label: `Couldn't change ${cleanPath(args.path) || name}`, result: `Error: ${e.message}` };
    }
  }

  // All of the latest reply's changes, put back as they were. Only offered until the next message.
  async function undo() {
    const r = reply;
    if (!r || r.undone) return;
    const done = r.changes.filter((c) => c.status === 'applied' || c.status === 'created').reverse();
    const edited = [];
    for (const c of done) if ((await readText(r.root, c.path)) !== c.after) edited.push(c.path);
    if (edited.length && !confirm(`Changed since the AI edited them:\n${edited.join('\n')}\n\nUndo anyway and lose those edits?`)) return;
    for (const c of done) {
      if (c.before == null) await removeFile(r.root, c.path);
      else await writeText(r.root, c.path, c.before);
    }
    r.undone = true;
    changed();
  }

  return {
    handles: (name) => name === 'edit_file' || name === 'write_file',
    run,
    decoration,
    // A new reply replaces the old one: its changes are no longer undoable from here.
    startReply(msg) {
      decide('skip');
      panel.close('changes');
      reply = { msg, root: null, changes: [], applyAll: false, done: false, undone: false };
      selected = 0;
      version++;
    },
    endReply() {
      if (!reply) return;
      reply.done = true;
      if (!reply.changes.length) reply = null;
      changed();
    },
  };
}

// ---- files ----

async function dirFor(root, path, create) {
  const parts = path.split('/');
  const name = parts.pop();
  let dir = root;
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create });
  return { dir, name };
}

async function readText(root, path) {
  try {
    const { dir, name } = await dirFor(root, path, false);
    return await (await (await dir.getFileHandle(name)).getFile()).text();
  } catch (e) {
    if (e.name === 'NotFoundError' || e.name === 'TypeMismatchError') return null;
    throw e;
  }
}

async function writeText(root, path, text) {
  const { dir, name } = await dirFor(root, path, true);
  const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await w.write(text);
  await w.close();
}

async function removeFile(root, path) {
  const { dir, name } = await dirFor(root, path, false);
  await dir.removeEntry(name);
}

// ---- diffs ----

// Line diff with 3 lines of context around each change. Lines are [' ' | '+' | '-', text].
function diffLines(a, b, created) {
  // A final newline ends the last line; it isn't an extra empty line.
  const split = (t) => (t ? t.replace(/\n$/, '').split('\n') : []);
  const A = split(a);
  const B = split(b);
  let out;
  if (created) out = B.map((l) => ['+', l]);
  else {
    let start = 0;
    while (start < A.length && start < B.length && A[start] === B[start]) start++;
    let endA = A.length;
    let endB = B.length;
    while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) { endA--; endB--; }
    const mid = middle(A.slice(start, endA), B.slice(start, endB));
    out = [...A.slice(0, start).map((l) => [' ', l]), ...mid, ...A.slice(endA).map((l) => [' ', l])];
  }
  const stats = { add: out.filter((l) => l[0] === '+').length, del: out.filter((l) => l[0] === '-').length };
  // Keep only changed lines and their context; mark gaps.
  const keep = out.map((l, i) => l[0] !== ' ' || out.slice(Math.max(0, i - 3), i + 4).some((m) => m[0] !== ' '));
  const lines = [];
  out.forEach((l, i) => {
    if (keep[i]) lines.push(l);
    else if (keep[i - 1] || i === 0) lines.push(['…', '']);
  });
  lines.stats = stats;
  return lines;
}

// The changed middle of two files, via longest common subsequence (small inputs) or as a block.
function middle(A, B) {
  if (A.length * B.length > 4_000_000) return [...A.map((l) => ['-', l]), ...B.map((l) => ['+', l])];
  const n = A.length;
  const m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push([' ', A[i]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push(['-', A[i++]]);
    else out.push(['+', B[j++]]);
  }
  while (i < n) out.push(['-', A[i++]]);
  while (j < m) out.push(['+', B[j++]]);
  return out;
}

function counts(change) {
  const { add, del } = change.lines.stats;
  const node = el('span', 'change-counts');
  node.append(el('span', 'add', `+${add}`));
  if (del) node.append(' ', el('span', 'del', `−${del}`));
  return node;
}

const MAX_SHOWN = 400;
function diffNode(lines) {
  const pre = el('pre', 'diff');
  for (const [mark, text] of lines.slice(0, MAX_SHOWN)) {
    const cls = mark === '+' ? 'add' : mark === '-' ? 'del' : mark === '…' ? 'gap' : '';
    pre.append(el('span', cls, mark === '…' ? '…' : `${mark} ${text}`));
  }
  if (lines.length > MAX_SHOWN) pre.append(el('span', 'gap', `… ${lines.length - MAX_SHOWN} more lines`));
  return pre;
}
