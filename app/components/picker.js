import { el, onClickOutside, onWidthChange } from '../dom.js';

// A searchable dropdown: a button that opens a filterable list.
// Used for the model picker and the theme picker.
let count = 0;

export function createPicker(root, { label, empty = 'Nothing to pick', onSelect, onOpen }) {
  const id = `picker-${++count}`;
  const button = el('button', 'model');
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', label);

  const pop = el('div', 'picker-pop');
  pop.hidden = true;
  const search = el('input', 'picker-search');
  search.type = 'text';
  search.placeholder = `Search ${label.toLowerCase()}…`;
  search.setAttribute('role', 'combobox');
  search.setAttribute('aria-controls', `${id}-list`);
  search.setAttribute('aria-expanded', 'true');
  search.setAttribute('autocomplete', 'off');
  const list = el('ul', 'picker-list');
  list.id = `${id}-list`;
  list.setAttribute('role', 'listbox');
  pop.append(search, list);
  root.append(button, pop);

  let items = [];
  let recent = [];
  let value = '';
  let visible = [];
  let active = 0;

  const nameOf = (itemId) => items.find((i) => i.id === itemId)?.name ?? itemId;

  function renderButton() {
    button.disabled = !items.length;
    button.textContent = items.length ? nameOf(value) : empty;
  }

  function renderList() {
    const q = search.value.trim().toLowerCase();
    const match = (i) => !q || i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q);
    const groups = [];
    const recentItems = q ? [] : recent.map((r) => items.find((i) => i.id === r)).filter(Boolean);
    if (recentItems.length) groups.push(['Recent', recentItems]);
    groups.push([recentItems.length ? 'All' : '', items.filter(match)]);

    visible = [];
    const nodes = [];
    for (const [title, group] of groups) {
      if (title && group.length) nodes.push(el('li', 'picker-group', title));
      for (const item of group) {
        const li = el('li', 'picker-option', item.name);
        li.id = `${id}-opt-${visible.length}`;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(item.id === value));
        li.dataset.index = visible.length;
        visible.push(item);
        nodes.push(li);
      }
    }
    if (!visible.length) nodes.push(el('li', 'picker-empty', 'No matches'));
    list.replaceChildren(...nodes);
    setActive(Math.max(0, visible.findIndex((i) => i.id === value)));
  }

  function setActive(i) {
    active = Math.min(Math.max(i, 0), visible.length - 1);
    list.querySelectorAll('.picker-option').forEach((li) => li.classList.toggle('active', +li.dataset.index === active));
    const node = list.querySelector(`#${id}-opt-${active}`);
    if (node) {
      search.setAttribute('aria-activedescendant', node.id);
      node.scrollIntoView({ block: 'nearest' });
    }
  }

  let stopOutside = null;

  // Opens below the button, or above it when there's more room there (a button near the bottom of the
  // screen, as on a phone); the list is never taller than that room.
  function place() {
    const r = button.getBoundingClientRect();
    const height = root.ownerDocument.defaultView.innerHeight;
    const below = height - r.bottom - 18;
    const above = r.top - 18;
    pop.style.top = below >= above ? `${r.bottom + 6}px` : '';
    pop.style.bottom = below >= above ? '' : `${height - r.top + 6}px`;
    list.style.maxHeight = `${Math.max(80, Math.min(320, Math.max(below, above) - 44))}px`; // 44: the search box
    if (root.classList.contains('block')) {
      pop.style.left = `${r.left}px`;
      pop.style.width = `${r.width}px`;
    } else {
      pop.style.right = `${Math.max(12, root.ownerDocument.defaultView.innerWidth - r.right)}px`;
    }
  }

  function open() {
    onOpen?.();
    place();
    pop.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    stopOutside = onClickOutside(root, () => close(false));
    search.value = '';
    renderList();
    // With a mouse or trackpad you can type to filter straight away. On a touch screen that would pop up
    // the keyboard over the list, so you tap the search box when you want it.
    if (root.ownerDocument.defaultView.matchMedia('(pointer: fine)').matches) search.focus();
  }

  function close(focusButton = true) {
    if (pop.hidden) return;
    pop.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    stopOutside?.();
    stopOutside = null;
    if (focusButton) button.focus();
  }

  function choose(item) {
    if (!item) return;
    value = item.id;
    renderButton();
    close();
    onSelect(item.id);
  }

  button.addEventListener('click', () => (pop.hidden ? open() : close()));
  search.addEventListener('input', renderList);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(visible[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') close(false);
  });
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => {
    const li = e.target.closest('.picker-option');
    if (li) choose(visible[+li.dataset.index]);
  });
  onWidthChange(() => close(false));

  return {
    set(newItems, newValue, newRecent = []) {
      items = newItems;
      recent = newRecent;
      value = newValue;
      renderButton();
      if (!pop.hidden) renderList();
    },
  };
}
