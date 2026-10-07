import { el } from '../dom.js';

// The chat list: open, delete, search, and the slide-over menu on narrow screens.
export function createSidebar({ app, list, search, menuButton, scrim, onOpen, onDelete, onSearch }) {
  let timer = 0;

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    const id = btn?.closest('li')?.dataset.id;
    if (!id) return;
    if (btn.dataset.action === 'open') { close(); onOpen(id); }
    else onDelete(id);
  });
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => onSearch(search.value.trim()), 150);
  });
  menuButton.addEventListener('click', () => app.classList.toggle('sidebar-open'));
  scrim.addEventListener('click', close);

  function close() { app.classList.remove('sidebar-open'); }

  return {
    close,
    query: () => search.value.trim(),
    render(chats, activeId) {
      if (!chats.length) {
        list.replaceChildren(el('li', 'chat-empty', search.value.trim() ? 'No matches' : 'No chats yet'));
        return;
      }
      list.replaceChildren(...chats.map((meta) => {
        const li = el('li', meta.id === activeId ? 'active' : '');
        li.dataset.id = meta.id;
        const open = el('button', 'chat-open', meta.title || 'Untitled');
        open.dataset.action = 'open';
        open.title = meta.title;
        const del = el('button', 'chat-delete', '×');
        del.dataset.action = 'delete';
        del.setAttribute('aria-label', `Delete "${meta.title}"`);
        li.append(open, del);
        return li;
      }));
    },
  };
}
