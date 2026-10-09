import { el } from '../dom.js';

// The chat list: open, delete, search, collapse to a rail, and the slide-over menu on narrow screens.
export function createSidebar({ app, list, search, menuButton, collapseButton, scrim, onOpen, onDelete, onSearch, onCollapse }) {
  let timer = 0;
  let shown = null; // the list and active chat last rendered, to skip identical re-renders
  // Same width as the CSS: below it the sidebar slides over the chat instead of collapsing to a rail.
  const narrow = window.matchMedia('(max-width: 760px)');

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
  // The same button collapses the sidebar on a wide window and closes the slide-over on a narrow one.
  collapseButton.addEventListener('click', () => {
    if (narrow.matches) return close();
    setCollapsed(!app.classList.contains('collapsed'));
    onCollapse(app.classList.contains('collapsed'));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && app.classList.contains('sidebar-open')) { close(); menuButton.focus(); }
  });

  function setCollapsed(collapsed) {
    app.classList.toggle('collapsed', collapsed);
    collapseButton.setAttribute('aria-expanded', String(!collapsed));
    collapseButton.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  }

  function close() { app.classList.remove('sidebar-open'); }

  return {
    close,
    setCollapsed,
    query: () => search.value.trim(),
    render(chats, activeId) {
      if (shown?.chats === chats && shown.activeId === activeId) return;
      shown = { chats, activeId };
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
