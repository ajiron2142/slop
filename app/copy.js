import { renderMarkdown } from './markdown.js';
import { drawOnWhite } from './picture.js';
import { svgBlocksAsImages } from './svg.js'; // svg

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
  svgBlocksAsImages(doc); // svg: a ```svg block pastes as its picture
  for (const [selector, css] of STYLES) for (const node of doc.body.querySelectorAll(selector)) node.setAttribute('style', css);
  for (const img of doc.body.querySelectorAll('img[src^="data:image/svg+xml"]')) await asPng(img, view);
  return doc.body.innerHTML;
}

// Part of a reply copied with Ctrl+C or the menu: the selected text, and its HTML with nothing of the
// theme in it (no classes, no styles from the page, no buttons or hidden parts), styled like Copy reply.
// Without this the browser copies the page's colours, which Teams and Outlook keep.
export function copySelection(e, view = window) {
  const sel = view.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return;
  const box = view.document.createElement('div');
  for (let i = 0; i < sel.rangeCount; i++) box.append(sel.getRangeAt(i).cloneContents());
  for (const node of box.querySelectorAll('button, [hidden], .code-head, .picture-head')) node.remove();
  for (const node of box.querySelectorAll('*')) { node.removeAttribute('class'); node.removeAttribute('style'); }
  for (const [selector, css] of STYLES) for (const node of box.querySelectorAll(selector)) node.setAttribute('style', css);
  e.clipboardData.setData('text/plain', sel.toString());
  e.clipboardData.setData('text/html', box.innerHTML);
  e.preventDefault();
}

// Swaps an SVG image for a PNG of it, shown at its own size. One that can't be drawn stays as it is.
async function asPng(img, view) {
  const drawn = await drawOnWhite(img.getAttribute('src'), view);
  if (!drawn) return;
  img.setAttribute('src', drawn.canvas.toDataURL('image/png'));
  img.setAttribute('width', String(drawn.w));
  img.setAttribute('height', String(drawn.h));
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
