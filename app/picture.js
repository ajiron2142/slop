import { el } from './dom.js';
import { highlight } from './highlight.js';

// A picture in a reply, the one look every picture has (sandbox pictures): its title,
// two tabs, Image and SVG (the source), and one Copy that copies what the tab shows, the image as a
// PNG or the SVG text. The SVG is shown as an image (a data: URL), never as part of the page, so
// nothing in it can run. On white in every theme: pictures are drawn for white.

const COPY_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';

// An SVG as a data: URL, base64 so any text in it survives.
export function svgUrl(svg) {
  const bytes = new TextEncoder().encode(svg);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}

// Draws an image at twice its size on white: { canvas, w, h } (its own size), or null if it can't be drawn.
export async function drawOnWhite(src, view = window) {
  const pic = new view.Image();
  pic.src = src;
  try { await pic.decode(); } catch { return null; }
  const w = pic.naturalWidth || 300;
  const h = pic.naturalHeight || 150;
  const canvas = view.document.createElement('canvas');
  canvas.width = w * 2;
  canvas.height = h * 2;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(pic, 0, 0, canvas.width, canvas.height);
  return { canvas, w, h };
}

// The card for one SVG, already checked to be a picture. Its title is the SVG's own <title>, else "Picture n".
export function pictureCard(svg, n) {
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement; // inert: nothing in it runs
  const title = root.querySelector(':scope > title')?.textContent.replace(/\s+/g, ' ').trim() || `Picture ${n}`;

  const img = el('img');
  img.src = svgUrl(svg);
  img.alt = title;
  if (!root.hasAttribute('width')) img.classList.add('fill'); // only a viewBox: as wide as the reply
  const paper = el('div', 'picture-paper');
  paper.append(img);
  const code = el('code', 'language-svg', svg);
  const source = el('pre', 'picture-source');
  source.append(code);
  source.hidden = true;

  const tabs = el('div', 'picture-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', `${title}: show as`);
  const tab = (label, shows) => {
    const b = el('button', '', label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(shows === paper));
    b.addEventListener('click', () => {
      for (const t of tabs.children) t.setAttribute('aria-selected', String(t === b));
      paper.hidden = shows !== paper;
      source.hidden = shows !== source;
      if (shows === source) highlight(code, 'xml');
    });
    return b;
  };
  tabs.append(tab('Image', paper), tab('SVG', source));

  const copy = el('button', 'picture-copy');
  copy.type = 'button';
  copy.innerHTML = COPY_ICON;
  const label = el('span', '', 'Copy');
  copy.append(label);
  copy.addEventListener('click', async () => {
    const view = copy.ownerDocument.defaultView;
    try {
      if (!source.hidden) await view.navigator.clipboard.writeText(svg);
      else {
        const drawn = await drawOnWhite(img.src, view);
        if (!drawn) throw new Error('not drawn');
        const png = await new Promise((resolve) => drawn.canvas.toBlob(resolve, 'image/png'));
        await view.navigator.clipboard.write([new view.ClipboardItem({ 'image/png': png })]);
      }
      label.textContent = 'Copied';
    } catch {
      label.textContent = 'Copy failed';
    }
    setTimeout(() => { label.textContent = 'Copy'; }, 1200);
  });

  const head = el('div', 'picture-head');
  head.append(el('span', 'picture-title', title), tabs, copy);
  const card = el('div', 'picture');
  card.append(head, paper, source);
  return card;
}
