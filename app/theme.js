// Themes are the <link data-theme> tags in index.html. Applying one sets
// its class on every .themed element (sidebar, chat, settings).
export function listThemes() {
  const links = [...document.querySelectorAll('link[data-theme]')];
  return [{ id: '', name: 'Default' }, ...links.map((l) => ({ id: l.dataset.theme, name: l.dataset.name }))];
}

export function applyTheme(id) {
  for (const node of document.querySelectorAll('.themed')) {
    node.className = node.className.replace(/\btheme-\S+/g, '').trim();
    if (id) node.classList.add(`theme-${id}`);
  }
}

// Fetch every theme font in the background so later switches are instant.
export function warmFonts() {
  const warm = () => document.fonts.forEach((f) => f.load().catch(() => {}));
  'requestIdleCallback' in window ? requestIdleCallback(warm) : setTimeout(warm, 1500);
}
