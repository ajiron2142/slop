import { el } from './dom.js';

// Edit (optional add-on): an Edit button under each of your messages. It turns the message into a
// box; Save sends it again in its place, and everything after it goes: the model answers the new
// wording. Saving it unchanged asks again for a fresh answer. Attachments stay as they were.
// Hidden while a reply is being written. Enter saves, Shift+Enter is a new line, Esc cancels.
//
// To remove it: delete this file, styles/components/edit.css and tests/suites/edit.mjs, their lines
// in index.html and tests/run.mjs, and the lines marked "edit" in main.js and components/messages.js.

const EDIT_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>';

// `onSave(msg, text)` sends the new wording; it returns false when it can't now (the box stays open).
export function editNode(msg, onSave) {
  const row = el('div', 'edit-row');
  const button = el('button', 'reply-btn edit-btn');
  button.type = 'button';
  button.innerHTML = EDIT_ICON;
  button.append('Edit');
  button.addEventListener('click', () => open(button.closest('.msg'), msg, onSave));
  row.append(button);
  return row;
}

function open(node, msg, onSave) {
  const body = node.querySelector('.body');
  const box = el('textarea', 'edit-box');
  box.value = msg.content;
  box.setAttribute('aria-label', 'Edit your message');
  const cancel = el('button', 'btn', 'Cancel');
  const save = el('button', 'btn primary', 'Save');
  cancel.type = save.type = 'button';
  const editor = el('div', 'editor');
  const buttons = el('div', 'edit-buttons');
  buttons.append(cancel, save);
  editor.append(box, buttons);
  // A message needs words or an attachment, like any message.
  const empty = () => !box.value.trim() && !msg.files?.length;
  const fit = () => { box.style.height = 'auto'; box.style.height = `${Math.min(box.scrollHeight + box.offsetHeight - box.clientHeight, 300)}px`; save.disabled = empty(); };
  const close = () => { editor.replaceWith(body); node.classList.remove('editing'); };
  const done = () => { if (!empty() && onSave(msg, box.value.trim()) !== false) close(); };
  cancel.addEventListener('click', close);
  save.addEventListener('click', done);
  box.addEventListener('input', fit);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); done(); }
  });
  body.replaceWith(editor);
  node.classList.add('editing');
  fit();
  box.focus();
  box.setSelectionRange(box.value.length, box.value.length);
}
