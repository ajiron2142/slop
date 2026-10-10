// Sandbox (optional add-on): the model can run a short piece of JavaScript to work something out
// exactly, and draw SVG pictures with show(). The code runs in a Worker inside a hidden, sandboxed
// iframe (sandbox/sandbox.html): it can't reach the network, this page, your files or your storage,
// and it's stopped after 5 seconds. See docs/plans/sandbox.md.
//
// It's turned on per chat from the + menu (a Sandbox chip shows it's on); only then is run_js offered.
// Pictures are saved with the reply (msg.pictures), shown under its text as images, so nothing in
// them can run, and never sent back to the model.
//
// To remove it: delete sandbox/, this file, styles/components/sandbox.css and tests/suites/sandbox.mjs,
// the lines marked "sandbox" in index.html, nginx.conf, tests/run.mjs, main.js, components/messages.js
// and components/composer.js, and the Dockerfile's sandbox/ line.

import { el } from './dom.js';

const FRAME_URL = 'sandbox/sandbox.html';
const COPY_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
const NO_ANSWER = 10000; // ms; the sandbox itself stops code at 5 s, so this only trips if it never loaded

export const SANDBOX_TOOLS = [{
  type: 'function',
  function: {
    name: 'run_js',
    description: 'Run JavaScript in a sandbox with no network, page or storage, to work something out exactly (maths, dates, parsing, reshaping data). ' +
      'Returns what console.log printed, then the value of the last expression, cut at 20,000 characters. Stopped after 5 seconds. ' +
      'show(svgText) shows an SVG picture in your reply (at most 3 per run, 200 KB each).',
    parameters: { type: 'object', properties: { code: { type: 'string', description: 'The JavaScript to run.' } }, required: ['code'] },
  },
}];

export const isSandboxTool = (name) => name === 'run_js';

let frame = null; // the hidden iframe, made on first use
let ready = null; // resolves once its runner is listening
let isReady = () => {}; // ready's resolve
const waiting = new Map(); // job id -> resolve

addEventListener('message', (e) => {
  // Only the iframe's own window can answer, and only for a job it was given.
  if (!frame || e.source !== frame.contentWindow) return;
  if (e.data?.ready) return isReady();
  const done = waiting.get(e.data?.id);
  if (!done) return;
  waiting.delete(e.data.id);
  done({
    out: typeof e.data.out === 'string' ? e.data.out : '',
    pictures: Array.isArray(e.data.pictures) ? e.data.pictures.filter((p) => typeof p === 'string') : [],
    error: typeof e.data.error === 'string' ? e.data.error : '',
  });
});

function open() {
  if (frame) return ready;
  ready = new Promise((resolve) => { isReady = resolve; });
  frame = document.createElement('iframe');
  frame.sandbox = 'allow-scripts'; // no allow-same-origin: an opaque origin
  frame.src = FRAME_URL;
  frame.hidden = true;
  frame.title = 'Sandbox';
  document.body.append(frame);
  return ready;
}

// Runs the code and resolves to { out, pictures, error }.
export function runJs(code) {
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      resolve({ out: '', pictures: [], error: `Error: the sandbox didn't answer within ${NO_ANSWER / 1000} s.` });
    }, NO_ANSWER);
    waiting.set(id, (run) => { clearTimeout(timer); resolve(run); });
    open().then(() => {
      if (waiting.has(id)) frame.contentWindow.postMessage({ id, code: String(code) }, '*'); // an opaque origin can only be addressed as '*'
    });
  });
}

// What the model gets back: the output, then any error, then the pictures shown.
export function sandboxResult({ out, pictures, error }) {
  const kb = (svg) => Math.max(1, Math.round(new TextEncoder().encode(svg).length / 1024));
  const parts = [];
  if (out) parts.push(out.replace(/\n$/, ''));
  if (error) parts.push(error);
  if (pictures.length) parts.push(`Showed ${pictures.length} picture${pictures.length === 1 ? '' : 's'} (${pictures.map((p) => `${kb(p)} KB`).join(', ')})`);
  return parts.join('\n') || '(no output)';
}

// For the tool loop: { label, result, pictures }. A run that ends in an error is a failed step.
export async function runSandboxTool(argsJson) {
  let code;
  try {
    code = JSON.parse(argsJson || '{}').code;
  } catch {
    code = undefined;
  }
  if (typeof code !== 'string' || !code.trim()) {
    return { label: "Couldn't run code", result: 'Error: run_js needs { "code": "…" } with the JavaScript to run.', pictures: [] };
  }
  const run = await runJs(code);
  return run.error
    ? { label: 'Ran code (failed)', result: `Error: the run failed.\n${sandboxResult(run)}`, pictures: run.pictures }
    : { label: 'Ran code', result: sandboxResult(run), pictures: run.pictures };
}

// An SVG as a data: URL, base64 so any text in it survives.
export function svgUrl(svg) {
  const bytes = new TextEncoder().encode(svg);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}

// A reply's pictures, under its text: each in a block like a code block, "Picture 1 · SVG" and Copy SVG.
export function picturesNode(msg) {
  if (!msg.pictures?.length) return null;
  const list = el('div', 'pictures');
  msg.pictures.forEach((svg, i) => {
    const copy = el('button', 'picture-copy');
    copy.type = 'button';
    copy.innerHTML = COPY_ICON;
    const label = el('span', '', 'Copy SVG');
    copy.append(label);
    copy.addEventListener('click', async () => {
      try {
        await copy.ownerDocument.defaultView.navigator.clipboard.writeText(svg);
        label.textContent = 'Copied';
      } catch {
        label.textContent = 'Copy failed';
      }
      setTimeout(() => { label.textContent = 'Copy SVG'; }, 1200);
    });
    const head = el('div', 'picture-head');
    head.append(el('span', '', `Picture ${i + 1} · SVG`), copy);
    const img = el('img');
    img.src = svgUrl(svg);
    img.alt = `Picture ${i + 1}`;
    const block = el('div', 'picture');
    block.append(head, img);
    list.append(block);
  });
  return list;
}

// What Copy reply copies, by one fixed rule: the text as written, a line per picture, and the
// pictures themselves as reference definitions at the very bottom, so the text stays readable.
export function replyMarkdown(msg) {
  const pics = msg.pictures ?? [];
  if (!pics.length) return msg.content;
  const lines = pics.map((_, i) => `![Picture ${i + 1}][picture-${i + 1}]`).join('\n\n');
  const defs = pics.map((svg, i) => `[picture-${i + 1}]: ${svgUrl(svg)}`).join('\n');
  return [msg.content, lines, defs].filter(Boolean).join('\n\n');
}
