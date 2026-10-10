# Plan: a bare-minimum JS sandbox (prototype)

Status: planned, nothing built. Next step is phase 1 below. Design changes still need a mockup first (CLAUDE.md).

## What it's for

The model can run a short piece of JavaScript to work something out exactly (maths, dates, parsing,
reshaping data from the conversation) and to draw an SVG picture (a chart, a diagram), which shows in
the reply. Nothing it runs can reach the network, the page, your files or your storage.

## Fixed rules

- One tool, `run_js`, with `{ "code": "…" }`. It's offered only when **Settings → Let the model run code
  (in a sandbox)** is on. Off by default.
- The code runs in a Worker inside a sandboxed iframe. It's stopped after **5 seconds**. If it hasn't
  finished, the result says so and shows the right form: keep it under 5 s.
- What comes back to the model: everything passed to `console.log`, then the value of the last
  expression. It's cut at **20,000 characters**, and the result says where it was cut.
- A picture: the code calls `show(svgText)`, at most **3 times** per run, at most **200 KB** each.
  Anything that isn't one `<svg …>…</svg>` element is refused with a message that shows the right form.
  The model gets "Showed 1 picture (12 KB)".
- Pictures are shown as `<img src="data:image/svg+xml,…">`, so nothing inside them can run. They're
  saved with the chat as part of the reply, under its text, in order.
- No network, no `importScripts`, no `fetch`, no WebSocket: the sandbox's own policy forbids them.
- An error in the code comes back as `Error: <message> (line N)`.

## How it's built (no libraries)

- **`sandbox/sandbox.html`** is its own page with its own strict policy:
  `default-src 'none'; script-src 'self'; worker-src blob:`. It loads only `sandbox/runner.js`.
  It has to be a separate file: an inline (`srcdoc`) frame would take slop's own policy instead.
- **The iframe** uses `sandbox="allow-scripts"`, with no `allow-same-origin`. It gets an opaque origin:
  no cookies, no storage, and no access to slop's page.
- **`runner.js`** gets `{ id, code }` by `postMessage` and starts a Worker from a blob. The worker has
  the same no-network policy. The runner ends the Worker after 5 s, which stops even an endless loop
  without freezing the page, then posts `{ id, out, pictures, error }` back.
- **`app/sandbox.js`** is the add-on, hooked in with lines marked `// sandbox`. It holds one hidden
  iframe, sends a job, and accepts a reply only from that iframe's window, with a matching `id`.
  It also defines the tool and its result text.
- **Changes outside the add-on:**
  - `index.html` CSP: add `frame-src 'self'`.
  - `nginx.conf` sends `frame-ancestors 'none'` on every page. `/sandbox/` needs its own `location`
    block with `frame-ancestors 'self'`, or the iframe won't load.
- **Helpers inside the sandbox**, hand-written in about 150 lines with no libraries:
  - `show(svg)`, described above.
  - `svg(width, height, ...children)` and `el(tag, attrs, ...children)` to build SVG text.
  - `chart.bar(rows)`, `chart.line(rows)`: simple charts that pick up the theme's colours, passed in
    with each job.
  - `table(rows)`: returns a markdown table the model can use in its reply.
  - `random(seed)`: a seeded random, so the same code always gives the same result.

**Libraries needed to start: none.** If richer charts are wanted later, a small vendored charting library
could be considered then, but the hand-written helpers should cover bars, lines and simple diagrams.

## Phases

1. **Runner only, no UI.** Build `sandbox.html`, `runner.js`, `app/sandbox.js` and
   `tests/suites/sandbox.mjs`. Checks:
   - code runs and returns its output;
   - an endless loop is stopped at 5 s, and the page stays responsive;
   - `fetch` and `importScripts` fail;
   - `parent.document`, cookies and localStorage aren't reachable;
   - output is cut at 20,000 characters;
   - `show()` refuses anything that isn't a single `<svg>`;
   - a reply posted from anywhere but the iframe is ignored.
2. **The tool and the setting.** Offer `run_js` when the setting is on, and record its step in the
   activity. The reply tree shows it as a place called "Sandbox". Mock up how a picture looks in a reply
   (on a phone and on a desktop) before building that part.
3. **Helpers** (`svg`, `chart.bar`, `chart.line`, `table`, `random`) with checks, and a short note in the
   system prompt saying what the tool can do.
4. **Later, maybe:** read-only data from slop's own tools inside the sandbox (for example a folder file
   read into the code), sent in by slop. Never a way for the code to reach anything itself.

## To remove it (when built)

Delete `sandbox/`, `app/sandbox.js`, its CSS and test suite, and the lines marked "sandbox" in main.js,
index.html, nginx.conf and tests/run.mjs.
