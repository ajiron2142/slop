// Optional add-on: lets the model create and edit files in a connected folder, with your approval.
// Each change shows in the reply as a one-line card (file, +/− lines, status) that opens into its
// diff. The change waiting for you is open, with Apply / Skip; or type what you want instead and
// press Enter. The latest reply's changes can be undone in one click. Nothing here is saved: edit
// access, the review and Undo last until you reload or send another message. Git is the long-term undo.
//
// To remove it: delete this file, styles/components/folder-write.css, tests/suites/write.mjs and
// their lines in index.html and tests/run.mjs (including the "folder-edit" menu item), then
// remove or simplify each line marked "write mode" in main.js and composer.js.

import { el } from './dom.js';
import { cleanPath, insidePath } from './folder.js';
import { diffLines } from './diff.js';

export const pickEditableFolder = () => window.showDirectoryPicker({ mode: 'readwrite' });

export const writePrompt =
  'You can also change files in this folder; the user reviews each change before it is written. ' +
  "When the user asks for a change, make it with the tools straight away: don't ask in the chat first " +
  'or show the new content as text, because the app already asks the user to approve each change. ' +
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
const STATUS = { waiting: 'waiting for you', applied: 'applied', created: 'created', skipped: 'skipped' };

// The review state for the latest reply. `onChange` lets the chat redraw the reply's cards.
export function createWriter({ onChange }) {
  let reply = null; // { msg, root, changes: [], applyAll, done, undone }
  let pending = null; // { resolve, change } while a change waits for you
  const opened = new Set(); // changes you opened, by index
  let version = 0;
  const changed = () => { version++; onChange(); };

  function button(label, cls, onClick) {
    const b = el('button', `btn ${cls}`, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  // Apply or skip the waiting change. A note (typed instead of Skip) is passed to the model.
  function decide(choice, note = '') {
    const p = pending;
    pending = null;
    p?.resolve({ choice, note });
  }

  // ---- the chat ----

  // Under the reply that changed files: a summary line, then one card per file. Only the change
  // waiting for you is open; click any card to open or close it.
  function decoration(msg) {
    if (!reply || reply.msg !== msg || !reply.changes.length) return null;
    const box = el('div', 'write-review');
    const add = reply.changes.reduce((n, c) => n + c.lines.stats.add, 0);
    const del = reply.changes.reduce((n, c) => n + c.lines.stats.del, 0);
    const done = reply.changes.filter((c) => c.status === 'applied' || c.status === 'created').length;
    const summary = el('div', 'write-log');
    summary.append(el('b', '', `${reply.changes.length} file${reply.changes.length === 1 ? '' : 's'} · +${add} −${del}`));
    if (reply.undone) summary.append(el('span', '', 'Changes undone'));
    else if (pending) {
      summary.append(el('span', 'waiting', `Waiting for you: ${pending.change.path}`));
      summary.append(button('Apply all remaining', '', () => { reply.applyAll = true; decide('apply'); }));
    } else if (reply.done) {
      summary.append(el('span', '', done ? `${done} changed` : 'No changes applied'));
      if (done) summary.append(button('↶ Undo', 'undo', undo));
    } else summary.append(el('span', '', 'Working…'));
    box.append(summary);

    reply.changes.forEach((c, i) => {
      const open = c === pending?.change || opened.has(i);
      const card = el('div', `change${c === pending?.change ? ' waiting' : ''}`);
      const head = el('button', 'change-head');
      head.type = 'button';
      head.setAttribute('aria-expanded', String(open));
      head.append(el('span', 'change-arrow', open ? '▾' : '▸'), el('span', 'change-path', c.path), counts(c), el('span', `change-status ${c.status}`, STATUS[c.status]));
      head.addEventListener('click', () => {
        if (c === pending?.change) return; // the waiting change stays open
        if (!opened.delete(i)) opened.add(i);
        changed();
      });
      card.append(head);
      if (open) {
        card.append(diffNode(c.lines));
        if (c === pending?.change) {
          const acts = el('div', 'change-actions');
          acts.append(button('Apply', 'primary', () => decide('apply')), button('Skip', '', () => decide('skip')), el('span', 'change-hint', 'or type what you want instead and press Enter'));
          card.append(acts);
        }
      }
      if (c.note) card.append(el('div', 'change-note', `You: ${c.note}`));
      box.append(card);
    });
    return { key: `w${version}`, node: box };
  }

  // ---- running the tools ----

  async function run(root, call, signal) {
    let args = {};
    const name = call.function.name;
    try {
      args = JSON.parse(call.function.arguments || '{}');
      const path = await insidePath(root, args.path);
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

      let decision = { choice: 'apply', note: '' };
      if (!reply.applyAll) {
        decision = await new Promise((resolve, reject) => {
          pending = { resolve, change };
          signal.addEventListener('abort', () => { pending = null; change.status = 'skipped'; reject(new DOMException('Stopped', 'AbortError')); }, { once: true });
          changed();
        });
      }
      if (decision.choice === 'skip') {
        change.status = 'skipped';
        change.note = decision.note;
        changed();
        const result = decision.note
          ? `The user skipped this change to ${path} and said instead: "${decision.note}". Do what they asked.`
          : `The user skipped this change to ${path}. Don't make it again unless they ask.`;
        return { label: `Skipped ${path}`, result };
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
    // Typing while a change waits skips it and passes your words to the model. False when nothing waits.
    instead(note) {
      if (!pending) return false;
      decide('skip', note);
      return true;
    },
    // A new reply replaces the old one: its changes are no longer undoable from here.
    startReply(msg) {
      decide('skip');
      reply = { msg, root: null, changes: [], applyAll: false, done: false, undone: false };
      opened.clear();
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

function counts(change) {
  const { add, del } = change.lines.stats;
  const node = el('span', 'change-counts');
  node.append(el('span', 'add', `+${add}`));
  if (del) node.append(' ', el('span', 'del', `−${del}`));
  return node;
}

const MAX_SHOWN = 400;
// The diff, with "@@ line N" where each part starts so you can find it in the file.
function diffNode(lines) {
  const pre = el('pre', 'diff');
  let head = true;
  for (const [mark, text, oldNo, newNo] of lines.slice(0, MAX_SHOWN)) {
    if (mark === '…') { head = true; continue; }
    if (head && lines.length > 1) pre.append(el('span', 'gap', `@@ line ${mark === '-' ? oldNo : newNo}`));
    head = false;
    pre.append(el('span', mark === '+' ? 'add' : mark === '-' ? 'del' : '', `${mark} ${text}`));
  }
  if (lines.length > MAX_SHOWN) pre.append(el('span', 'gap', `… ${lines.length - MAX_SHOWN} more lines`));
  return pre;
}
