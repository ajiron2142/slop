import { el } from './dom.js';
import { highlight } from './highlight.js';
import { svgUrl } from './picture.js';
import { drawOnWhite } from './copy.js';

// SVG pictures (optional add-on): a ```svg block in a reply is shown as a picture, once the reply has
// finished, in any chat (no sandbox needed). It's shown as an image (a data: URL), never as part of
// the page, so nothing in it can run. Its header has the picture's title, two tabs, Image and SVG
// (the source), and one Copy that copies what the tab shows: the image as a PNG, or the SVG text.
// A block that breaks the rule below stays a code block, with a note saying why.
// The SVG stays in the reply's text (so Copy reply and Edit keep it), but isn't sent back to the
// model: there it becomes "[Picture 1: <title> …]", so a picture costs its tokens once.
//
// To remove it: delete this file, styles/components/svg.css and tests/suites/svg.mjs, their lines
// in index.html and tests/run.mjs, and the lines marked "svg" in main.js.

const MAX_BYTES = 200 * 1024;
const SVG_NS = 'http://www.w3.org/2000/svg';
const FENCE = /^```svg[ \t]*\n([\s\S]*?)\n```[ \t]*$/gm;
const COPY_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';

// For the system prompt: one line.
export const svgPrompt = 'A ```svg code block in your reply is shown to the user as a picture, on white.';

// The rule: at most 200 KB, well-formed, with one <svg> root in the SVG namespace.
// Returns { root } (the parsed <svg>) or { problem } (what's wrong, in words).
function check(text) {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_BYTES) return { problem: `it's ${Math.ceil(bytes / 1024)} KB, and a picture can be at most ${MAX_BYTES / 1024} KB` };
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml'); // an inert document: nothing in it runs
  const error = doc.querySelector('parsererror');
  if (error) return { problem: `the SVG isn't well-formed (${error.textContent.trim().split('\n')[0].slice(0, 120)})` };
  const root = doc.documentElement;
  if (root.localName !== 'svg' || root.namespaceURI !== SVG_NS) return { problem: `it needs one <svg> element with xmlns="${SVG_NS}" around everything` };
  return { root };
}

const titleOf = (root, n) => root.querySelector(':scope > title')?.textContent.replace(/\s+/g, ' ').trim() || `Picture ${n}`;

// The codeBlock hook (components/messages.js): the n-th ```svg block of a finished reply.
export function svgBlock(lang, text, n) {
  if (lang !== 'svg') return null;
  const { root, problem } = check(text);
  if (problem) return { note: el('div', 'svg-note', `Not shown as a picture: ${problem}.`) };
  const title = titleOf(root, n);

  const img = el('img');
  img.src = svgUrl(text);
  img.alt = title;
  if (!root.hasAttribute('width')) img.classList.add('fill'); // only a viewBox: as wide as the reply
  const picture = el('div', 'svg-paper');
  picture.append(img);
  const code = el('code', 'language-svg', text);
  const source = el('pre', 'svg-source');
  source.append(code);
  source.hidden = true;

  const tabs = el('div', 'svg-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', `${title}: show as`);
  const tab = (label, shows) => {
    const b = el('button', '', label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(shows === picture));
    b.addEventListener('click', () => {
      for (const t of tabs.children) t.setAttribute('aria-selected', String(t === b));
      picture.hidden = shows !== picture;
      source.hidden = shows !== source;
      if (shows === source) highlight(code, 'xml');
    });
    return b;
  };
  tabs.append(tab('Image', picture), tab('SVG', source));

  const copy = el('button', 'svg-copy');
  copy.type = 'button';
  copy.innerHTML = COPY_ICON;
  const label = el('span', '', 'Copy');
  copy.append(label);
  copy.addEventListener('click', async () => {
    const view = copy.ownerDocument.defaultView;
    try {
      if (!source.hidden) await view.navigator.clipboard.writeText(text);
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

  const head = el('div', 'svg-head');
  head.append(el('span', 'svg-title', title), tabs, copy);
  const block = el('div', 'svg-block');
  block.append(head, picture, source);
  return { node: block };
}

// A reply's text as the model gets it back: each ```svg block that's shown as a picture becomes a
// short line, numbered as on screen. One shown as code (it broke the rule) stays, so the model can fix it.
export function svgForModel(content) {
  let n = 0;
  return content.replace(FENCE, (block, text) => {
    n++;
    const { root } = check(text);
    return root ? `[Picture ${n}: ${titleOf(root, n)} (an SVG shown to the user; left out here)]` : block;
  });
}
