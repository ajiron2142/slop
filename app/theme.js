// Themes are the <link data-theme> tags in index.html. Applying one sets
// its class on every .themed element (sidebar, chat, settings).
export function listThemes() {
  const links = [...document.querySelectorAll('link[data-theme]')];
  return [{ id: '', name: 'Default' }, ...links.map((l) => ({ id: l.dataset.theme, name: l.dataset.name }))];
}

export function applyTheme(id) {
  // Only the chosen theme's stylesheet is switched on; the rest stay downloaded but idle.
  for (const link of document.querySelectorAll('link[data-theme]')) link.media = link.dataset.theme === id ? 'all' : 'not all';
  for (const node of document.querySelectorAll('.themed')) {
    node.className = node.className.replace(/\btheme-\S+/g, '').trim();
    if (id) node.classList.add(`theme-${id}`);
  }
  rememberForBoot({ theme: id });
}

// boot.js reads this before the first paint, so a reload shows the right theme straight away.
export function rememberForBoot(changes) {
  try {
    const saved = JSON.parse(localStorage.getItem('chat-boot')) || {};
    localStorage.setItem('chat-boot', JSON.stringify({ ...saved, ...changes }));
  } catch {}
}

// Fetch every theme font in the background so switching themes is instant. Called when the
// theme picker first opens, so everyday visits don't download fonts for themes nobody picked.
let warmed = false;
export function warmFonts() {
  if (warmed) return;
  warmed = true;
  const warm = () => document.fonts.forEach((f) => f.load().catch(() => {}));
  'requestIdleCallback' in window ? requestIdleCallback(warm) : setTimeout(warm, 300);
}
