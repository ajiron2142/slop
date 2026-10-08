import { el } from '../dom.js';

// A slot on the right for whatever a feature wants to show beside the chat, such as file changes
// to review. Features open it with their content and it closes when they're done or you close
// it. It knows nothing about what's inside and keeps no history: one thing at a time.
export function createPanel({ app, root }) {
  const title = el('h2', 'panel-title');
  const close = el('button', 'icon-btn panel-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close panel');
  close.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const head = el('header', 'panel-head');
  head.append(title, close);
  const body = el('div', 'panel-body');
  const foot = el('footer', 'panel-foot');
  root.append(head, body, foot);

  let current = null; // { key, onClose }

  function hide() {
    if (!current) return;
    const { onClose } = current;
    current = null;
    root.hidden = true;
    app.classList.remove('panel-open');
    onClose?.();
  }
  close.addEventListener('click', hide);
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

  return {
    // Shows content, replacing whatever was open. `key` names the owner so it can update or close its own content.
    open({ key, title: text, body: content, foot: buttons = [], onClose }) {
      if (current && current.key !== key) hide();
      current = { key, onClose };
      title.textContent = text;
      body.replaceChildren(content);
      foot.replaceChildren(...buttons);
      foot.hidden = !buttons.length;
      root.hidden = false;
      app.classList.add('panel-open');
    },
    close(key) { if (!key || current?.key === key) hide(); },
    showing: (key) => current?.key === key,
  };
}
