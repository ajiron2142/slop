import { el } from './dom.js';

// Image viewer (optional add-on): click an image in the chat, or one waiting above the message box,
// to see it large. Esc, a click outside it or × closes it. Nothing is kept.
//
// To remove it: delete this file, styles/components/viewer.css and tests/suites/viewer.mjs, their
// lines in index.html and tests/run.mjs, and the line marked "image viewer" in main.js.

const IMAGES = 'img.file-thumb, .tray-chip img';

// `chat` is the chat element; the viewer opens in whichever window it's in (the tab or the mini window).
export function createViewer(chat) {
  chat.addEventListener('click', (e) => {
    const img = e.target.closest(IMAGES);
    if (img) open(img);
  });
}

function open(img) {
  const dialog = el('dialog', 'viewer');
  const close = el('button', 'viewer-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => dialog.close());
  const big = el('img');
  big.src = img.src;
  big.alt = img.alt;
  dialog.append(close, big);
  if (img.alt) dialog.append(el('div', 'viewer-name', img.alt));
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); }); // the dimmed area
  dialog.addEventListener('close', () => dialog.remove());
  // Inside the chat element, so it has the chat's theme.
  img.closest('.chat').append(dialog);
  dialog.showModal();
}
