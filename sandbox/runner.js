// sandbox: runs one piece of the model's code per job, inside sandbox.html.
// slop posts { id, code, reads }; the runner starts a fresh Worker for it, ends that Worker after 5 s
// (which stops even an endless loop without freezing anything), and posts back
// { id, out, pictures, error }. The Worker takes this page's policy, so it has no network either.
//
// The runner is the authority on the rules: whatever the Worker posts is checked again here, so
// code that posts its own messages gets no further than console.log and show() would.

const TIME_LIMIT = 5000; // ms
const MAX_OUT = 20000; // characters
const MAX_PICTURES = 3;
const MAX_PICTURE_BYTES = 200 * 1024;

// The right form of a picture, and the rule show() and the runner both apply. Returns an error
// message, or '' when the text is fine. The Worker gets its own copy (see below).
function svgProblem(svg, count, maxPictures, maxBytes) {
  const form = 'show() takes one SVG element as text, like show(\'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">…</svg>\')';
  if (typeof svg !== 'string') return `${form}; it got ${typeof svg}.`;
  if (count >= maxPictures) return `show() can be called at most ${maxPictures} times per run.`;
  const bytes = new TextEncoder().encode(svg).length;
  if (bytes > maxBytes) return `show() takes at most ${maxBytes / 1024} KB per picture; this one is ${Math.ceil(bytes / 1024)} KB.`;
  if (!/^<svg[\s>]/.test(svg.trim()) || !svg.trim().endsWith('</svg>')) return `${form}, starting with <svg and ending with </svg>.`;
  return '';
}

// Runs inside the Worker. Kept as a function so it is checked like the rest of this file, then
// turned into the Worker's source.
function worker(svgProblem, MAX_OUT, MAX_PICTURES, MAX_PICTURE_BYTES, sandboxHelpers) {
  const post = postMessage.bind(self);
  const Markup = sandboxHelpers(self); // el, svg, chart, table, random (helpers.js)
  const pictures = [];
  let length = 0; // characters written so far, including any past the limit

  const format = (v) => {
    if (typeof v === 'string') return v;
    if (v instanceof Markup) return v.text;
    if (v instanceof Error) return `${v.name}: ${v.message}`;
    if (typeof v === 'bigint') return `${v}n`;
    if (v === undefined || typeof v === 'function' || typeof v === 'symbol') return String(v);
    try { return JSON.stringify(v) ?? String(v); } catch { return String(v); }
  };
  const write = (text) => {
    if (length < MAX_OUT) post({ out: text.slice(0, MAX_OUT - length) });
    length += text.length;
  };
  const log = (...args) => write(`${args.map(format).join(' ')}\n`);
  for (const name of ['log', 'info', 'warn', 'error', 'debug']) console[name] = log;

  self.show = (svg) => {
    if (svg instanceof Markup) svg = svg.text;
    const problem = svgProblem(svg, pictures.length, MAX_PICTURES, MAX_PICTURE_BYTES);
    if (problem) throw new Error(problem);
    pictures.push(svg.trim());
  };

  // "TypeError: x is not a function (line 3)", the line counted in the model's code.
  const describe = (e) => {
    const text = e instanceof Error ? `${e.name}: ${e.message}` : `Error: ${format(e)}`;
    const line = /code\.js:(\d+)/.exec(e?.stack ?? '')?.[1];
    return line ? `${text} (line ${line})` : text;
  };

  self.onmessage = async ({ data: { code, reads } }) => {
    self.onmessage = null;
    self.reads = Object.freeze(reads.map((r) => Object.freeze(r)));
    let error = '';
    try {
      let value = (0, eval)(`${code}\n//# sourceURL=code.js`);
      if (typeof value?.then === 'function') value = await value;
      if (value !== undefined) write(format(value));
    } catch (e) {
      error = describe(e);
    }
    post({ done: true, length, pictures, error });
  };
}

const source = `(${worker})(${svgProblem}, ${MAX_OUT}, ${MAX_PICTURES}, ${MAX_PICTURE_BYTES}, ${sandboxHelpers});`; // sandboxHelpers: helpers.js
const workerUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));

// A picture must also be well-formed XML whose only element at the top is <svg>.
function pictureProblem(svg, count) {
  const problem = svgProblem(svg, count, MAX_PICTURES, MAX_PICTURE_BYTES);
  if (problem) return problem;
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg') {
    return 'show() takes one well-formed <svg xmlns="http://www.w3.org/2000/svg" …>…</svg> element, with nothing after it.';
  }
  return '';
}

// eval gives no line for code that doesn't parse; the browser does when the code is loaded as a
// script. "throw 0;" goes first, on the same line, so nothing in it can run should it parse after all.
function syntaxLine(code) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([`throw 0;${code}`], { type: 'text/javascript' }));
    const w = new Worker(url);
    const done = (line) => { clearTimeout(timer); w.terminate(); URL.revokeObjectURL(url); resolve(line); };
    const timer = setTimeout(() => done(0), 1000);
    w.onerror = (e) => { e.preventDefault(); done(/SyntaxError/.test(e.message) ? e.lineno : 0); };
  });
}

// What the other tools returned in this reply, as { tool, args, text }: the tool's name, the arguments
// it was called with (an object) and its result. Anything else is left out.
const parsed = (json) => { try { const v = JSON.parse(json); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const cleanReads = (reads) => (Array.isArray(reads) ? reads : [])
  .filter((r) => typeof r?.tool === 'string' && typeof r.text === 'string')
  .map((r) => ({ tool: r.tool, args: parsed(r.args), text: r.text }));

function run(id, code, reads) {
  const w = new Worker(workerUrl);
  let out = '';
  let finished = false;
  const finish = (reply) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    w.terminate();
    parent.postMessage({ id, ...reply }, '*');
  };
  const cutNote = (total) => `\n[Output cut at ${MAX_OUT.toLocaleString('en-US')}${total ? ` of ${total.toLocaleString('en-US')}` : ''} characters.]`;

  const timer = setTimeout(() => finish({
    out: out.length >= MAX_OUT ? out + cutNote() : out,
    pictures: [],
    error: `Stopped after ${TIME_LIMIT / 1000} s: the code didn't finish. Keep each run under ${TIME_LIMIT / 1000} s.`,
  }), TIME_LIMIT);

  w.onmessage = async ({ data }) => {
    if (typeof data?.out === 'string') out = (out + data.out).slice(0, MAX_OUT);
    if (!data?.done || finished) return;
    clearTimeout(timer);
    w.terminate();
    const pictures = Array.isArray(data.pictures) ? data.pictures : [];
    let error = typeof data.error === 'string' ? data.error : '';
    if (/^SyntaxError: /.test(error) && !/\(line \d+\)$/.test(error)) {
      const line = await syntaxLine(code);
      if (line) error += ` (line ${line})`;
    }
    for (let i = 0; i < pictures.length && !error; i++) error = pictureProblem(pictures[i], i);
    const total = Number(data.length) || 0;
    finish({ out: total > MAX_OUT ? out + cutNote(total) : out, pictures: error ? [] : pictures, error });
  };
  w.onerror = (e) => {
    e.preventDefault();
    finish({ out, pictures: [], error: `Error: ${e.message || 'the code could not run'}` });
  };
  w.postMessage({ code: String(code), reads: cleanReads(reads) });
}

// Jobs are taken only from the page that holds this frame.
addEventListener('message', (e) => {
  if (e.source !== parent || typeof e.data?.id !== 'string' || typeof e.data.code !== 'string') return;
  run(e.data.id, e.data.code, e.data.reads);
});

parent.postMessage({ ready: true }, '*');
