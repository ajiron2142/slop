# Plan: a bare-minimum JS sandbox (prototype)

Status: phase 1 built (the runner, no UI). Next step is phase 2 below. Design changes still need a mockup first (CLAUDE.md).

## What it's for

The model can run a short piece of JavaScript to work something out exactly (maths, dates, parsing,
reshaping data from the conversation) and to draw an SVG picture (a chart, a diagram), which shows in
the reply. Nothing it runs can reach the network, the page, your files or your storage.

## Fixed rules

- One tool, `run_js`, with `{ "code": "…" }`. It's turned on per chat, like a folder or GitLab: the
  paperclip button becomes a **+** button, and its menu lists each item with an icon: Attach files, then
  Connect folder, Connect GitLab project and **Sandbox**. The Sandbox row says Off, or **Enabled** in
  green. When it's switched on, its icon plays a short one-time animation, then part of the icon stays
  lit green. The icon is still to pick from https://claude.ai/artifact/HqhgLYAVgKayBQ8sijdmTd; the cube
  is the front runner. It also adds a **Sandbox** chip, with the same lit icon, under the message box
  (× turns it off again). It's offered to the model only in chats where that chip is on, so ordinary chats still
  send no tools, and they keep working with models that don't support tools.
- The code runs in a Worker inside a sandboxed iframe. It's stopped after **5 seconds**. If it hasn't
  finished, the result says so and shows the right form: keep it under 5 s.
- What comes back to the model: everything passed to `console.log`, then the value of the last
  expression. It's cut at **20,000 characters**, and the result says where it was cut.
- A picture: the code calls `show(svgText)`, at most **3 times** per run, at most **200 KB** each.
  Anything that isn't one `<svg …>…</svg>` element is refused with a message that shows the right form.
  The model gets "Showed 1 picture (12 KB)".
- Pictures are shown as `<img src="data:image/svg+xml,…">`, so nothing inside them can run. They're
  saved with the chat as part of the reply (`msg.pictures`), under its text, in order. They're never sent
  back to the model.
- Each picture is in a block with the same frame and tinted header as a code block: "Picture 1 · SVG"
  on the left and **Copy SVG** (copy icon) on the right, which copies the SVG text.
- **Copy reply** follows one fixed rule, with nothing asked of the model: the reply's text exactly as
  written, then one short line per picture, `![Picture 1][picture-1]`, then at the very bottom the
  definitions, `[picture-1]: data:image/svg+xml;base64,…`. This is standard markdown, so the text stays
  readable and the encoded pictures stay out of the way. The HTML copy is made from that markdown, so it
  carries the pictures as images with no special handling. Still to check: whether Teams keeps pasted data-URI
  images. Outlook and Word do. GitHub's markdown drops them.
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
2. **The tool and the chip.** Change the paperclip to a **+** with icons in its menu, as mocked up at
   https://claude.ai/artifact/UUMgQsfc7SLtndSbum1GVz (this part is core, not the add-on), then add the
   **Enable sandbox** item and the **Sandbox** chip, each marked `// sandbox`. Offer `run_js` only while the chip is on, and record its step in the
   activity. The reply tree shows it as a place called "Sandbox". Mock up the chip and how a picture
   looks in a reply (on a phone and on a desktop) before building that part.
3. **Helpers** (`svg`, `chart.bar`, `chart.line`, `table`, `random`) with checks, and a short note in the
   system prompt saying what the tool can do.
4. **Later, maybe:** read-only data from slop's own tools inside the sandbox (for example a folder file
   read into the code), sent in by slop. Never a way for the code to reach anything itself.

## Phase 1 as built

- Each job gets a fresh Worker, so nothing carries over between runs. The code runs with indirect `eval`
  (the sandbox's policy allows `'unsafe-eval'`, which only reaches the Worker and the empty sandbox page),
  so the last expression's value can come back; a promise as the last value is waited for.
- The runner checks again whatever the Worker posts (pictures, output length), so code that calls
  `postMessage` itself gets no further than `console.log` and `show()`.
- `show()` refuses, with the right form: a non-string, text not starting with `<svg` and ending with
  `</svg>`, a 4th call, a picture over 200 KB. The runner then refuses anything that isn't well-formed XML
  with one `<svg>` in the SVG namespace at the top.
- A syntax error gets its line by loading the code once more as a script with `throw 0;` in front, so it
  can't run.
- `app/sandbox.js` gives up after 10 s if the sandbox never answers (for example when it can't load).
- `app/sandbox.js` already has `SANDBOX_TOOLS`, `isSandboxTool`, `runJs`, `sandboxResult` and
  `runSandboxTool` for phase 2; nothing calls them yet.

## To remove it

Delete `sandbox/`, `app/sandbox.js` and `tests/suites/sandbox.mjs`, the lines marked "sandbox" in
index.html, nginx.conf and tests/run.mjs, the Dockerfile's `sandbox/` line and the README's mentions.
After phase 2, also its CSS and the lines marked "sandbox" in main.js and components/composer.js.
