import { el } from './dom.js';
import { svgUrl, pictureCard } from './picture.js';

// SVG pictures (optional add-on): a ```svg block in a reply is shown as a picture, once the reply has
// finished, in any chat (no sandbox needed), with the card every picture has (picture.js).
// A block that breaks the rule below stays a code block, with a note saying why; one exactly the
// same as a picture the sandbox already showed in that reply isn't shown twice.
// The SVG stays in the reply's text (so Copy reply and Edit keep it), but isn't sent back to the
// model: there it becomes "[Picture 1: <title> …]", so a picture costs its tokens once. Copy reply's
// formatted copy has each one as a picture (copy.js turns it into a PNG for Outlook and Teams).
//
// To remove it: delete this file, styles/components/svg.css and tests/suites/svg.mjs, their lines
// in index.html and tests/run.mjs, and the lines marked "svg" in main.js and copy.js.

const MAX_BYTES = 200 * 1024;
const SVG_NS = 'http://www.w3.org/2000/svg';
const FENCE = /^```svg[ \t]*\n([\s\S]*?)\n```[ \t]*$/gm;

// For the system prompt: one line.
export const svgPrompt = 'A ```svg code block in your reply is shown to the user as a picture, on white. Write & as &amp;, draw lines before shapes so shapes sit on top, and fit the viewBox to the drawing.';

// The rule: at most 200 KB, well-formed, with one <svg> root in the SVG namespace. One that isn't
// well-formed and has a bare & (the most common slip) gets its own plain note instead of the browser's
// parser message; an & in a comment or CDATA is fine, so it's only looked for when parsing fails.
// Returns { root } (the parsed <svg>) or { problem } (what's wrong, in words).
function check(text) {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_BYTES) return { problem: `it's ${Math.ceil(bytes / 1024)} KB, and a picture can be at most ${MAX_BYTES / 1024} KB` };
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml'); // an inert document: nothing in it runs
  const error = doc.querySelector('parsererror');
  if (error && /&(?!(?:[a-zA-Z][\w.-]*|#\d+|#x[0-9a-fA-F]+);)/.test(text)) return { problem: 'it has a bare & (an & must be written &amp;)' };
  if (error) return { problem: `the SVG isn't well-formed (${error.textContent.trim().split('\n')[0].slice(0, 120)})` };
  const root = doc.documentElement;
  if (root.localName !== 'svg' || root.namespaceURI !== SVG_NS) return { problem: `it needs one <svg> element with xmlns="${SVG_NS}" around everything` };
  return { root };
}

const titleOf = (root, n) => root.querySelector(':scope > title')?.textContent.replace(/\s+/g, ' ').trim() || `Picture ${n}`;

// The codeBlock hook (components/messages.js): the n-th ```svg block of a finished reply.
export function svgBlock(lang, text, n, msg) {
  if (lang !== 'svg') return null;
  if (msg?.pictures?.some((p) => p.trim() === text.trim())) return { node: document.createComment('the same as a picture shown under this reply') };
  const { problem } = check(text);
  if (problem) return { note: el('div', 'svg-note', `Not shown as a picture: ${problem}.`) };
  return { node: pictureCard(text, n) };
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

// For Copy reply's formatted copy (copy.js): each ```svg code block that's a picture becomes the picture.
export function svgBlocksAsImages(doc) {
  let n = 0;
  for (const code of doc.querySelectorAll('pre > code.language-svg')) {
    n++;
    const text = code.textContent.replace(/\n$/, '');
    const { root } = check(text);
    if (!root) continue;
    const img = doc.createElement('img');
    img.setAttribute('src', svgUrl(text));
    img.setAttribute('alt', titleOf(root, n));
    code.parentElement.replaceWith(img);
  }
}
