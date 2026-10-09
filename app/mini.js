import { el } from './dom.js';

// Mini window (optional add-on, Chrome and Edge): pops the chat out into a small floating window
// that stays on top of other apps, like a video's picture-in-picture. The chat itself moves
// there, no copy, and moves back when the mini window closes; the side panel goes with it.
// The tab must stay open (it can be in the background). Nothing is saved.
//
// To remove it: delete this file and styles/components/mini.css, the mini-btn <button> and the
// mini.css <link> in index.html, and the line marked "mini window" in main.js.

export const miniSupported = 'documentPictureInPicture' in window;

export function createMini({ button, chat, panel, sidebar }) {
  let win = null;
  const observer = new MutationObserver(() => syncTheme());

  // What the tab shows while the chat is away.
  const home = el('div', 'mini-home themed');
  const back = el('button', 'btn', 'Bring it back');
  back.type = 'button';
  back.addEventListener('click', () => win?.close());
  home.append(el('p', '', 'The chat is in the floating window.'), back);

  // The chat keeps the tab's theme, including changes made in Settings while it's away.
  function syncTheme() {
    const theme = [...sidebar.classList].find((c) => c.startsWith('theme-'));
    for (const node of [chat, panel, home]) {
      node.className = node.className.replace(/\btheme-\S+/g, '').trim();
      if (theme) node.classList.add(theme);
    }
    for (const link of win?.document.querySelectorAll('link[data-theme]') ?? []) {
      link.media = document.querySelector(`link[data-theme="${link.dataset.theme}"]`)?.media ?? 'not all';
    }
  }

  async function open() {
    win = await documentPictureInPicture.requestWindow({ width: 420, height: 640 });
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) win.document.head.append(link.cloneNode());
    win.document.title = document.title;
    win.document.body.className = 'mini';
    chat.before(home);
    win.document.body.append(chat, panel);
    syncTheme();
    observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    win.addEventListener('pagehide', comeBack, { once: true });
    setButton(true);
    chat.querySelector('textarea')?.focus();
  }

  function comeBack() {
    observer.disconnect();
    home.replaceWith(chat);
    chat.after(panel);
    win = null;
    setButton(false);
  }

  function setButton(away) {
    button.setAttribute('aria-label', away ? 'Back to the tab' : 'Pop out into a floating window');
    button.title = away ? 'Back to the tab' : 'Pop out into a floating window';
    button.classList.toggle('on', away);
  }

  setButton(false);
  button.hidden = false;
  button.addEventListener('click', () => (win ? win.close() : open().catch(() => { win = null; })));
}
