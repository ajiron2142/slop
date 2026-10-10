import { renderMarkdown } from './markdown.js';

// Copies a reply in two formats at once: formatted HTML, which Teams, Outlook and Word paste,
// and the markdown as plain text for everything else. The HTML gets plain inline styles (the
// kind Outlook understands), so it pastes in neutral colours whatever theme is on screen. SVG images
// become PNG in the HTML, since Outlook blocks SVG ones; the markdown keeps them as SVG.
const MONO = 'font-family:Consolas,Menlo,monospace';
const STYLES = [
  ['code', `${MONO};font-size:90%;background:#f2f2f2;padding:1px 4px;border-radius:3px`],
  ['pre', `${MONO};font-size:13px;line-height:1.5;background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:10px 12px;white-space:pre-wrap`],
  ['pre code', 'background:none;padding:0;font-size:inherit'],
  ['table', 'border-collapse:collapse'],
  ['th, td', 'border:1px solid #d0d7de;padding:4px 8px;text-align:left;vertical-align:top'],
  ['th', 'border:1px solid #d0d7de;padding:4px 8px;text-align:left;background:#f6f8fa'],
  ['blockquote', 'margin:0;padding-left:10px;border-left:3px solid #d0d7de;color:#555'],
];

export async function replyHtml(markdown, view = window) {
  const doc = new DOMParser().parseFromString(renderMarkdown(markdown), 'text/html');
  for (const [selector, css] of STYLES) for (const node of doc.body.querySelectorAll(selector)) node.setAttribute('style', css);
  for (const img of doc.body.querySelectorAll('img[src^="data:image/svg+xml"]')) await asPng(img, view);
  return doc.body.innerHTML;
}

// Draws the SVG at twice its size on white and swaps it for that PNG, shown at its own size.
// One that can't be drawn stays as it is.
async function asPng(img, view) {
  const pic = new view.Image();
  pic.src = img.getAttribute('src');
  try { await pic.decode(); } catch { return; }
  const w = pic.naturalWidth || 300;
  const h = pic.naturalHeight || 150;
  const canvas = view.document.createElement('canvas');
  canvas.width = w * 2;
  canvas.height = h * 2;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(pic, 0, 0, canvas.width, canvas.height);
  img.setAttribute('src', canvas.toDataURL('image/png'));
  img.setAttribute('width', String(w));
  img.setAttribute('height', String(h));
}

// `view` is the window the Copy button is in: the tab, or the mini window (each has its own clipboard access).
export async function copyReply(markdown, view = window) {
  const { clipboard } = view.navigator;
  try {
    // The HTML is given as a promise, so the copy still counts as part of the click while pictures are drawn.
    await clipboard.write([new view.ClipboardItem({
      'text/html': replyHtml(markdown, view).then((html) => new Blob([html], { type: 'text/html' })),
      'text/plain': new Blob([markdown], { type: 'text/plain' }),
    })]);
  } catch {
    await clipboard.writeText(markdown); // browsers without rich copy still get the text
  }
}
