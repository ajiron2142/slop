# Chat theme system

One base stylesheet plus one class per theme. Give this whole file to an AI along with your app's code, and ask it to adapt the app to this system.

**Download everything (CSS, self-hosted fonts, offline preview):**
https://github.com/ajiron2142/slop/archive/refs/heads/ccr-60b590e9-4higd9.zip
Unzip it and use the `themes/` folder. See **Files** below.

## How it works

- The **base** (top of the CSS below) sets the layout. Every color, font and spacing value comes from a CSS variable (a "token").
- A **theme** is one class on the chat container, for example `theme-lantern`. It sets the tokens, then adds a few extra rules for its details.
- **Switching themes** means changing that one class.

## Required HTML

The themes expect this structure and these class names. Rename either side so they match.

```html
<section class="chat theme-folio">
  <header class="chat-header">
    <h2 class="chat-title">App name</h2>
    <select class="model">…</select>
  </header>
  <div class="messages">
    <article class="msg user">
      <span class="who">You</span>
      <div class="body"><p>Question…</p></div>
    </article>
    <article class="msg assistant">
      <span class="who">Assistant</span>
      <div class="body"><!-- rendered markdown: p, ul, ol, pre>code, code --></div>
    </article>
  </div>
  <form class="composer">
    <textarea></textarea>
    <button class="send" type="button">Send</button>
  </form>
</section>
```

Notes:
- Keep the `.who` label on every message, even where a theme hides it.
- Add `streaming` to an assistant message's class while it streams (`msg assistant streaming`) to get the blinking caret.
- Put the theme class on `.chat`, not on `body`.

## Theme switcher

Swap the class and remember the choice. Roughly:

```js
function setTheme(name) {
  const chat = document.querySelector('.chat');
  chat.className = chat.className.replace(/\btheme-\S+/g, '').trim() + ' theme-' + name;
  settings.theme = name;
  saveSettings(settings);
}
```

Fill a `<select>` with the theme names from the table below and call `setTheme` on change.

## Splitting into files (optional)

The CSS below is one file. To manage it as `base.css` plus a `themes/` folder, split it at each `/* ====` comment header: the first block is `base.css`, and each following block is one theme file.

## Files

Everything lives in the `themes/` folder and works offline:

- `themes.css`: the base plus every theme (same CSS as at the bottom of this file).
- `fonts.css` and `fonts/`: every font the themes use, self-hosted. No Google Fonts or other outside requests.
- `preview.html`: open it in a browser to flip through all themes locally.

To use them in the app, copy `themes.css`, `fonts.css` and the `fonts/` folder next to each other and load both stylesheets, fonts first:

```html
<link rel="stylesheet" href="fonts.css">
<link rel="stylesheet" href="themes.css">
```

Browsers only download the fonts the active theme uses, so the folder's total size (about 3.5 MB) isn't loaded at once. Fonts cover Latin text; Japanese characters in Sumi fall back to a system font.

## Themes

| Class | Name | Look |
|---|---|---|
| `theme-folio` | Folio | A literary quarterly. No bubbles; your questions become pull-quotes and the first reply opens with a drop cap. |
| `theme-sumi` | Sumi | Ink on rice paper. Wide margins, tall leading, and one vermilion seal marking your turn. |
| `theme-grove` | Grove | A thin trunk runs down the page and every reply grows from it as a leaf. Your messages are buds. |
| `theme-raster` | Raster | International Typographic Style. A strict grid, numbered turns, heavy rules and exactly one red. |
| `theme-linen` | Linen | The everyday one. Warm neutrals, soft ink bubbles and a floating composer. |
| `theme-atelier` | Atelier | An architect's drafting sheet: blue grid, numbered turns with dimension lines, crop marks on every message. |
| `theme-tide` | Tide | Sea glass and morning fog. Frosted replies and pale green bubbles worn smooth by water. |
| `theme-draft` | Draft | The conversation as a screenplay, with your lines on the red half of the ribbon. |
| `theme-bauhaus` | Bauhaus | Circle, square, triangle. Primary colours used sparingly and a quarter-round corner on your messages. |
| `theme-basalt` | Basalt | Neutral graphite, lit in bone white. The quietest dark theme of the set. |
| `theme-airmail` | Airmail | Par avion. Striped borders, and every message you send arrives as a stamped postcard. |
| `theme-receipt` | Receipt | Every answer, itemised. Torn edges, order numbers, a barcode and a PRINT button. |
| `theme-lumen` | Lumen | One neon tube in a dark room. Pink for you, cyan for send, and a sign that hums. |
| `theme-prism` | Prism | Clean white with iridescent edges on your messages, the composer and the title. |
| `theme-sticky` | Sticky | Office sticky notes. Your messages handwritten on canary yellow, replies on blue, lime, pink and orange pads. |
| `theme-transit` | Transit | The conversation is a subway line: your questions are interchanges, replies are stops, the composer is the platform sign. |
| `theme-boarding` | Boarding | Boarding passes in a 1970s livery: chocolate header, orange-mustard-brick racing stripes, cream cards with torn-off stubs. |
| `theme-riso` | Riso | A two-ink risograph print: blue ink everywhere, your messages on outlined cards with a pink halftone shadow, a solid blue send. |
| `theme-lantern` | Lantern | A gradient-built jack-o’-lantern, candy-corn stripes, carved messages that flicker, and a cobweb in the corner. |
| `theme-pocket` | Pocket | The 1989 handheld: pea-green screen in a slate bezel, dialogue boxes with a blinking arrow, a D-pad and a magenta A button. |
| `theme-tombstone` | Tombstone | Moon, stars and drifting fog; your messages are a softly glowing ghost and replies are whispered. |
| `theme-groove` | Groove | A 1970s record sleeve in sunset colours: chocolate, gold, orange and red stripes, and a record spinning out of the header. |
| `theme-taskbar` | Taskbar | The early-2000s desktop: blue title bars, balloon tips, a green hill, and a taskbar with a start button and a clock. |
| `theme-springfield` | Springfield | Opening-credits sky and clouds, cartoon outlines, yellow for you, a yellow composer bar and a sprinkled donut. |
| `theme-sandia` | Sandia | New Mexico at dusk: the watermelon-pink Sandia ridge stays put while balloons drift past as you scroll. |
| `theme-adobe` | Adobe | High noon: a stepped adobe parapet against a bright sky, a chile ristra, stucco walls and a turquoise oval send button. |
| `theme-chomp` | Chomp | The 1980 arcade maze: double blue walls, white pellets, four ghosts, a score line with a pixel cherry, and a chomping send button. |

## Tokens

Set on `.chat` in the base and overridden by each theme:

| Token | Controls |
|---|---|
| `--bg`, `--surface` | Page and panel backgrounds |
| `--ink`, `--muted` | Main and secondary text |
| `--line` | Borders and rules |
| `--accent`, `--on-accent` | Send button and highlights, and text on them |
| `--user-bg`, `--user-ink` | Your message bubble |
| `--bot-bg`, `--bot-ink` | Reply bubble |
| `--code-bg` | Code background |
| `--font-body`, `--font-display`, `--font-meta`, `--font-code` | Fonts for text, titles, labels, code |
| `--text`, `--leading` | Text size and line height |
| `--bubble-pad`, `--bubble-radius` | Bubble padding and corners |
| `--gap`, `--edge` | Space between messages and side margins |
| `--measure` | Max bubble width |
| `--user-align` | Where your bubbles sit (`flex-end`, `stretch`, `center`) |
| `--radius` | Corners on inputs and buttons |

## CSS

```css
/* ============================================================
   BASE — structure only. Every visual decision is a token.
   A theme is a class on .chat that redefines tokens, plus
   a handful of overrides where a token can't express it.
   ============================================================ */

.chat {
  --bg: #ffffff;
  --surface: #f5f5f4;
  --ink: #18181b;
  --muted: #71717a;
  --line: #e4e4e7;
  --accent: #18181b;
  --on-accent: #ffffff;
  --user-bg: var(--surface);
  --user-ink: var(--ink);
  --bot-bg: transparent;
  --bot-ink: var(--ink);
  --code-bg: var(--surface);

  --font-body: system-ui, -apple-system, sans-serif;
  --font-display: var(--font-body);
  --font-meta: var(--font-body);
  --font-code: ui-monospace, "SF Mono", Menlo, monospace;

  --text: 15px;
  --leading: 1.55;
  --radius: 10px;
  --bubble-radius: 14px;
  --bubble-pad: 10px 14px;
  --gap: 22px;
  --edge: 18px;
  --measure: 88%;
  --user-align: flex-end;

  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: var(--text);
  line-height: var(--leading);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px var(--edge);
  border-bottom: 1px solid var(--line);
}

.chat-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 500;
  line-height: 1.1;
}

.model {
  appearance: none;
  -webkit-appearance: none;
  font: inherit;
  font-family: var(--font-meta);
  font-size: 12px;
  color: var(--muted);
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 5px 12px;
  cursor: pointer;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px var(--edge);
  display: flex;
  flex-direction: column;
  gap: var(--gap);
}

.msg { max-width: var(--measure); align-self: flex-start; }
.msg.user { align-self: var(--user-align); }
.msg:has(pre) { width: 100%; max-width: 100%; }
.body pre { white-space: pre; }

.who {
  display: block;
  font-family: var(--font-meta);
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 6px;
}

.body {
  padding: var(--bubble-pad);
  border-radius: var(--bubble-radius);
  background: var(--bot-bg);
  color: var(--bot-ink);
}
.user .body { background: var(--user-bg); color: var(--user-ink); }

.body > :first-child { margin-top: 0; }
.body > :last-child { margin-bottom: 0; }
.body p { margin: 0 0 0.7em; }
.body ul, .body ol { margin: 0 0 0.7em; padding-left: 1.2em; }
.body li { margin: 0.25em 0; }
.body code {
  font-family: var(--font-code);
  font-size: 0.86em;
  background: var(--code-bg);
  padding: 0.12em 0.38em;
  border-radius: 4px;
}
.body pre {
  margin: 0.9em 0;
  padding: 12px 14px;
  background: var(--code-bg);
  border-radius: min(var(--radius), 10px);
  overflow-x: auto;
  font-size: 12.5px;
  line-height: 1.65;
}
.body pre code { background: none; padding: 0; font-size: inherit; border-radius: 0; }

.streaming .body > :last-child::after {
  content: "";
  display: inline-block;
  width: 0.45em;
  height: 1em;
  margin-left: 3px;
  vertical-align: -0.15em;
  background: var(--accent);
  animation: chat-caret 1.1s steps(2, start) infinite;
}
@keyframes chat-caret { to { visibility: hidden; } }

.composer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px var(--edge) 16px;
  border-top: 1px solid var(--line);
}
.composer textarea {
  flex: 1;
  resize: none;
  font: inherit;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 10px 12px;
  box-sizing: border-box;
  height: 44px;
  min-height: 44px;
  max-height: 140px;
  line-height: 22px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.composer textarea::placeholder { color: var(--muted); }
.composer textarea:focus { border-color: var(--accent); }

.send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  white-space: nowrap;
  flex-shrink: 0;
  font: inherit;
  font-family: var(--font-meta);
  font-size: 13px;
  font-weight: 600;
  color: var(--on-accent);
  background: var(--accent);
  border: 0;
  border-radius: var(--radius);
  padding: 0 16px;
  height: 44px;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.2s;
}
.send::before { line-height: 1; }
.send:hover { opacity: 0.88; }
.send:active { transform: scale(0.97); }

@media (prefers-reduced-motion: reduce) {
  .streaming .body > :last-child::after { animation: none; }
}

/* Wide screens: the conversation stays a readable centred column while backgrounds stay full width. */
.chat { container-type: inline-size; }
@container (min-width: 820px) {
  .chat.chat .chat-header,
  .chat.chat .messages,
  .chat.chat .composer { padding-inline: max(var(--edge), calc((100% - 760px) / 2)); }
}


/* ============================================================
   FOLIO — a literary quarterly
   ============================================================ */

.theme-folio {
  --bg: #f6f1e7;
  --surface: #efe8da;
  --ink: #1f1c17;
  --muted: #8b8374;
  --line: #d9cfbc;
  --accent: #8e3b23;
  --on-accent: #f6f1e7;
  --user-bg: transparent;
  --bot-bg: transparent;
  --code-bg: #ebe3d2;
  --font-body: "Newsreader", Georgia, serif;
  --font-display: "Newsreader", Georgia, serif;
  --font-meta: "Newsreader", Georgia, serif;
  --text: 17px;
  --leading: 1.6;
  --bubble-pad: 0;
  --bubble-radius: 0;
  --gap: 30px;
  --edge: 24px;
  --measure: 100%;
  --user-align: stretch;
  --radius: 2px;
}
.theme-folio .chat-header {
  flex-direction: column;
  gap: 4px;
  padding: 22px var(--edge) 14px;
  border-bottom: 4px double var(--line);
}
.theme-folio .chat-title { font-size: 30px; font-style: italic; font-weight: 400; letter-spacing: -0.01em; }
.theme-folio .model { border: 0; border-radius: 0; padding: 0; font-style: italic; font-size: 14px; }
.theme-folio .who {
  font-size: 14px;
  font-variant: small-caps;
  text-transform: lowercase;
  letter-spacing: 0.1em;
}
.theme-folio .user .body {
  font-style: italic;
  font-size: 21px;
  line-height: 1.38;
  padding-left: 16px;
  border-left: 2px solid var(--accent);
}
.theme-folio .assistant:nth-child(1 of .assistant) .body > p:first-child::first-letter {
  float: left;
  font-size: 3.5em;
  line-height: 0.82;
  padding: 0.06em 0.08em 0 0;
  color: var(--accent);
}
.theme-folio .body ul { list-style: none; padding-left: 0; }
.theme-folio .body li { padding-left: 1.4em; text-indent: -1.4em; }
.theme-folio .body li::before { content: "—\00a0\00a0"; color: var(--accent); }
.theme-folio .body pre {
  background: transparent;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  border-radius: 0;
  padding: 12px 0;
}
.theme-folio .composer { border-top: 1px solid var(--ink); }
.theme-folio .composer textarea { background: transparent; border: 0; padding-left: 0; font-style: italic; }
.theme-folio .send {
  background: transparent;
  color: var(--accent);
  font-size: 17px;
  font-style: italic;
  font-weight: 500;
  padding: 0 2px;
}
.theme-folio .send::after { content: " →"; }


/* ============================================================
   SUMI — ink on rice paper
   ============================================================ */

.theme-sumi {
  --bg: #f3efe6;
  --surface: #ebe5d8;
  --ink: #1b1a18;
  --muted: #8f887b;
  --line: #d9d1c1;
  --accent: #b8412c;
  --on-accent: #f7f3ea;
  --user-bg: transparent;
  --bot-bg: transparent;
  --code-bg: #e8e1d2;
  --font-body: "Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif;
  --font-display: var(--font-body);
  --font-meta: "Zen Kaku Gothic New", system-ui, sans-serif;
  --text: 15.5px;
  --leading: 1.95;
  --bubble-pad: 0;
  --bubble-radius: 0;
  --gap: 40px;
  --edge: 28px;
  --measure: 100%;
  --user-align: stretch;
  --radius: 0;
  background-image: radial-gradient(rgba(60, 50, 30, 0.035) 1px, transparent 1px);
  background-size: 3px 3px;
}
.theme-sumi .chat-header { border-bottom: 0; padding-top: 22px; }
.theme-sumi .chat-title { font-size: 15px; font-weight: 600; letter-spacing: 0.35em; }
.theme-sumi .chat-title::before {
  content: "";
  display: inline-block;
  width: 11px;
  height: 11px;
  margin-right: 12px;
  border-radius: 50%;
  background: var(--accent);
  vertical-align: 0.05em;
}
.theme-sumi .model { border: 0; padding: 0; font-size: 11px; letter-spacing: 0.15em; }
.theme-sumi .who { font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; margin-bottom: 10px; }
.theme-sumi .user .who { color: var(--accent); }
.theme-sumi .user .who::before {
  content: "";
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 10px;
  background: var(--accent);
  vertical-align: 0.1em;
}
.theme-sumi .user .body { font-size: 18px; line-height: 1.7; font-weight: 600; }
.theme-sumi .assistant .body { padding-left: 20px; border-left: 1px solid var(--line); }
.theme-sumi .body pre { background: transparent; border: 1px solid var(--line); }
.theme-sumi .composer { border-top: 0; padding-bottom: 22px; }
.theme-sumi .composer textarea {
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--ink);
  padding-left: 0;
}
.theme-sumi .send { width: 42px; padding: 0; font-size: 0; }
.theme-sumi .send::before { content: "送"; font-family: var(--font-body); font-size: 18px; font-weight: 600; }


/* ============================================================
   GROVE — the conversation as a living branch
   ============================================================ */

.theme-grove {
  --bg: #eef0e7;
  --surface: #f6f7f1;
  --ink: #2a3227;
  --muted: #7f8a78;
  --line: #d2d8c6;
  --accent: #56704c;
  --on-accent: #f3f5ee;
  --bark: #7a6550;
  --user-bg: #e1e7d4;
  --bot-bg: transparent;
  --code-bg: #e3e7d9;
  --font-body: "EB Garamond", Georgia, serif;
  --font-display: "Cormorant Garamond", Georgia, serif;
  --font-meta: "Cormorant Garamond", Georgia, serif;
  --text: 17px;
  --leading: 1.55;
  --bubble-pad: 0;
  --bubble-radius: 16px;
  --gap: 0px;
  --measure: 100%;
  --user-align: stretch;
  --radius: 22px;
}
.theme-grove .chat-title { font-size: 28px; font-style: italic; font-weight: 500; }
.theme-grove .model { font-size: 14px; font-style: italic; }
.theme-grove .messages { padding-left: 12px; }
.theme-grove .msg { position: relative; padding: 0 0 28px 42px; }
.theme-grove .msg::before {
  content: "";
  position: absolute;
  left: 8px;
  top: 0;
  bottom: 0;
  width: 1.5px;
  background: var(--bark);
  opacity: 0.5;
}
.theme-grove .msg:first-child::before { background: linear-gradient(transparent, var(--bark) 40px); }
.theme-grove .msg:last-child::before { bottom: auto; height: 12px; }
.theme-grove .who::before {
  content: "";
  position: absolute;
  left: 8px;
  top: 0;
  width: 18px;
  height: 12px;
  border-left: 1.5px solid var(--bark);
  border-bottom: 1.5px solid var(--bark);
  border-bottom-left-radius: 14px;
  opacity: 0.5;
}
.theme-grove .msg::after {
  content: "";
  position: absolute;
  left: 27px;
  top: 6px;
  width: 11px;
  height: 11px;
  background: var(--accent);
  border-radius: 50% 0;
}
.theme-grove .user::after { background: var(--bg); border: 1.5px solid var(--accent); }
.theme-grove .who { font-size: 16px; font-style: italic; color: var(--accent); margin-bottom: 4px; }
.theme-grove .user .body { padding: 10px 16px; border-radius: 4px 16px 16px 16px; }
.theme-grove .body li::marker { color: var(--accent); }
.theme-grove .body pre { border-left: 2px solid var(--accent); border-radius: 0 10px 10px 0; }
.theme-grove .composer textarea { padding-left: 18px; }
.theme-grove .send { font-family: var(--font-display); font-size: 17px; font-style: italic; font-weight: 600; padding: 0 20px; }


/* ============================================================
   RASTER — International Typographic Style
   ============================================================ */

.theme-raster {
  --bg: #f1f1ee;
  --surface: #e6e6e2;
  --ink: #0f0f0f;
  --muted: #6d6d68;
  --line: #0f0f0f;
  --accent: #e4202a;
  --on-accent: #ffffff;
  --user-bg: transparent;
  --bot-bg: transparent;
  --code-bg: #e2e2de;
  --font-body: "Inter Tight", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-display: var(--font-body);
  --font-meta: var(--font-body);
  --text: 15px;
  --leading: 1.45;
  --bubble-pad: 0;
  --bubble-radius: 0;
  --gap: 0px;
  --edge: 16px;
  --measure: 100%;
  --user-align: stretch;
  --radius: 0;
  counter-reset: turn;
}
.theme-raster .chat-header { align-items: flex-end; padding-top: 18px; border-bottom: 3px solid var(--ink); }
.theme-raster .chat-title { font-size: 36px; font-weight: 800; letter-spacing: -0.045em; line-height: 0.85; }
.theme-raster .model {
  border: 0;
  border-radius: 0;
  background: var(--ink);
  color: var(--bg);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 5px 8px;
}
.theme-raster .messages { padding-top: 0; }
.theme-raster .msg {
  display: grid;
  grid-template-columns: 40px 1fr;
  column-gap: 8px;
  padding: 14px 0 18px;
  border-bottom: 1px solid var(--ink);
  counter-increment: turn;
}
.theme-raster .msg::before {
  content: counter(turn, decimal-leading-zero);
  grid-row: 1 / span 2;
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.theme-raster .who, .theme-raster .body { grid-column: 2; }
.theme-raster .who {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink);
}
.theme-raster .user::before, .theme-raster .user .who { color: var(--accent); }
.theme-raster .user .body { font-size: 23px; font-weight: 600; letter-spacing: -0.025em; line-height: 1.12; }
.theme-raster .body ul { list-style: square; }
.theme-raster .body li::marker { color: var(--accent); }
.theme-raster .body pre { background: var(--ink); color: var(--bg); }
.theme-raster .composer { border-top: 3px solid var(--ink); }
.theme-raster .composer textarea { background: transparent; border: 0; padding-left: 0; font-weight: 500; }
.theme-raster .send { font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; font-size: 12px; }


/* ============================================================
   LINEN — the everyday one, built to be lived in
   ============================================================ */

.theme-linen {
  --bg: #f4f1eb;
  --surface: #fffdf9;
  --ink: #2b2824;
  --muted: #9b958b;
  --line: #e6dfd3;
  --accent: #2b2824;
  --on-accent: #f4f1eb;
  --user-bg: #2b2824;
  --user-ink: #f4f1eb;
  --bot-bg: transparent;
  --code-bg: #ebe6dc;
  --font-body: "Instrument Sans", system-ui, sans-serif;
  --font-display: "Instrument Serif", Georgia, serif;
  --text: 15px;
  --leading: 1.62;
  --bubble-pad: 11px 16px;
  --bubble-radius: 20px;
  --gap: 22px;
  --measure: 82%;
  --radius: 14px;
}
.theme-linen .chat-header { border-bottom: 0; padding-top: 18px; }
.theme-linen .chat-title { font-size: 27px; font-weight: 400; letter-spacing: -0.01em; }
.theme-linen .model { background: var(--surface); }
.theme-linen .user .who { display: none; }
.theme-linen .assistant { max-width: 100%; }
.theme-linen .assistant .who::before {
  content: "";
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 8px;
  border-radius: 50%;
  background: #c8a27a;
  vertical-align: 0.1em;
}
.theme-linen .user .body { border-bottom-right-radius: 6px; }
.theme-linen .assistant .body { padding-left: 0; padding-right: 0; }
.theme-linen .body pre { background: var(--surface); border: 1px solid var(--line); }
.theme-linen .composer {
  margin: 0 12px 14px;
  padding: 7px 7px 7px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 26px;
  box-shadow: 0 12px 32px -14px rgba(43, 40, 36, 0.28);
}
.theme-linen .composer textarea { background: transparent; border: 0; padding: 9px 0; min-height: 40px; }
.theme-linen .send { width: 40px; height: 40px; padding: 0; border-radius: 50%; font-size: 0; }
.theme-linen .send::before { content: "↑"; font-size: 18px; }


/* ============================================================
   ATELIER — an architect's drafting sheet
   ============================================================ */

.theme-atelier {
  --bg: #f3f5f7;
  --surface: #ffffff;
  --ink: #18212c;
  --muted: #6b7786;
  --line: #c8d1dc;
  --accent: #2c5bd6;
  --on-accent: #ffffff;
  --user-bg: #ffffff;
  --bot-bg: transparent;
  --code-bg: #e8edf4;
  --font-body: "IBM Plex Sans", system-ui, sans-serif;
  --font-display: "IBM Plex Mono", ui-monospace, monospace;
  --font-meta: "IBM Plex Mono", ui-monospace, monospace;
  --font-code: "IBM Plex Mono", ui-monospace, monospace;
  --text: 14.5px;
  --leading: 1.62;
  --bubble-pad: 12px 14px;
  --bubble-radius: 0;
  --gap: 28px;
  --measure: 100%;
  --user-align: stretch;
  --radius: 0;
  background-image:
    linear-gradient(rgba(44, 91, 214, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(44, 91, 214, 0.06) 1px, transparent 1px);
  background-size: 16px 16px;
  counter-reset: sheet;
}
.theme-atelier .chat-header,
.theme-atelier .composer { background: rgba(243, 245, 247, 0.94); }
.theme-atelier .chat-header { border-bottom: 1px solid var(--ink); }
.theme-atelier .chat-title { font-size: 12px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; }
.theme-atelier .chat-title::after { content: " / Sheet A1"; color: var(--muted); }
.theme-atelier .model { border-radius: 0; font-size: 11px; background: var(--surface); }
.theme-atelier .msg { counter-increment: sheet; }
.theme-atelier .who {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.theme-atelier .who::before { content: counter(sheet, decimal-leading-zero); color: var(--accent); }
.theme-atelier .who::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.theme-atelier .body { position: relative; }
.theme-atelier .body::before,
.theme-atelier .body::after {
  content: "";
  position: absolute;
  width: 9px;
  height: 9px;
  border: 0 solid var(--accent);
}
.theme-atelier .body::before { top: -1px; left: -1px; border-top-width: 1.5px; border-left-width: 1.5px; }
.theme-atelier .body::after { bottom: -1px; right: -1px; border-bottom-width: 1.5px; border-right-width: 1.5px; }
.theme-atelier .user .body {
  border: 1px solid var(--line);
  box-shadow: 4px 4px 0 rgba(44, 91, 214, 0.07);
  font-weight: 500;
}
.theme-atelier .body pre { background: var(--surface); border: 1px solid var(--line); }
.theme-atelier .body li::marker { color: var(--accent); }
.theme-atelier .composer { border-top: 1px solid var(--ink); }
.theme-atelier .composer textarea { background: var(--surface); }
.theme-atelier .send { font-size: 11.5px; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; }


/* ============================================================
   TIDE — sea glass and morning fog
   ============================================================ */

.theme-tide {
  --bg: #eaf1f1;
  --surface: rgba(255, 255, 255, 0.75);
  --ink: #1d3237;
  --muted: #7a9095;
  --line: #d2e0e1;
  --accent: #3a7a84;
  --on-accent: #f3f8f8;
  --user-bg: #cfe4e1;
  --user-ink: #1d3237;
  --bot-bg: rgba(255, 255, 255, 0.72);
  --code-bg: #e1ebeb;
  --font-body: "Figtree", system-ui, sans-serif;
  --font-display: "Fraunces", Georgia, serif;
  --text: 15px;
  --leading: 1.6;
  --bubble-pad: 12px 16px;
  --bubble-radius: 24px;
  --gap: 16px;
  --measure: 86%;
  --radius: 24px;
  background: linear-gradient(180deg, #f4f8f7 0%, #e6eff0 55%, #d6e5e7 100%);
}
.theme-tide .chat-header { border-bottom: 0; padding-top: 18px; }
.theme-tide .chat-title { font-size: 27px; font-style: italic; font-weight: 400; letter-spacing: -0.01em; }
.theme-tide .model { background: rgba(255, 255, 255, 0.7); border-color: rgba(255, 255, 255, 0.9); }
.theme-tide .who { display: none; }
.theme-tide .assistant .body {
  border-radius: 24px 24px 24px 8px;
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  box-shadow: 0 10px 28px -18px rgba(29, 50, 55, 0.45);
}
.theme-tide .user .body { border-radius: 24px 24px 8px 24px; }
.theme-tide .body li::marker { color: var(--accent); }
.theme-tide .body pre { background: rgba(255, 255, 255, 0.6); border: 1px solid var(--line); border-radius: 16px; }
.theme-tide .composer { border-top: 0; padding-bottom: 18px; }
.theme-tide .composer textarea {
  padding-left: 18px;
  border-color: rgba(255, 255, 255, 0.95);
  box-shadow: 0 8px 22px -14px rgba(29, 50, 55, 0.35);
}
.theme-tide .send { width: 42px; padding: 0; border-radius: 50%; font-size: 0; }
.theme-tide .send::before { content: "↑"; font-size: 18px; }


/* ============================================================
   DRAFT — the conversation as a screenplay
   ============================================================ */

.theme-draft {
  --bg: #f7f5ef;
  --surface: #fdfcf8;
  --ink: #1f1f1d;
  --muted: #8c8981;
  --line: #dcd8cd;
  --accent: #b2322b;
  --on-accent: #fdfcf8;
  --user-bg: transparent;
  --user-ink: #b2322b;
  --bot-bg: transparent;
  --code-bg: transparent;
  --font-body: "Courier Prime", "Courier New", monospace;
  --font-display: var(--font-body);
  --font-meta: var(--font-body);
  --font-code: var(--font-body);
  --text: 14.5px;
  --leading: 1.5;
  --bubble-pad: 0 9%;
  --bubble-radius: 0;
  --gap: 26px;
  --edge: 20px;
  --measure: 100%;
  --user-align: stretch;
  --radius: 0;
}
.theme-draft .chat-header { flex-direction: column; gap: 2px; border-bottom: 0; padding-top: 22px; }
.theme-draft .chat-title {
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-decoration: underline;
  text-underline-offset: 4px;
}
.theme-draft .model { border: 0; padding: 0; font-size: 13px; }
.theme-draft .messages::before { content: "FADE IN:"; font-weight: 700; }
.theme-draft .who {
  margin-bottom: 0;
  text-align: center;
  text-transform: uppercase;
  font-size: var(--text);
  color: var(--ink);
}
.theme-draft .user .who { color: var(--accent); }
.theme-draft .body code { padding: 0; text-decoration: underline; text-underline-offset: 3px; }
.theme-draft .body pre { padding: 0 0 0 14px; border-left: 1px dashed var(--muted); border-radius: 0; font-size: 13px; }
.theme-draft .body pre code { text-decoration: none; }
.theme-draft .body ul { list-style: none; padding-left: 0; }
.theme-draft .body li::before { content: "- "; }
.theme-draft .composer { border-top: 1px dashed var(--muted); }
.theme-draft .composer textarea { background: transparent; border: 0; padding-left: 0; }
.theme-draft .send { padding: 0 4px; background: transparent; color: var(--ink); font-size: 0; }
.theme-draft .send::before { content: "CUT TO:"; font-size: 14.5px; font-weight: 700; }


/* ============================================================
   BAUHAUS — circle, square, triangle
   ============================================================ */

.theme-bauhaus {
  --bg: #f1ece1;
  --surface: #fbf8f1;
  --ink: #1b1b1b;
  --muted: #77706a;
  --line: #1b1b1b;
  --accent: #d23f2a;
  --on-accent: #f7f2e7;
  --blue: #24509e;
  --yellow: #efb225;
  --user-bg: #d23f2a;
  --user-ink: #f7f2e7;
  --bot-bg: transparent;
  --code-bg: #e6dfcf;
  --font-body: "Jost", "Futura", system-ui, sans-serif;
  --font-display: var(--font-body);
  --font-meta: var(--font-body);
  --text: 15.5px;
  --leading: 1.55;
  --bubble-pad: 14px 18px;
  --bubble-radius: 0;
  --gap: 24px;
  --measure: 86%;
  --radius: 0;
}
.theme-bauhaus .chat-header { border-bottom: 2px solid var(--ink); }
.theme-bauhaus .chat-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 23px;
  font-weight: 500;
  text-transform: lowercase;
}
.theme-bauhaus .chat-title::before {
  content: "";
  flex-shrink: 0;
  width: 52px;
  height: 14px;
  background:
    radial-gradient(circle at 7px 7px, var(--accent) 6.5px, transparent 7.2px),
    linear-gradient(var(--blue), var(--blue)) 19px 0 / 14px 14px no-repeat,
    linear-gradient(to top right, transparent 50%, var(--yellow) 50%) 38px 0 / 14px 14px no-repeat;
}
.theme-bauhaus .model { border: 2px solid var(--ink); border-radius: 0; color: var(--ink); font-weight: 500; }
.theme-bauhaus .who {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink);
}
.theme-bauhaus .who::before { content: ""; width: 9px; height: 9px; background: var(--blue); }
.theme-bauhaus .user .who { justify-content: flex-end; }
.theme-bauhaus .user .who::before { background: var(--accent); border-radius: 50%; }
.theme-bauhaus .user .body { border-radius: 0 0 0 32px; font-weight: 500; }
.theme-bauhaus .assistant .body { padding: 2px 0 2px 16px; border-left: 3px solid var(--blue); }
.theme-bauhaus .body ul { list-style: square; }
.theme-bauhaus .body li::marker { color: var(--accent); }
.theme-bauhaus .body pre { background: var(--ink); color: var(--bg); }
.theme-bauhaus .composer { border-top: 2px solid var(--ink); }
.theme-bauhaus .composer textarea { border: 2px solid var(--ink); }
.theme-bauhaus .send { width: 42px; padding: 0; border-radius: 50%; background: var(--yellow); color: var(--ink); font-size: 0; }
.theme-bauhaus .send::before { content: "→"; font-size: 19px; font-weight: 600; }


/* ============================================================
   BASALT — dark, precise, neutral graphite, lit in bone white
   ============================================================ */

.theme-basalt {
  --bg: #0d0e0e;
  --surface: #161717;
  --ink: #e9ebea;
  --muted: #777b7a;
  --line: #252727;
  --accent: #e6dccb;
  --glow: 230, 220, 203;
  --on-accent: #12100c;
  --user-bg: #171818;
  --bot-bg: transparent;
  --code-bg: #121313;
  --font-body: "Geist", system-ui, sans-serif;
  --font-meta: "Geist Mono", ui-monospace, monospace;
  --font-code: "Geist Mono", ui-monospace, monospace;
  --text: 14.5px;
  --leading: 1.66;
  --bubble-radius: 12px;
  --gap: 26px;
  --measure: 85%;
  --radius: 10px;
}

.theme-basalt .chat-header {
  border-bottom: 1px solid transparent;
  border-image: linear-gradient(90deg, rgba(var(--glow), 0.55), var(--line) 38%, var(--line)) 1;
  background: linear-gradient(rgba(255, 255, 255, 0.02), transparent);
}
.theme-basalt .chat-title { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
.theme-basalt .chat-title::before {
  content: "";
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 10px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 10px rgba(var(--glow), 0.75), 0 0 22px rgba(var(--glow), 0.3);
  vertical-align: 0.1em;
}
.theme-basalt .model { font-size: 11px; border-radius: 6px; background: var(--surface); }
.theme-basalt .who { font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; }
.theme-basalt .user .body { border: 1px solid var(--line); }
.theme-basalt .assistant { max-width: 100%; }
.theme-basalt .assistant .body { padding-left: 0; padding-right: 0; }
.theme-basalt .body code { color: var(--accent); background: rgba(var(--glow), 0.09); }
.theme-basalt .body pre code { color: var(--ink); background: none; }
.theme-basalt .body pre { border: 1px solid var(--line); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04); }
.theme-basalt .body li::marker { color: var(--muted); }
.theme-basalt .composer textarea:focus { box-shadow: 0 0 0 3px rgba(var(--glow), 0.14); }
.theme-basalt .send { font-weight: 500; }


/* ============================================================
   AIRMAIL — par avion. Your messages arrive as postcards.
   ============================================================ */

.theme-airmail {
  --bg: #f2ede1;
  --surface: #fffdf7;
  --ink: #1f2a44;
  --muted: #8a8778;
  --line: #d9d1bf;
  --accent: #c8352e;
  --on-accent: #fffdf7;
  --navy: #1f3f8f;
  --stripes: repeating-linear-gradient(-45deg, #c8352e 0 8px, #fffdf7 8px 14px, #1f3f8f 14px 22px, #fffdf7 22px 28px);
  --user-bg: #fffdf7;
  --bot-bg: transparent;
  --code-bg: #ebe4d3;
  --font-body: "Lora", Georgia, serif;
  --font-display: "Playfair Display", Georgia, serif;
  --font-meta: "Special Elite", "Courier New", monospace;
  --text: 15.5px;
  --leading: 1.62;
  --bubble-pad: 16px 58px 16px 18px;
  --bubble-radius: 2px;
  --gap: 26px;
  --measure: 92%;
  --radius: 2px;
}
.theme-airmail .chat-header { border-bottom: 6px solid; border-image: var(--stripes) 6; }
.theme-airmail .chat-title { font-size: 26px; font-style: italic; font-weight: 500; }
.theme-airmail .chat-title::after {
  content: "par avion";
  margin-left: 10px;
  padding: 2px 6px;
  font-family: var(--font-meta);
  font-size: 10px;
  font-style: normal;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--navy);
  border: 1.5px solid var(--navy);
  vertical-align: 0.4em;
}
.theme-airmail .model { font-size: 11px; border-radius: 2px; }
.theme-airmail .who { font-size: 12px; letter-spacing: 0.04em; }
.theme-airmail .user .who { text-align: right; }
.theme-airmail .user .body {
  position: relative;
  border: 6px solid;
  border-image: var(--stripes) 6;
  box-shadow: 0 10px 22px -16px rgba(31, 42, 68, 0.5);
}
.theme-airmail .user .body::after {
  content: "";
  position: absolute;
  top: 10px;
  right: 10px;
  width: 30px;
  height: 36px;
  background:
    radial-gradient(circle at 50% 60%, rgba(255, 253, 247, 0.9) 5px, transparent 5.5px),
    linear-gradient(160deg, #e5574f, var(--accent));
  outline: 2px dotted var(--surface);
  outline-offset: -3px;
  transform: rotate(4deg);
}
.theme-airmail .assistant .body { padding: 0 0 0 16px; border-left: 1px solid var(--line); }
.theme-airmail .assistant { max-width: 100%; }
.theme-airmail .body li::marker { color: var(--accent); }
.theme-airmail .body pre { border: 1px solid var(--line); }
.theme-airmail .composer { border-top: 6px solid; border-image: var(--stripes) 6; }
.theme-airmail .composer textarea { background: var(--surface); }
.theme-airmail .send { font-family: var(--font-meta); font-weight: 400; letter-spacing: 0.1em; text-transform: uppercase; }


/* ============================================================
   RECEIPT — every answer, itemised
   ============================================================ */

.theme-receipt {
  --bg: #dedbd4;
  --paper: #fffef9;
  --surface: var(--paper);
  --ink: #232323;
  --muted: #8d8b86;
  --line: #bdbab3;
  --accent: #232323;
  --on-accent: #fffef9;
  --user-bg: transparent;
  --bot-bg: transparent;
  --code-bg: #f1efe8;
  --font-body: "Martian Mono", ui-monospace, monospace;
  --font-display: var(--font-body);
  --font-meta: var(--font-body);
  --font-code: var(--font-body);
  --text: 12.5px;
  --leading: 1.7;
  --bubble-pad: 0;
  --bubble-radius: 0;
  --gap: 0px;
  --edge: 18px;
  --measure: 100%;
  --user-align: stretch;
  --radius: 0;
  counter-reset: order;
}
.theme-receipt .chat-header,
.theme-receipt .messages,
.theme-receipt .composer {
  margin-inline: 14px;
  background-color: var(--paper);
  border: 0;
}
.theme-receipt .chat-header {
  flex-direction: column;
  gap: 4px;
  margin-top: 14px;
  padding-top: 24px;
  text-align: center;
  background-image:
    linear-gradient(135deg, var(--bg) 5px, transparent 5.5px),
    linear-gradient(225deg, var(--bg) 5px, transparent 5.5px);
  background-size: 10px 10px;
  background-repeat: repeat-x;
}
.theme-receipt .chat-title { font-size: 15px; font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; }
.theme-receipt .chat-title::before,
.theme-receipt .chat-title::after { content: "*"; margin: 0 10px; color: var(--muted); }
.theme-receipt .model { border: 0; padding: 0; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; }
.theme-receipt .messages { padding-top: 6px; }
.theme-receipt .messages::after {
  content: "";
  flex-shrink: 0;
  height: 30px;
  margin: 22px 18% 4px;
  background: repeating-linear-gradient(90deg,
    var(--ink) 0 2px, transparent 2px 4px, var(--ink) 4px 5px, transparent 5px 8px,
    var(--ink) 8px 11px, transparent 11px 12px, var(--ink) 12px 13px, transparent 13px 16px);
}
.theme-receipt .msg { padding: 14px 0 16px; border-top: 1px dashed var(--line); }
.theme-receipt .user { counter-increment: order; }
.theme-receipt .who {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.theme-receipt .user .who::after { content: "order #" counter(order, decimal-leading-zero); }
.theme-receipt .assistant .who::after { content: "served"; }
.theme-receipt .user .body { font-weight: 700; text-transform: uppercase; }
.theme-receipt .body ul { list-style: none; padding-left: 0; }
.theme-receipt .body li { display: flex; gap: 10px; }
.theme-receipt .body li::before { content: "1x"; flex-shrink: 0; color: var(--muted); }
.theme-receipt .body pre { border: 1px dashed var(--line); background: transparent; font-size: 11.5px; }
.theme-receipt .composer {
  margin-bottom: 14px;
  padding-bottom: 26px;
  background-image:
    linear-gradient(45deg, var(--bg) 5px, transparent 5.5px),
    linear-gradient(-45deg, var(--bg) 5px, transparent 5.5px);
  background-size: 10px 10px;
  background-position: 0 100%;
  background-repeat: repeat-x;
  border-top: 1px dashed var(--line);
}
.theme-receipt .composer textarea { background: transparent; border: 1px dashed var(--ink); }
.theme-receipt .send { font-size: 0; padding: 0 14px; }
.theme-receipt .send::before { content: "PRINT"; font-size: 11px; font-weight: 700; letter-spacing: 0.15em; }


/* ============================================================
   LUMEN — a single neon tube in a dark room
   ============================================================ */

.theme-lumen {
  --bg: #0e0d10;
  --surface: #161519;
  --ink: #ebe7ee;
  --muted: #7f7a86;
  --line: #24222a;
  --accent: #ff6f9c;
  --pink: 255, 111, 156;
  --cyan: 104, 232, 255;
  --on-accent: #0e0d10;
  --user-bg: transparent;
  --user-ink: #ffe3ec;
  --bot-bg: transparent;
  --code-bg: rgba(255, 255, 255, 0.04);
  --font-body: "Outfit", system-ui, sans-serif;
  --font-display: "Tilt Neon", "Outfit", sans-serif;
  --font-meta: "Outfit", system-ui, sans-serif;
  --text: 15px;
  --leading: 1.62;
  --bubble-pad: 12px 18px;
  --bubble-radius: 22px;
  --gap: 26px;
  --measure: 86%;
  --radius: 999px;
  background:
    radial-gradient(70% 40% at 50% 0%, rgba(var(--pink), 0.09), transparent 70%),
    var(--bg);
}
.theme-lumen .chat-header { border-bottom: 0; padding-top: 20px; }
.theme-lumen .chat-title {
  font-size: 30px;
  font-weight: 400;
  color: #ffd6e3;
  text-shadow: 0 0 4px rgba(var(--pink), 0.9), 0 0 14px rgba(var(--pink), 0.7), 0 0 34px rgba(var(--pink), 0.45);
  animation: lumen-hum 6s infinite;
}
@keyframes lumen-hum {
  0%, 91%, 95%, 100% { opacity: 1; }
  93% { opacity: 0.55; }
}
.theme-lumen .model { border-color: var(--line); }
.theme-lumen .who { font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; }
.theme-lumen .assistant .who { color: rgb(var(--cyan)); text-shadow: 0 0 10px rgba(var(--cyan), 0.6); }
.theme-lumen .user .who { text-align: right; color: rgb(var(--pink)); text-shadow: 0 0 10px rgba(var(--pink), 0.6); }
.theme-lumen .user .body {
  border: 1.5px solid #ff9dbb;
  box-shadow:
    0 0 6px rgba(var(--pink), 0.75),
    0 0 20px rgba(var(--pink), 0.35),
    inset 0 0 10px rgba(var(--pink), 0.25);
  text-shadow: 0 0 10px rgba(var(--pink), 0.45);
}
.theme-lumen .assistant { max-width: 100%; }
.theme-lumen .assistant .body { padding-left: 0; padding-right: 0; }
.theme-lumen .body li::marker { color: rgb(var(--cyan)); }
.theme-lumen .body code { color: #aef2ff; }
.theme-lumen .body pre { border: 1px solid var(--line); border-radius: 14px; }
.theme-lumen .body pre code { color: var(--ink); }
.theme-lumen .composer { border-top: 0; padding-bottom: 20px; }
.theme-lumen .composer textarea { border-radius: 22px; padding-left: 18px; }
.theme-lumen .composer textarea:focus { border-color: rgb(var(--cyan)); box-shadow: 0 0 12px rgba(var(--cyan), 0.25); }
.theme-lumen .send {
  background: transparent;
  color: #d8f8ff;
  border: 1.5px solid #9eefff;
  box-shadow: 0 0 6px rgba(var(--cyan), 0.7), 0 0 18px rgba(var(--cyan), 0.3), inset 0 0 8px rgba(var(--cyan), 0.25);
  text-shadow: 0 0 8px rgba(var(--cyan), 0.7);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 12px;
}
@media (prefers-reduced-motion: reduce) {
  .theme-lumen .chat-title { animation: none; }
}


/* ============================================================
   PRISM — clean white, edges that catch the light
   ============================================================ */

.theme-prism {
  --bg: #fbfbfd;
  --surface: #ffffff;
  --ink: #17171f;
  --muted: #8b8b98;
  --line: #ececf2;
  --accent: #17171f;
  --on-accent: #ffffff;
  --holo: conic-gradient(from 200deg, #ff9fb3, #ffd29a, #fff3a3, #a8f0c6, #9fd9ff, #c4b5ff, #ff9fb3);
  --user-bg: #ffffff;
  --bot-bg: transparent;
  --code-bg: #f4f4f8;
  --font-body: "Sora", system-ui, sans-serif;
  --font-display: var(--font-body);
  --text: 14.5px;
  --leading: 1.65;
  --bubble-pad: 12px 16px;
  --bubble-radius: 18px;
  --gap: 24px;
  --measure: 84%;
  --radius: 16px;
}
.theme-prism .chat-header { border-bottom: 2px solid; border-image: var(--holo) 1; }
.theme-prism .chat-title {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.03em;
  background: linear-gradient(100deg, #ff7f9e, #ffb36b 25%, #6fd3a0 55%, #63b6ff 75%, #a98bff);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.theme-prism .who { display: none; }
.theme-prism .user .body {
  border: 1.5px solid transparent;
  background: linear-gradient(var(--surface), var(--surface)) padding-box, var(--holo) border-box;
  box-shadow: 0 12px 30px -18px rgba(120, 110, 200, 0.45);
}
.theme-prism .assistant { max-width: 100%; }
.theme-prism .assistant .body { padding-left: 0; padding-right: 0; }
.theme-prism .body li::marker { color: #9fa3ff; }
.theme-prism .body pre { border: 1px solid var(--line); }
.theme-prism .composer { border-top: 0; padding-bottom: 18px; }
.theme-prism .composer textarea {
  border: 1.5px solid transparent;
  background: linear-gradient(var(--surface), var(--surface)) padding-box, var(--holo) border-box;
  border-radius: 22px;
  padding-left: 18px;
}
.theme-prism .send {
  width: 42px;
  padding: 0;
  border-radius: 50%;
  font-size: 0;
  color: var(--ink);
  background: var(--holo);
}
.theme-prism .send::before { content: "↑"; font-size: 18px; font-weight: 600; }


/* ============================================================
   STICKY — office sticky notes on a desk
   ============================================================ */

.theme-sticky {
  --bg: #e8e6e1;
  --surface: #f7f6f2;
  --ink: #2c2a26;
  --muted: #86827a;
  --line: #d6d2c9;
  --accent: #2c2a26;
  --on-accent: #fff6a8;
  --canary: #fff27e;
  --pink: #ffbcd2;
  --blue: #ade0f7;
  --lime: #d2ee94;
  --orange: #ffcd91;
  --user-bg: var(--canary);
  --bot-bg: var(--blue);
  --code-bg: rgba(255, 255, 255, 0.55);
  --font-body: "Work Sans", system-ui, sans-serif;
  --font-display: "Kalam", cursive;
  --font-meta: "Work Sans", system-ui, sans-serif;
  --text: 14.5px;
  --leading: 1.55;
  --bubble-pad: 26px 16px 18px;
  --bubble-radius: 0;
  --gap: 24px;
  --measure: 86%;
  --radius: 0;
  background-image: radial-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px);
  background-size: 4px 4px;
}
.theme-sticky .chat-header { background: var(--surface); }
.theme-sticky .chat-title { font-size: 27px; font-weight: 700; display: flex; align-items: center; gap: 14px; }
.theme-sticky .chat-title::before {
  content: "";
  width: 16px;
  height: 16px;
  margin-left: 5px;
  background: var(--canary);
  box-shadow: -5px 5px 0 var(--pink);
}
.theme-sticky .model { background: #fff; }
.theme-sticky .who { display: none; }
.theme-sticky .msg { position: relative; z-index: 0; }
.theme-sticky .body {
  position: relative;
  background-image: linear-gradient(rgba(0, 0, 0, 0.045), transparent 20px);
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.08);
}
.theme-sticky .body::after {
  content: "";
  position: absolute;
  z-index: -1;
  right: 8px;
  bottom: 9px;
  width: 55%;
  height: 14px;
  box-shadow: 0 10px 12px rgba(0, 0, 0, 0.22);
  transform: rotate(3deg);
}
.theme-sticky .user { transform: rotate(1deg); }
.theme-sticky .assistant { transform: rotate(-0.6deg); }
.theme-sticky .user .body {
  font-family: var(--font-display);
  font-size: 19px;
  line-height: 1.35;
}
.theme-sticky .assistant:nth-child(4n) .body { background-color: var(--lime); }
.theme-sticky .assistant:nth-child(6n) .body { background-color: var(--pink); }
.theme-sticky .assistant:nth-child(8n) .body { background-color: var(--orange); }
.theme-sticky .body pre { border-radius: 2px; }
.theme-sticky .composer { background: var(--surface); }
.theme-sticky .composer textarea {
  background: var(--canary);
  border: 0;
  font-family: var(--font-display);
  font-size: 17px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.12);
}
.theme-sticky .send { font-size: 0; padding: 0 16px; }
.theme-sticky .send::before { content: "Stick it"; font-size: 13px; }


/* ============================================================
   TRANSIT — the conversation is a subway line
   ============================================================ */

.theme-transit {
  --bg: #f6f6f3;
  --surface: #ffffff;
  --ink: #151515;
  --muted: #7a7a75;
  --line: #e2e2dc;
  --accent: #00985f;
  --on-accent: #ffffff;
  --route: #00985f;
  --sign: #141414;
  --q: #e4002b;
  --a: #0039a6;
  --user-bg: transparent;
  --bot-bg: transparent;
  --code-bg: #ecece7;
  --font-body: "Public Sans", "Helvetica Neue", Arial, sans-serif;
  --font-display: var(--font-body);
  --font-meta: var(--font-body);
  --text: 15px;
  --leading: 1.55;
  --bubble-pad: 0;
  --gap: 0px;
  --measure: 100%;
  --user-align: stretch;
  --radius: 8px;
}
.theme-transit .chat-header { background: var(--sign); color: #fff; border-bottom: 0; }
.theme-transit .chat-title { display: flex; align-items: center; gap: 10px; font-size: 19px; font-weight: 700; letter-spacing: -0.01em; }
.theme-transit .chat-title::before {
  content: "T";
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--route);
  color: #fff;
  font-size: 15px;
  font-weight: 800;
}
.theme-transit .model { color: #fff; border-color: rgba(255, 255, 255, 0.3); }
.theme-transit .messages { padding-left: 10px; }
.theme-transit .msg { position: relative; padding: 0 0 30px 46px; }
.theme-transit .msg::before {
  content: "";
  position: absolute;
  left: 14px;
  top: 0;
  bottom: 0;
  width: 6px;
  background: var(--route);
}
.theme-transit .msg:first-child::before { top: 10px; }
.theme-transit .msg:last-child::before { bottom: auto; height: 12px; }
.theme-transit .msg::after {
  content: "";
  position: absolute;
  left: 8px;
  top: 2px;
  width: 18px;
  height: 18px;
  box-sizing: border-box;
  border-radius: 50%;
  background: #fff;
  border: 4px solid var(--sign);
}
.theme-transit .assistant::after { left: 11px; top: 5px; width: 12px; height: 12px; border: 3px solid #fff; background: var(--route); }
.theme-transit .who {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.3;
  color: var(--ink);
}
.theme-transit .who::after {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 800;
  color: #fff;
}
.theme-transit .user .who::after { content: "Q"; background: var(--q); }
.theme-transit .assistant .who::after { content: "A"; background: var(--a); }
.theme-transit .user .body { font-size: 19px; font-weight: 600; line-height: 1.3; }
.theme-transit .body li::marker { color: var(--route); }
.theme-transit .body pre { background: var(--surface); border: 1px solid var(--line); }
.theme-transit .composer { background: var(--sign); border-top: 0; }
.theme-transit .composer textarea { background: #262626; border-color: #333; color: #fff; }
.theme-transit .composer textarea:focus { border-color: #ffd200; }
.theme-transit .send { font-size: 0; padding: 0 18px; background: #ffd200; color: var(--sign); }
.theme-transit .send::before { content: "Depart →"; font-size: 14px; font-weight: 800; }


/* ============================================================
   BOARDING — every question is a boarding pass
   Default livery is tricolour; add .theme-boarding for the 70s one.
   ============================================================ */

.theme-boarding {
  --bg: #f1e7d6;
  --surface: #fffaf1;
  --ink: #3a2618;
  --muted: #9b846d;
  --line: #e3d4bd;
  --accent: #b8442c;
  --on-accent: #ffffff;
  --header-bg: #3a2618;
  --header-ink: #f6c453;
  --header-line: rgba(246, 196, 83, 0.4);
  --stripe: linear-gradient(#d9822b 0 33.33%, #f6c453 0 66.66%, #b8442c 0);
  --band: #d9822b;
  --stub-tint: rgba(217, 130, 43, 0.12);
  --send-bg: #3a2618;
  --send-ink: #f6c453;
  --plane: #f6c453;
  --stub: 66px;
  --user-bg: var(--surface);
  --bot-bg: var(--surface);
  --code-bg: #f4ead9;
  --font-body: "Barlow", system-ui, sans-serif;
  --font-display: "Barlow Condensed", "Barlow", sans-serif;
  --font-meta: "Barlow Condensed", "Barlow", sans-serif;
  --font-code: "JetBrains Mono", ui-monospace, monospace;
  --text: 15px;
  --leading: 1.55;
  --bubble-pad: 14px 16px;
  --bubble-radius: 14px;
  --gap: 18px;
  --measure: 100%;
  --user-align: stretch;
  --radius: 12px;
  counter-reset: seq;
}
.theme-boarding .chat-header {
  background: var(--header-bg);
  color: var(--header-ink);
  border-bottom: 6px solid;
  border-image: var(--stripe) 1;
}
.theme-boarding .chat-header {
  margin-bottom: 9px;
  border-bottom: 0;
  box-shadow: 0 3px 0 #d9822b, 0 6px 0 #f6c453, 0 9px 0 #b8442c;
}
.theme-boarding .chat-title { font-size: 21px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; white-space: nowrap; }
.theme-boarding .chat-title { font-family: var(--font-display); font-size: 25px; font-style: italic; letter-spacing: 0.04em; }
.theme-boarding .chat-title::after { content: "  \2708\FE0E"; color: var(--plane); }
.theme-boarding .model { color: var(--header-ink); border-color: var(--header-line); letter-spacing: 0.08em; text-transform: uppercase; font-size: 12.5px; }
.theme-boarding .msg { counter-increment: seq; }
.theme-boarding .who {
  padding-left: 4px;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink);
}
.theme-boarding .user .who::before { content: "Passenger · "; color: var(--muted); }
.theme-boarding .assistant .who::before { content: "Captain · "; color: var(--muted); }
.theme-boarding .body { box-shadow: 0 12px 26px -18px rgba(26, 31, 54, 0.5); }
.theme-boarding .assistant .body { border-top: 5px solid var(--band); }
.theme-boarding .user .body {
  position: relative;
  min-height: 96px;
  padding-right: calc(var(--stub) + 16px);
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.18;
  background:
    radial-gradient(circle at calc(100% - var(--stub)) 0, var(--bg) 8px, transparent 8.5px),
    radial-gradient(circle at calc(100% - var(--stub)) 100%, var(--bg) 8px, transparent 8.5px),
    linear-gradient(90deg, transparent calc(100% - var(--stub)), var(--stub-tint) 0),
    var(--surface);
}
.theme-boarding .user .body::before {
  content: "";
  position: absolute;
  top: 12px;
  bottom: 12px;
  right: var(--stub);
  border-left: 2px dashed var(--line);
}
.theme-boarding .user .body::after {
  content: "SEQ" "\A" counter(seq, decimal-leading-zero);
  white-space: pre;
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: var(--stub);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-family: var(--font-meta);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.12em;
  line-height: 1.25;
  color: var(--accent);
}
.theme-boarding .body li::marker { color: var(--accent); }
.theme-boarding .composer { background: var(--surface); }
.theme-boarding .composer textarea { background: var(--bg); border-color: transparent; }
.theme-boarding .composer textarea:focus { border-color: var(--accent); }
.theme-boarding .send { font-size: 0; padding: 0 20px; background: var(--send-bg); color: var(--send-ink); }
.theme-boarding .send::before { content: "BOARD"; font-family: var(--font-meta); font-size: 15px; font-weight: 700; letter-spacing: 0.14em; }


/* ============================================================
   RISO — a two-ink risograph print, slightly off-register
   ============================================================ */

.theme-riso {
  --bg: #f4f0e6;
  --surface: #fbf8f1;
  --ink: #0b6fb5;
  --muted: #6f93b4;
  --line: #0b6fb5;
  --accent: #ff4fae;
  --on-accent: #0b6fb5;
  --dots: radial-gradient(rgba(255, 79, 174, 0.95) 1.35px, transparent 1.75px) 0 0 / 4px 4px;
  --user-bg: var(--surface);
  --user-ink: #0a5d99;
  --bot-bg: transparent;
  --code-bg: rgba(11, 111, 181, 0.08);
  --font-body: "Bricolage Grotesque", system-ui, sans-serif;
  --font-display: var(--font-body);
  --font-meta: var(--font-body);
  --text: 15.5px;
  --leading: 1.55;
  --bubble-pad: 13px 16px;
  --bubble-radius: 14px;
  --gap: 26px;
  --measure: 84%;
  --radius: 14px;
}
.theme-riso .chat-header { border-bottom: 1.5px solid var(--ink); }
.theme-riso .chat-title {
  font-size: 34px;
  font-weight: 800;
  letter-spacing: -0.04em;
  text-transform: uppercase;
  text-shadow: 2.5px 1.5px 0 rgba(255, 79, 174, 0.85);
}
.theme-riso .model { border: 1.5px solid var(--ink); color: var(--ink); font-weight: 600; }
.theme-riso .who { font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); }
.theme-riso .user { position: relative; z-index: 0; margin-right: 6px; }
.theme-riso .user .who { text-align: right; }
.theme-riso .user .body {
  position: relative;
  border: 1.5px solid var(--ink);
  font-weight: 600;
}
.theme-riso .user .body::before {
  content: "";
  position: absolute;
  inset: -1.5px;
  z-index: -1;
  border-radius: inherit;
  transform: translate(6px, 6px);
  background: var(--dots);
}
.theme-riso .assistant { max-width: 100%; }
.theme-riso .assistant .body { padding-left: 0; padding-right: 0; }
.theme-riso .body li::marker { color: var(--accent); }
.theme-riso .body pre { border: 1.5px solid var(--ink); background: transparent; box-shadow: 4px 4px 0 rgba(255, 79, 174, 0.55); }
.theme-riso .body code { background: rgba(255, 79, 174, 0.18); }
.theme-riso .body pre code { background: none; }
.theme-riso .composer { border-top: 1.5px solid var(--ink); }
.theme-riso .composer textarea {
  background: var(--surface);
  border: 1.5px solid var(--ink);
  box-shadow: 4px 4px 0 rgba(255, 79, 174, 0.55);
}
.theme-riso .composer textarea:focus { border-color: var(--ink); box-shadow: 4px 4px 0 var(--accent); }
.theme-riso .send {
  color: var(--surface);
  background: var(--ink);
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border: 1.5px solid var(--ink);
  box-shadow: 3px 3px 0 var(--accent);
}


/* ============================================================
   LANTERN — carved, candle-lit, candy-corn striped
   ============================================================ */

.theme-lantern {
  --bg: #0f0a07;
  --surface: #1b130d;
  --ink: #f3e6cf;
  --muted: #9a8366;
  --line: #2d2119;
  --accent: #f28c28;
  --on-accent: #1b0e04;
  --glow: 242, 140, 40;
  --flame: #ffd36a;
  --user-bg: #241105;
  --user-ink: #ffd36a;
  --bot-bg: transparent;
  --code-bg: rgba(255, 200, 120, 0.06);
  --font-body: "Manrope", system-ui, sans-serif;
  --font-display: "Creepster", "Manrope", cursive;
  --font-meta: "Manrope", system-ui, sans-serif;
  --text: 15px;
  --leading: 1.62;
  --bubble-pad: 13px 18px;
  --bubble-radius: 22px;
  --gap: 24px;
  --measure: 86%;
  --radius: 999px;
  background: radial-gradient(ellipse 70% 45% at 50% 100%, rgba(var(--glow), 0.14), transparent 70%), var(--bg);
}
.theme-lantern .chat-header {
  margin-bottom: 6px;
  border-bottom: 0;
  box-shadow: 0 2px 0 #f7f1e3, 0 4px 0 #f28c28, 0 6px 0 #ffcf3f;
}
.theme-lantern .chat-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 31px;
  font-weight: 400;
  letter-spacing: 0.04em;
  color: var(--accent);
  text-shadow: 0 0 12px rgba(var(--glow), 0.6);
}
.theme-lantern .chat-title::before {
  content: "";
  flex-shrink: 0;
  width: 36px;
  height: 34px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 38'%3E%3Cpath d='M20 9c0-3 1-6 4-7' fill='none' stroke='%234f7a2a' stroke-width='3' stroke-linecap='round'/%3E%3Cpath d='M23 5c3-2 7-1 8 2-3 1-6 0-8-2z' fill='%236da33a'/%3E%3Cellipse cx='12' cy='23' rx='10' ry='13' fill='%23e8661a'/%3E%3Cellipse cx='28' cy='23' rx='10' ry='13' fill='%23e8661a'/%3E%3Cellipse cx='20' cy='23' rx='10' ry='14' fill='%23f58a2a'/%3E%3Cpath d='M20 10v26M12 11c-3 6-3 18 0 24M28 11c3 6 3 18 0 24' fill='none' stroke='%23c9530f' stroke-width='1' opacity='.6'/%3E%3Cpath d='M11 19l3.5-4.5 3.5 4.5z M22 19l3.5-4.5 3.5 4.5z' fill='%23ffd36a'/%3E%3Cpath d='M11 25q9 8 18 0q-3 1-4.5 1v2h-3v-1.5q-1.5.3-3 0v1.5h-3v-2q-1.5 0-4.5-1z' fill='%23ffd36a'/%3E%3Cellipse cx='9' cy='24' rx='2.2' ry='1.3' fill='%23ff9a6a' opacity='.5'/%3E%3Cellipse cx='31' cy='24' rx='2.2' ry='1.3' fill='%23ff9a6a' opacity='.5'/%3E%3C/svg%3E") 0 0 / 100% 100% no-repeat;
  filter: drop-shadow(0 0 8px rgba(var(--glow), 0.55));
}
.theme-lantern .model { border-color: var(--line); }
.theme-lantern .messages {
  background:
    repeating-conic-gradient(from 180deg at 100% 0, rgba(255, 255, 255, 0.09) 0 0.6deg, transparent 0.6deg 15deg) 100% 0 / 150px 150px no-repeat,
    repeating-radial-gradient(circle at 100% 0, transparent 0 17px, rgba(255, 255, 255, 0.07) 17px 18px) 100% 0 / 150px 150px no-repeat;
}
.theme-lantern .who { font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--accent); }
.theme-lantern .user .who { text-align: right; }
.theme-lantern .user .body {
  border: 2px solid #e8661a;
  font-weight: 700;
  text-shadow: 0 0 10px rgba(255, 210, 120, 0.75);
  animation: lantern-breathe 3.2s ease-in-out infinite alternate;
}
@keyframes lantern-breathe {
  from { box-shadow: 0 0 14px rgba(var(--glow), 0.28), inset 0 0 10px rgba(var(--glow), 0.16); }
  to { box-shadow: 0 0 26px rgba(var(--glow), 0.55), inset 0 0 16px rgba(var(--glow), 0.3); }
}

.theme-lantern .assistant { max-width: 100%; }
.theme-lantern .assistant .body { padding-left: 0; padding-right: 0; }
.theme-lantern .body li::marker { color: var(--accent); }
.theme-lantern .body code { color: var(--flame); }
.theme-lantern .body pre { border: 1px solid var(--line); border-radius: 14px; }
.theme-lantern .composer { border-top: 0; padding-bottom: 18px; align-items: center; }
.theme-lantern .composer textarea { min-height: 46px; border-radius: 23px; padding-left: 18px; }
.theme-lantern .composer textarea:focus { box-shadow: 0 0 14px rgba(var(--glow), 0.3); }
.theme-lantern .send { height: 46px; font-size: 0; padding: 0 22px; border-radius: 23px; }
.theme-lantern .send::before { content: "Carve"; padding-top: 2px; font-family: var(--font-display); font-size: 19px; letter-spacing: 0.06em; }
.theme-lantern .chat-title::before { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 38'%3E%3Cpath d='M20 10V3' stroke='%234b6a26' stroke-width='3.5' stroke-linecap='round'/%3E%3Cellipse cx='12' cy='23' rx='10' ry='13' fill='%23e8661a'/%3E%3Cellipse cx='28' cy='23' rx='10' ry='13' fill='%23e8661a'/%3E%3Cellipse cx='20' cy='23' rx='10' ry='14' fill='%23f58a2a'/%3E%3Cpath d='M20 10v26M12 11c-3 6-3 18 0 24M28 11c3 6 3 18 0 24' fill='none' stroke='%23c9530f' stroke-width='1' opacity='.6'/%3E%3Cpath d='M10 20l4-6 4 6zM22 20l4-6 4 6z' fill='%23ffd36a'/%3E%3Cpath d='M18 23l2-3 2 3z' fill='%23ffd36a'/%3E%3Cpath d='M9 26l3 3 3-2 3 3 2-2 2 2 3-3 3 2 3-3-2 6-4 2-4-1-4 1-4-2z' fill='%23ffd36a'/%3E%3C/svg%3E"); }


/* ============================================================
   POCKET — the 1989 handheld: pea-green screen, dialogue boxes
   ============================================================ */

.theme-pocket {
  --bg: #c9c5bf;
  --lcd: #9bbc0f;
  --lcd-2: #8bac0f;
  --lcd-3: #306230;
  --lcd-4: #0f380f;
  --bezel: #4f505e;
  --surface: var(--lcd);
  --ink: var(--lcd-4);
  --muted: var(--lcd-3);
  --line: var(--lcd-3);
  --accent: #9a2257;
  --on-accent: #ffffff;
  --navy: #2b2f7a;
  --user-bg: var(--lcd-4);
  --user-ink: var(--lcd);
  --bot-bg: var(--lcd-2);
  --code-bg: rgba(15, 56, 15, 0.12);
  --font-body: "VT323", ui-monospace, monospace;
  --font-display: "Nunito", "Arial Rounded MT Bold", sans-serif;
  --font-meta: "VT323", ui-monospace, monospace;
  --font-code: "VT323", ui-monospace, monospace;
  --text: 18px;
  --leading: 1.2;
  --bubble-pad: 10px 14px;
  --bubble-radius: 4px;
  --gap: 18px;
  --measure: 90%;
  --radius: 999px;
}
.theme-pocket .chat-header { color: var(--navy); border-bottom: 0; padding-block: 14px 8px; }
.theme-pocket .chat-title { font-size: 24px; font-weight: 800; font-style: italic; letter-spacing: -0.01em; }
.theme-pocket .chat-title::after { content: " ™"; font-size: 10px; vertical-align: super; font-style: normal; }
.theme-pocket .model { background: #b9b5ae; border: 0; color: var(--navy); box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.25); }
.theme-pocket .messages {
  margin: 0 14px;
  padding: 16px 14px;
  background: linear-gradient(rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0.05)), var(--lcd);
  border: 16px solid var(--bezel);
  border-top-width: 26px;
  padding-bottom: 30px;
  border-radius: 8px 8px 34px 8px;
  box-shadow: inset 0 0 10px rgba(15, 56, 15, 0.35);
}
.theme-pocket .who { font-size: 16px; margin-bottom: 2px; color: var(--lcd-3); }
.theme-pocket .user .who { text-align: right; }
.theme-pocket .user .who::before { content: "▶ "; }
.theme-pocket .assistant .body {
  position: relative;
  border: 3px solid var(--lcd-4);
  box-shadow: inset 0 0 0 2px var(--lcd-2), inset 0 0 0 3px var(--lcd-4);
  padding-bottom: 22px;
}
.theme-pocket .assistant .body::after {
  content: "▼";
  position: absolute;
  right: 10px;
  bottom: 2px;
  font-size: 14px;
  animation: pocket-blink 1s steps(2, start) infinite;
}
@keyframes pocket-blink { to { visibility: hidden; } }
.theme-pocket .streaming .body > :last-child::after { background: var(--lcd-4); }
.theme-pocket .body li::marker { content: "• "; }
.theme-pocket .body code { background: none; text-decoration: underline; }
.theme-pocket .body pre { font-size: 17px; line-height: 1.2; border: 2px dashed var(--lcd-3); border-radius: 0; }
.theme-pocket .body pre code { text-decoration: none; }
.theme-pocket .composer { border-top: 0; align-items: center; gap: 14px; padding-top: 16px; padding-bottom: 20px; }
.theme-pocket .composer::before {
  content: "";
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  background:
    linear-gradient(#2c2c2e, #2c2c2e) 50% 50% / 13px 100% no-repeat,
    linear-gradient(#2c2c2e, #2c2c2e) 50% 50% / 100% 13px no-repeat;
  filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.35));
}
.theme-pocket .composer textarea { background: #e4e1dc; border-color: #a9a59e; border-radius: 10px; color: #222; font-family: var(--font-body); font-size: 17px; }
.theme-pocket .send {
  width: 46px;
  height: 46px;
  padding: 0;
  font-size: 0;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #c2457c, var(--accent) 65%);
  box-shadow: 0 3px 0 #5e1435, 0 5px 6px rgba(0, 0, 0, 0.3);
}
.theme-pocket .send::before { content: "A"; font-family: var(--font-display); font-size: 15px; font-weight: 800; color: #f2d8e3; }
.theme-pocket .send:active { transform: translateY(2px); box-shadow: 0 1px 0 #5e1435; }


/* ============================================================
   TOMBSTONE — moonlight, fog, and a ghost who asks the questions
   ============================================================ */

.theme-tombstone {
  --bg: #11171b;
  --surface: #1a2226;
  --ink: #d6dfe1;
  --muted: #7d8b90;
  --line: #2a353a;
  --accent: #c9d6c2;
  --on-accent: #11171b;
  --user-bg: rgba(220, 235, 240, 0.07);
  --user-ink: #e4ecee;
  --bot-bg: transparent;
  --code-bg: rgba(255, 255, 255, 0.05);
  --font-body: "Spectral", Georgia, serif;
  --font-display: "Marcellus SC", Georgia, serif;
  --font-meta: "Marcellus SC", Georgia, serif;
  --text: 15.5px;
  --leading: 1.66;
  --bubble-pad: 12px 18px 13px;
  --bubble-radius: 22px 22px 6px 22px;
  --gap: 28px;
  --measure: 80%;
  --radius: 10px;
  position: relative;
  overflow: hidden;
  background: linear-gradient(#0b1013, #141c20 60%, #1b2427);
}
.theme-tombstone::after {
  content: "";
  position: absolute;
  left: -40%;
  right: -40%;
  bottom: 50px;
  height: 170px;
  pointer-events: none;
  background:
    radial-gradient(ellipse 22% 40% at 20% 60%, rgba(200, 215, 220, 0.13), transparent 70%),
    radial-gradient(ellipse 28% 45% at 52% 72%, rgba(200, 215, 220, 0.1), transparent 70%),
    radial-gradient(ellipse 20% 35% at 82% 58%, rgba(200, 215, 220, 0.13), transparent 70%);
  animation: tombstone-fog 18s ease-in-out infinite alternate;
}
@keyframes tombstone-fog { from { transform: translateX(-7%); } to { transform: translateX(7%); } }
@keyframes tombstone-float { to { transform: translateY(-4px); } }
.theme-tombstone .chat-header {
  border-bottom: 1px solid var(--line);
  background:
    radial-gradient(1px 1px at 22% 30%, #fff 50%, transparent),
    radial-gradient(1px 1px at 58% 70%, #fff 50%, transparent),
    radial-gradient(1.5px 1.5px at 44% 22%, #fff 50%, transparent),
    radial-gradient(1px 1px at 70% 28%, #fff 50%, transparent),
    radial-gradient(1px 1px at 36% 80%, #fff 50%, transparent);
}
.theme-tombstone .chat-title { display: flex; align-items: center; gap: 12px; font-size: 20px; letter-spacing: 0.22em; }
.theme-tombstone .chat-title::before {
  content: "";
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 35% 40%, rgba(0, 0, 0, 0.09) 0 3px, transparent 3.5px),
    radial-gradient(circle at 64% 66%, rgba(0, 0, 0, 0.08) 0 4px, transparent 4.5px),
    radial-gradient(circle at 60% 28%, rgba(0, 0, 0, 0.06) 0 2px, transparent 2.5px),
    #efe9d2;
  box-shadow: 0 0 18px rgba(239, 233, 210, 0.5);
}
.theme-tombstone .model { border-color: var(--line); }
.theme-tombstone .who { font-size: 11px; letter-spacing: 0.16em; }
.theme-tombstone .user .who { text-align: right; }
.theme-tombstone .user .body {
  font-size: 16px;
  font-style: italic;
  border: 1px solid rgba(220, 235, 240, 0.2);
  text-shadow: 0 0 10px rgba(220, 240, 245, 0.35);
  box-shadow: 0 0 26px rgba(200, 230, 235, 0.12), inset 0 0 18px rgba(200, 230, 235, 0.07);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
  animation: tombstone-float 6s ease-in-out infinite alternate-reverse;
}
.theme-tombstone .assistant { max-width: 100%; }
.theme-tombstone .assistant .who::before { content: "Whispered by "; }
.theme-tombstone .assistant .body {
  padding: 0;
  text-shadow: 0 0 14px rgba(200, 230, 235, 0.28);
  animation: tombstone-float 7s ease-in-out infinite alternate;
}
.theme-tombstone .body li::marker { color: var(--muted); }
.theme-tombstone .body code { color: var(--accent); }
.theme-tombstone .body pre { border: 1px solid var(--line); text-shadow: none; }
.theme-tombstone .composer { position: relative; z-index: 1; background: #0b1013; }
.theme-tombstone .composer textarea { background: rgba(255, 255, 255, 0.04); }
.theme-tombstone .send { font-size: 0; padding: 0 18px; }
.theme-tombstone .send::before { content: "Whisper"; font-family: var(--font-display); font-size: 13px; letter-spacing: 0.12em; }


/* ============================================================
   GROOVE — a 1970s record sleeve in sunset colours. Questions are tracks.
   ============================================================ */

.theme-groove {
  --bg: #f4e6d0;
  --surface: #fbf2e4;
  --ink: #3b2414;
  --muted: #8c6f52;
  --line: #e2cba9;
  --accent: #c2410c;
  --on-accent: #faf3e3;
  --sleeve: #4a2a17;
  --sleeve-ink: #f6d38a;
  --label: #e9b22b;
  --stripe-1: #e9b22b;
  --stripe-2: #e07a1f;
  --stripe-3: #c2410c;
  --groove: repeating-radial-gradient(circle, #1a120c 0 1.2px, #2a1f17 1.2px 2.4px);
  --user-bg: transparent;
  --bot-bg: transparent;
  --code-bg: #ecdcc1;
  --font-body: "Literata", Georgia, serif;
  --font-display: "Righteous", "Unbounded", system-ui, sans-serif;
  --font-meta: "Unbounded", system-ui, sans-serif;
  --font-code: "DM Mono", ui-monospace, monospace;
  --text: 15px;
  --leading: 1.62;
  --bubble-pad: 0;
  --gap: 0px;
  --edge: 20px;
  --measure: 100%;
  --user-align: stretch;
  --radius: 8px;
  counter-reset: track;
}
.theme-groove .chat-header {
  position: relative;
  overflow: hidden;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 10px;
  min-height: 108px;
  margin-bottom: 15px;
  color: var(--sleeve-ink);
  background: var(--sleeve);
  border-bottom: 0;
  box-shadow: 0 5px 0 var(--stripe-1), 0 10px 0 var(--stripe-2), 0 15px 0 var(--stripe-3);
}
.theme-groove .chat-header::after {
  content: "";
  position: absolute;
  right: -48px;
  top: 50%;
  width: 150px;
  height: 150px;
  margin-top: -75px;
  border-radius: 50%;
  background:
    linear-gradient(var(--surface), var(--surface)) 50% 40% / 9px 2px no-repeat,
    radial-gradient(circle, var(--surface) 0 2.5px, var(--label) 3px 23px, #1a120c 23.5px 25px, transparent 25.5px),
    conic-gradient(rgba(255, 240, 210, 0.12), transparent 12%, transparent 38%, rgba(255, 240, 210, 0.12) 50%, transparent 62%, transparent 88%, rgba(255, 240, 210, 0.12)),
    var(--groove);
  box-shadow: -8px 0 20px rgba(0, 0, 0, 0.35);
  animation: groove-spin 4s linear infinite;
}
@keyframes groove-spin { to { transform: rotate(360deg); } }
.theme-groove .chat-title { position: relative; z-index: 1; font-size: 36px; font-weight: 400; letter-spacing: 0.01em; line-height: 0.9; }
.theme-groove .chat-title::after { content: "Long play · 33⅓ rpm"; display: block; margin-top: 8px; font-family: var(--font-meta); font-size: 9px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; }
.theme-groove .model { position: relative; z-index: 1; background: var(--sleeve-ink); color: var(--sleeve); border: 0; font-family: var(--font-meta); font-size: 10.5px; letter-spacing: 0.06em; }
.theme-groove .messages { padding-top: 6px; }
.theme-groove .user { counter-increment: track; padding: 18px 0 14px; border-bottom: 2px solid var(--ink); }
.theme-groove .user .who { display: none; }
.theme-groove .user .body { display: flex; align-items: baseline; gap: 14px; font-family: var(--font-display); font-size: 19px; line-height: 1.25; }
.theme-groove .user .body::before { content: "A" counter(track); flex-shrink: 0; font-family: var(--font-code); font-size: 12px; font-weight: 500; color: var(--accent); }
.theme-groove .assistant { padding: 16px 0 24px; }
.theme-groove .assistant .who { font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; }
.theme-groove .assistant .who::before { content: "Liner notes · "; color: var(--accent); }
.theme-groove .body li::marker { color: var(--accent); }
.theme-groove .body pre { border-left: 3px solid var(--accent); border-radius: 0 8px 8px 0; }
.theme-groove .composer { border-top: 2px solid var(--ink); align-items: center; }
.theme-groove .composer textarea { background: var(--surface); border-radius: 22px; padding-left: 18px; }
.theme-groove .send {
  width: 46px;
  height: 46px;
  padding: 0;
  font-size: 0;
  border-radius: 50%;
  background: radial-gradient(circle, var(--surface) 0 2px, var(--label) 2.5px 9px, transparent 9.5px), var(--groove);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
}
.theme-groove .send:hover { animation: groove-spin 1.8s linear infinite; opacity: 1; }


/* ============================================================
   TASKBAR — the early-2000s desktop: blue title bars,
   balloon tips, a rolling green hill and a green start button
   ============================================================ */

.theme-taskbar {
  --bg: #ece9d8;
  --surface: #ffffff;
  --ink: #000000;
  --muted: #3b3b3b;
  --line: #7f9db9;
  --accent: #2f8a2f;
  --on-accent: #ffffff;
  --title: linear-gradient(#3d95ff, #0a5fe8 9%, #0055e5 45%, #0050de 85%, #0042c3);
  --title-ink: #ffffff;
  --title-shadow: 1px 1px 0 #0f1089;
  --frame: #0053e1;
  --frame-dark: #0831d9;
  --bar: linear-gradient(#3168d5, #4993e6 4%, #2157d7 12%, #2663e0 60%, #1941a5);
  --tray: linear-gradient(#0c59b9, #139ee9 6%, #18a8f2 12%, #1190e3 60%, #0c76cf);
  --tray-edge: #18bbff;
  --tray-ink: #ffffff;
  --user-bg: #ffffff;
  --bot-bg: #ffffe1;
  --code-bg: #f4f3ee;
  --font-body: Tahoma, Verdana, "Segoe UI", sans-serif;
  --font-display: "Trebuchet MS", Tahoma, sans-serif;
  --font-meta: Tahoma, Verdana, sans-serif;
  --font-code: "Lucida Console", Consolas, monospace;
  --text: 13.5px;
  --leading: 1.5;
  --bubble-pad: 10px 12px;
  --bubble-radius: 0;
  --gap: 22px;
  --measure: 90%;
  --radius: 3px;
}
.theme-taskbar .chat-header { background: var(--title); color: var(--title-ink); border-bottom: 1px solid var(--frame-dark); padding-block: 9px; }
.theme-taskbar .chat-title { flex: 1; font-size: 15px; font-weight: 700; text-shadow: var(--title-shadow); }
.theme-taskbar .chat-header::after {
  content: "✕";
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  font: 700 12px var(--font-meta);
  color: #fff;
  background: linear-gradient(#ee8a6b, #e2582f 45%, #c8401b);
  border: 1px solid #fff;
  border-radius: 3px;
}
.theme-taskbar .model { border-radius: 0; color: #000; background: #fff; border-color: var(--line); font-size: 11px; padding: 3px 8px; }
.theme-taskbar .messages {
  background:
    radial-gradient(ellipse 18% 5% at 22% 16%, rgba(255, 255, 255, 0.85), transparent 70%),
    radial-gradient(ellipse 14% 4% at 70% 10%, rgba(255, 255, 255, 0.7), transparent 70%),
    radial-gradient(ellipse 160% 50% at 25% 112%, #6db640 0 56%, transparent 56.4%),
    radial-gradient(ellipse 120% 44% at 95% 116%, #4f9a2d 0 52%, transparent 52.4%),
    linear-gradient(#2f6fd0, #6aa6ea 42%, #b9d7f4 68%, #d9eaf8);
}
.theme-taskbar .user .who {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0;
  padding: 3px 4px 3px 8px;
  font: 700 12px var(--font-display);
  color: var(--title-ink);
  background: var(--title);
  border-radius: 6px 6px 0 0;
  text-shadow: var(--title-shadow);
}
.theme-taskbar .user .who::after {
  content: "✕";
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  font-size: 9px;
  background: linear-gradient(#ee8a6b, #e2582f 45%, #c8401b);
  border: 1px solid #fff;
  border-radius: 3px;
}
.theme-taskbar .user .body { border: 3px solid var(--frame); border-top: 0; box-shadow: 2px 3px 6px rgba(0, 0, 0, 0.3); }
.theme-taskbar .assistant .who {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  color: #000;
  text-shadow: 0 0 4px rgba(255, 255, 255, 0.8);
}
.theme-taskbar .assistant .who::before {
  content: "i";
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  font: italic 700 11px Georgia, serif;
  color: #fff;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #8cbcff, #1c58d4);
}
.theme-taskbar .assistant .body {
  position: relative;
  margin-top: 10px;
  border: 1px solid #000;
  border-radius: 7px;
  box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.35);
}
.theme-taskbar .assistant .body::before,
.theme-taskbar .assistant .body::after {
  content: "";
  position: absolute;
  clip-path: polygon(0 100%, 0 0, 100% 100%);
}
.theme-taskbar .assistant .body::before { top: -12px; left: 18px; width: 14px; height: 12px; background: #000; }
.theme-taskbar .assistant .body::after { top: -10px; left: 19px; width: 12px; height: 11px; background: var(--bot-bg); }
.theme-taskbar .body pre { border: 1px solid var(--line); border-radius: 0; }
.theme-taskbar .composer {
  align-items: stretch;
  gap: 8px;
  padding: 0;
  background: var(--bar);
  border-top: 1px solid var(--frame-dark);
}
.theme-taskbar .composer textarea {
  align-self: center;
  margin: 6px 0;
  min-height: 34px;
  border-radius: 0;
  background: #fff;
  border-color: var(--line);
  font-size: 12.5px;
}
.theme-taskbar .send {
  height: auto;
  padding: 0 14px 0 20px;
  font-size: 0;
  border-radius: 16px 0 0 16px;
  background: linear-gradient(#3c9b3c, #55c255 12%, #339933 50%, #2a8a2a 86%, #1e6a1e);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45), -3px 0 4px rgba(0, 0, 0, 0.35);
}
.theme-taskbar .send::before { content: "start"; font: italic 700 18px var(--font-display); color: #fff; text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.5); }
.theme-taskbar .composer::after {
  content: "10:07 PM";
  order: -1;
  display: flex;
  align-items: center;
  padding: 0 12px;
  font: 11px var(--font-meta);
  color: var(--tray-ink);
  background: var(--tray);
  border-right: 1px solid var(--frame-dark);
  box-shadow: inset -1px 0 0 var(--tray-edge);
}


/* ============================================================
   SPRINGFIELD — opening-credits sky, cartoon outlines, a donut.
   Add    ============================================================ */

.theme-springfield {
  --bg: #70c2ec;
  --surface: #ffffff;
  --ink: #26221d;
  --muted: #2f5d7a;
  --line: #26221d;
  --accent: #ffd90f;
  --on-accent: #26221d;
  --marge: #2f6fbf;
  --couch: #8b5a2b;
  --cloud: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 80'%3E%3Cg fill='white'%3E%3Ccircle cx='50' cy='50' r='24'/%3E%3Ccircle cx='85' cy='36' r='30'/%3E%3Ccircle cx='124' cy='45' r='26'/%3E%3Ccircle cx='153' cy='55' r='19'/%3E%3Crect x='40' y='50' width='126' height='24' rx='12'/%3E%3C/g%3E%3C/svg%3E");
  --sprinkles: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cg stroke-width='2.4' stroke-linecap='round'%3E%3Cpath d='M14 14l3 2' stroke='white'/%3E%3Cpath d='M30 10l-3 2' stroke='%23ffd90f'/%3E%3Cpath d='M36 22l1 3' stroke='%2370c2ec'/%3E%3Cpath d='M33 35l-3 1' stroke='white'/%3E%3Cpath d='M18 36l2-2' stroke='%23ffd90f'/%3E%3Cpath d='M10 26l1-3' stroke='%2370c2ec'/%3E%3Cpath d='M24 9l2 1' stroke='%23e8443a'/%3E%3Cpath d='M38 30l-2 2' stroke='%23e8443a'/%3E%3C/g%3E%3C/svg%3E");
  --user-bg: #ffd90f;
  --bot-bg: #ffffff;
  --code-bg: #f3f7fa;
  --font-body: "Fredoka", system-ui, sans-serif;
  --font-display: "Fredoka", system-ui, sans-serif;
  --font-meta: "Fredoka", system-ui, sans-serif;
  --text: 15.5px;
  --leading: 1.5;
  --bubble-pad: 12px 18px;
  --bubble-radius: 22px;
  --gap: 20px;
  --measure: 86%;
  --radius: 10px;
  background:
    var(--cloud) 8% 6% / 210px 84px no-repeat,
    var(--cloud) 112% 44% / 180px 72px no-repeat,
    var(--cloud) -50px 84% / 230px 92px no-repeat,
    linear-gradient(#4aa8de, #70c2ec 45%, #a8dcf5);
}
.theme-springfield .chat-header { padding-top: 18px; padding-bottom: 14px; border-bottom: 0; }
.theme-springfield .chat-title {
  font-family: var(--font-body);
  font-size: 29px;
  font-weight: 700;
  letter-spacing: 0.005em;
  color: var(--accent);
  -webkit-text-stroke: 2px var(--ink);
  paint-order: stroke fill;
  text-shadow: 3px 3px 0 var(--ink);
}
.theme-springfield .model { background: #fff; border: 2.5px solid var(--ink); color: var(--ink); font-weight: 600; }
.theme-springfield .who { display: none; }
.theme-springfield .body { border: 2.5px solid var(--ink); box-shadow: 3px 3px 0 var(--ink); }
.theme-springfield .user .body { font-weight: 600; border-bottom-right-radius: 6px; }
.theme-springfield .assistant .body { border-bottom-left-radius: 6px; }
.theme-springfield .body li::marker { color: #e8443a; }
.theme-springfield .body pre { border: 2px solid var(--ink); box-shadow: none; }
.theme-springfield .composer { align-items: center; padding-bottom: 18px; background: var(--accent); border-top: 3px solid var(--ink); }
.theme-springfield .composer textarea { background: #fff; border: 2.5px solid var(--ink); border-radius: 22px; padding-left: 18px; box-shadow: 3px 3px 0 var(--ink); }
.theme-springfield .send {
  width: 52px;
  height: 52px;
  padding: 0;
  font-size: 0;
  border-radius: 50%;
  border: 2.5px solid var(--ink);
  background:
    var(--sprinkles) 50% 50% / 100% 100% no-repeat,
    radial-gradient(circle, var(--accent) 0 7px, var(--ink) 7.5px 9px, #f59fc6 9.5px 17px, #e2ad63 17.5px);
  box-shadow: 3px 3px 0 var(--ink);
}


/* ============================================================
   SANDIA — New Mexico at dusk: watermelon mountains, balloons
   drifting past as you scroll, turquoise and chile red
   ============================================================ */

.theme-sandia {
  --bg: #f6e3d3;
  --surface: #fffaf3;
  --ink: #33262a;
  --muted: #8f7470;
  --line: #ead3c2;
  --accent: #bf0a30;
  --on-accent: #fffaf3;
  --turquoise: #2fa69c;
  --sun: #ffcf2e;
  --balloons: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 360 760'%3E%3Cg transform='translate%2860 90%29 scale%281.0%29' opacity='.92'%3E%3Cpath d='M20 2C9 2 2 10 2 20c0 10 8 17 13 24h10c5-7 13-14 13-24C38 10 31 2 20 2z' fill='%23bf0a30'/%3E%3Cpath d='M20 2c-5 0-8 8-8 18 0 10 3 17 5 24h6c2-7 5-14 5-24 0-10-3-18-8-18z' fill='%23ffcf2e'/%3E%3Cpath d='M15 44l1 4M25 44l-1 4' stroke='%236b4428' stroke-width='1'/%3E%3Crect x='16' y='48' width='8' height='6' rx='1' fill='%236b4428'/%3E%3C/g%3E%3Cg transform='translate%28250 180%29 scale%280.7%29' opacity='.92'%3E%3Cpath d='M20 2C9 2 2 10 2 20c0 10 8 17 13 24h10c5-7 13-14 13-24C38 10 31 2 20 2z' fill='%232fa69c'/%3E%3Cpath d='M20 2c-5 0-8 8-8 18 0 10 3 17 5 24h6c2-7 5-14 5-24 0-10-3-18-8-18z' fill='%23ffffff'/%3E%3Cpath d='M15 44l1 4M25 44l-1 4' stroke='%236b4428' stroke-width='1'/%3E%3Crect x='16' y='48' width='8' height='6' rx='1' fill='%236b4428'/%3E%3C/g%3E%3Cg transform='translate%28140 330%29 scale%280.55%29' opacity='.92'%3E%3Cpath d='M20 2C9 2 2 10 2 20c0 10 8 17 13 24h10c5-7 13-14 13-24C38 10 31 2 20 2z' fill='%23f08a24'/%3E%3Cpath d='M20 2c-5 0-8 8-8 18 0 10 3 17 5 24h6c2-7 5-14 5-24 0-10-3-18-8-18z' fill='%233b5b9a'/%3E%3Cpath d='M15 44l1 4M25 44l-1 4' stroke='%236b4428' stroke-width='1'/%3E%3Crect x='16' y='48' width='8' height='6' rx='1' fill='%236b4428'/%3E%3C/g%3E%3Cg transform='translate%28300 420%29 scale%280.9%29' opacity='.92'%3E%3Cpath d='M20 2C9 2 2 10 2 20c0 10 8 17 13 24h10c5-7 13-14 13-24C38 10 31 2 20 2z' fill='%23ffcf2e'/%3E%3Cpath d='M20 2c-5 0-8 8-8 18 0 10 3 17 5 24h6c2-7 5-14 5-24 0-10-3-18-8-18z' fill='%23bf0a30'/%3E%3Cpath d='M15 44l1 4M25 44l-1 4' stroke='%236b4428' stroke-width='1'/%3E%3Crect x='16' y='48' width='8' height='6' rx='1' fill='%236b4428'/%3E%3C/g%3E%3Cg transform='translate%2850 560%29 scale%280.65%29' opacity='.92'%3E%3Cpath d='M20 2C9 2 2 10 2 20c0 10 8 17 13 24h10c5-7 13-14 13-24C38 10 31 2 20 2z' fill='%237a4fb5'/%3E%3Cpath d='M20 2c-5 0-8 8-8 18 0 10 3 17 5 24h6c2-7 5-14 5-24 0-10-3-18-8-18z' fill='%23ffcf2e'/%3E%3Cpath d='M15 44l1 4M25 44l-1 4' stroke='%236b4428' stroke-width='1'/%3E%3Crect x='16' y='48' width='8' height='6' rx='1' fill='%236b4428'/%3E%3C/g%3E%3Cg transform='translate%28210 650%29 scale%280.5%29' opacity='.92'%3E%3Cpath d='M20 2C9 2 2 10 2 20c0 10 8 17 13 24h10c5-7 13-14 13-24C38 10 31 2 20 2z' fill='%232fa69c'/%3E%3Cpath d='M20 2c-5 0-8 8-8 18 0 10 3 17 5 24h6c2-7 5-14 5-24 0-10-3-18-8-18z' fill='%23f08a24'/%3E%3Cpath d='M15 44l1 4M25 44l-1 4' stroke='%236b4428' stroke-width='1'/%3E%3Crect x='16' y='48' width='8' height='6' rx='1' fill='%236b4428'/%3E%3C/g%3E%3C/svg%3E");
  --sandias: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 120' preserveAspectRatio='none'%3E%3Cpath d='M0 120V78L30 74 60 68 95 60 120 56 150 48 175 44 200 38 225 34 248 28 262 22 276 26 292 24 310 32 335 42 360 54 400 66V120z' fill='%23e79a9b'/%3E%3Cpath d='M0 78L30 74 60 68 95 60 120 56 150 48 175 44 200 38 225 34 248 28 262 22 276 26 292 24 310 32 335 42 360 54 400 66' fill='none' stroke='%236e8c5a' stroke-width='3'/%3E%3Cpath d='M0 120V98L50 94 110 98 170 90 230 96 300 88 360 94 400 90V120z' fill='%23c46f7a'/%3E%3C/svg%3E");
  --user-bg: var(--turquoise);
  --user-ink: #ffffff;
  --bot-bg: rgba(255, 250, 243, 0.86);
  --code-bg: #f5e7da;
  --font-body: "Mulish", system-ui, sans-serif;
  --font-display: "DM Serif Display", Georgia, serif;
  --font-meta: "Mulish", system-ui, sans-serif;
  --text: 15px;
  --leading: 1.6;
  --bubble-pad: 12px 16px;
  --bubble-radius: 18px;
  --gap: 18px;
  --measure: 86%;
  --radius: 999px;
}
.theme-sandia .chat-header {
  margin-bottom: 6px;
  padding-block: 16px 14px;
  background: var(--surface);
  border-bottom: 0;
  box-shadow: 0 3px 0 var(--sun), 0 6px 0 var(--accent);
}
.theme-sandia .chat-title { display: flex; align-items: center; gap: 10px; font-size: 27px; font-weight: 400; color: var(--turquoise); }
.theme-sandia .chat-title::before {
  content: "";
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--sun) 0 6px, transparent 6.5px), repeating-conic-gradient(var(--sun) 0 8deg, transparent 8deg 30deg);
  -webkit-mask: radial-gradient(circle, #000 0 6px, transparent 6.5px 7.5px, #000 8px);
  mask: radial-gradient(circle, #000 0 6px, transparent 6.5px 7.5px, #000 8px);
}
.theme-sandia .model { background: #fff; border-color: var(--line); color: var(--ink); }
.theme-sandia .messages {
  background:
    var(--balloons) 0 0 / 360px 760px repeat,
    var(--sandias) 0 100% / 100% 120px no-repeat,
    linear-gradient(#cfdfee, #f4e2d6 52%, #f6c5b4);
  background-attachment: local, scroll, scroll;
}
.theme-sandia .who { display: none; }
.theme-sandia .user .body { font-weight: 600; border-bottom-right-radius: 6px; box-shadow: 0 8px 18px -12px rgba(20, 90, 84, 0.8); }
.theme-sandia .assistant .body {
  border: 1px solid rgba(234, 211, 194, 0.9);
  border-bottom-left-radius: 6px;
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  box-shadow: 0 10px 22px -16px rgba(120, 60, 50, 0.5);
}
.theme-sandia .body li::marker { color: var(--accent); }
.theme-sandia .body pre { border-left: 3px solid var(--turquoise); }
.theme-sandia .composer { border-top: 0; background: var(--surface); box-shadow: 0 -3px 0 var(--sun), 0 -6px 0 var(--accent); }
.theme-sandia .composer textarea { background: #fff; border-color: var(--line); border-radius: 22px; padding-left: 18px; }
.theme-sandia .send { padding: 0 22px; font-weight: 800; letter-spacing: 0.04em; }


@media (prefers-reduced-motion: reduce) {
  .theme-aqua .send,
  .theme-chomp .chat-title::before,
  .theme-chomp .send { animation: none; }
}


/* ============================================================
   ADOBE — New Mexico at high noon: a stepped parapet, a chile
   ristra, stucco walls and a turquoise door
   ============================================================ */

.theme-adobe {
  --bg: #f6e3d3;
  --surface: #fffaf3;
  --ink: #33262a;
  --muted: #8f7470;
  --line: #ead3c2;
  --accent: #bf0a30;
  --on-accent: #fffaf3;
  --turquoise: #2fa69c;
  --sun: #ffcf2e;
  --balloons: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 360 760'%3E%3Cg transform='translate%2860 90%29 scale%281.0%29' opacity='.92'%3E%3Cpath d='M20 2C9 2 2 10 2 20c0 10 8 17 13 24h10c5-7 13-14 13-24C38 10 31 2 20 2z' fill='%23bf0a30'/%3E%3Cpath d='M20 2c-5 0-8 8-8 18 0 10 3 17 5 24h6c2-7 5-14 5-24 0-10-3-18-8-18z' fill='%23ffcf2e'/%3E%3Cpath d='M15 44l1 4M25 44l-1 4' stroke='%236b4428' stroke-width='1'/%3E%3Crect x='16' y='48' width='8' height='6' rx='1' fill='%236b4428'/%3E%3C/g%3E%3Cg transform='translate%28250 180%29 scale%280.7%29' opacity='.92'%3E%3Cpath d='M20 2C9 2 2 10 2 20c0 10 8 17 13 24h10c5-7 13-14 13-24C38 10 31 2 20 2z' fill='%232fa69c'/%3E%3Cpath d='M20 2c-5 0-8 8-8 18 0 10 3 17 5 24h6c2-7 5-14 5-24 0-10-3-18-8-18z' fill='%23ffffff'/%3E%3Cpath d='M15 44l1 4M25 44l-1 4' stroke='%236b4428' stroke-width='1'/%3E%3Crect x='16' y='48' width='8' height='6' rx='1' fill='%236b4428'/%3E%3C/g%3E%3Cg transform='translate%28140 330%29 scale%280.55%29' opacity='.92'%3E%3Cpath d='M20 2C9 2 2 10 2 20c0 10 8 17 13 24h10c5-7 13-14 13-24C38 10 31 2 20 2z' fill='%23f08a24'/%3E%3Cpath d='M20 2c-5 0-8 8-8 18 0 10 3 17 5 24h6c2-7 5-14 5-24 0-10-3-18-8-18z' fill='%233b5b9a'/%3E%3Cpath d='M15 44l1 4M25 44l-1 4' stroke='%236b4428' stroke-width='1'/%3E%3Crect x='16' y='48' width='8' height='6' rx='1' fill='%236b4428'/%3E%3C/g%3E%3Cg transform='translate%28300 420%29 scale%280.9%29' opacity='.92'%3E%3Cpath d='M20 2C9 2 2 10 2 20c0 10 8 17 13 24h10c5-7 13-14 13-24C38 10 31 2 20 2z' fill='%23ffcf2e'/%3E%3Cpath d='M20 2c-5 0-8 8-8 18 0 10 3 17 5 24h6c2-7 5-14 5-24 0-10-3-18-8-18z' fill='%23bf0a30'/%3E%3Cpath d='M15 44l1 4M25 44l-1 4' stroke='%236b4428' stroke-width='1'/%3E%3Crect x='16' y='48' width='8' height='6' rx='1' fill='%236b4428'/%3E%3C/g%3E%3Cg transform='translate%2850 560%29 scale%280.65%29' opacity='.92'%3E%3Cpath d='M20 2C9 2 2 10 2 20c0 10 8 17 13 24h10c5-7 13-14 13-24C38 10 31 2 20 2z' fill='%237a4fb5'/%3E%3Cpath d='M20 2c-5 0-8 8-8 18 0 10 3 17 5 24h6c2-7 5-14 5-24 0-10-3-18-8-18z' fill='%23ffcf2e'/%3E%3Cpath d='M15 44l1 4M25 44l-1 4' stroke='%236b4428' stroke-width='1'/%3E%3Crect x='16' y='48' width='8' height='6' rx='1' fill='%236b4428'/%3E%3C/g%3E%3Cg transform='translate%28210 650%29 scale%280.5%29' opacity='.92'%3E%3Cpath d='M20 2C9 2 2 10 2 20c0 10 8 17 13 24h10c5-7 13-14 13-24C38 10 31 2 20 2z' fill='%232fa69c'/%3E%3Cpath d='M20 2c-5 0-8 8-8 18 0 10 3 17 5 24h6c2-7 5-14 5-24 0-10-3-18-8-18z' fill='%23f08a24'/%3E%3Cpath d='M15 44l1 4M25 44l-1 4' stroke='%236b4428' stroke-width='1'/%3E%3Crect x='16' y='48' width='8' height='6' rx='1' fill='%236b4428'/%3E%3C/g%3E%3C/svg%3E");
  --sandias: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 120' preserveAspectRatio='none'%3E%3Cpath d='M0 120V78L30 74 60 68 95 60 120 56 150 48 175 44 200 38 225 34 248 28 262 22 276 26 292 24 310 32 335 42 360 54 400 66V120z' fill='%23e79a9b'/%3E%3Cpath d='M0 78L30 74 60 68 95 60 120 56 150 48 175 44 200 38 225 34 248 28 262 22 276 26 292 24 310 32 335 42 360 54 400 66' fill='none' stroke='%236e8c5a' stroke-width='3'/%3E%3Cpath d='M0 120V98L50 94 110 98 170 90 230 96 300 88 360 94 400 90V120z' fill='%23c46f7a'/%3E%3C/svg%3E");
  --user-bg: var(--turquoise);
  --user-ink: #ffffff;
  --bot-bg: rgba(255, 250, 243, 0.86);
  --code-bg: #f5e7da;
  --font-body: "Mulish", system-ui, sans-serif;
  --font-display: "DM Serif Display", Georgia, serif;
  --font-meta: "Mulish", system-ui, sans-serif;
  --text: 15px;
  --leading: 1.6;
  --bubble-pad: 12px 16px;
  --bubble-radius: 18px;
  --gap: 18px;
  --measure: 86%;
  --radius: 999px;
}
.theme-adobe .chat-header {
  margin-bottom: 6px;
  padding-block: 16px 14px;
  background: var(--surface);
  border-bottom: 0;
  box-shadow: 0 3px 0 var(--sun), 0 6px 0 var(--accent);
}
.theme-adobe .chat-title { display: flex; align-items: center; gap: 10px; font-size: 27px; font-weight: 400; color: var(--turquoise); }
.theme-adobe .chat-title::before {
  content: "";
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--sun) 0 6px, transparent 6.5px), repeating-conic-gradient(var(--sun) 0 8deg, transparent 8deg 30deg);
  -webkit-mask: radial-gradient(circle, #000 0 6px, transparent 6.5px 7.5px, #000 8px);
  mask: radial-gradient(circle, #000 0 6px, transparent 6.5px 7.5px, #000 8px);
}
.theme-adobe .model { background: #fff; border-color: var(--line); color: var(--ink); }
.theme-adobe .messages {
  background:
    var(--balloons) 0 0 / 360px 760px repeat,
    var(--sandias) 0 100% / 100% 120px no-repeat,
    linear-gradient(#cfdfee, #f4e2d6 52%, #f6c5b4);
  background-attachment: local, scroll, scroll;
}
.theme-adobe .who { display: none; }
.theme-adobe .user .body { font-weight: 600; border-bottom-right-radius: 6px; box-shadow: 0 8px 18px -12px rgba(20, 90, 84, 0.8); }
.theme-adobe .assistant .body {
  border: 1px solid rgba(234, 211, 194, 0.9);
  border-bottom-left-radius: 6px;
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  box-shadow: 0 10px 22px -16px rgba(120, 60, 50, 0.5);
}
.theme-adobe .body li::marker { color: var(--accent); }
.theme-adobe .body pre { border-left: 3px solid var(--turquoise); }
.theme-adobe .composer { border-top: 0; background: var(--surface); box-shadow: 0 -3px 0 var(--sun), 0 -6px 0 var(--accent); }
.theme-adobe .composer textarea { background: #fff; border-color: var(--line); border-radius: 22px; padding-left: 18px; }
.theme-adobe .send { padding: 0 22px; font-weight: 800; letter-spacing: 0.04em; }


@media (prefers-reduced-motion: reduce) {
  .theme-aqua .send,
  .theme-chomp .chat-title::before,
  .theme-chomp .send { animation: none; }
}
.theme-adobe {
  --parapet: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 40' preserveAspectRatio='none'%3E%3Cpath d='M0 40V18h60v-8h60v8h50V6h60v12h50v-6h60v6h60v22z' fill='%23e6c49c'/%3E%3Crect x='14' y='23' width='6' height='4' fill='%236b4423'/%3E%3Crect x='46' y='23' width='6' height='4' fill='%236b4423'/%3E%3Crect x='78' y='23' width='6' height='4' fill='%236b4423'/%3E%3Crect x='110' y='23' width='6' height='4' fill='%236b4423'/%3E%3Crect x='142' y='23' width='6' height='4' fill='%236b4423'/%3E%3Crect x='174' y='23' width='6' height='4' fill='%236b4423'/%3E%3Crect x='206' y='23' width='6' height='4' fill='%236b4423'/%3E%3Crect x='238' y='23' width='6' height='4' fill='%236b4423'/%3E%3Crect x='270' y='23' width='6' height='4' fill='%236b4423'/%3E%3Crect x='302' y='23' width='6' height='4' fill='%236b4423'/%3E%3Crect x='334' y='23' width='6' height='4' fill='%236b4423'/%3E%3Crect x='366' y='23' width='6' height='4' fill='%236b4423'/%3E%3Crect x='398' y='23' width='6' height='4' fill='%236b4423'/%3E%3C/svg%3E");
  --ristra: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 78'%3E%3Cpath d='M9 0V74' stroke='%236b4423' stroke-width='1.5'/%3E%3Ccircle cx='9' cy='4' r='2.5' fill='%235b7a3a'/%3E%3Cellipse cx='12' cy='10' rx='3.2' ry='6' fill='%23cf3a22' transform='rotate%2825 12 10%29'/%3E%3Cellipse cx='6' cy='17' rx='3.2' ry='6' fill='%23b5281d' transform='rotate%28-25 6 17%29'/%3E%3Cellipse cx='12' cy='24' rx='3.2' ry='6' fill='%23b5281d' transform='rotate%2825 12 24%29'/%3E%3Cellipse cx='6' cy='31' rx='3.2' ry='6' fill='%23cf3a22' transform='rotate%28-25 6 31%29'/%3E%3Cellipse cx='12' cy='38' rx='3.2' ry='6' fill='%23b5281d' transform='rotate%2825 12 38%29'/%3E%3Cellipse cx='6' cy='45' rx='3.2' ry='6' fill='%23b5281d' transform='rotate%28-25 6 45%29'/%3E%3Cellipse cx='12' cy='52' rx='3.2' ry='6' fill='%23cf3a22' transform='rotate%2825 12 52%29'/%3E%3Cellipse cx='6' cy='59' rx='3.2' ry='6' fill='%23b5281d' transform='rotate%28-25 6 59%29'/%3E%3Cellipse cx='12' cy='66' rx='3.2' ry='6' fill='%23b5281d' transform='rotate%2825 12 66%29'/%3E%3C/svg%3E");
  --bg: #e6c49c;
  --surface: #f6e4cc;
  --ink: #3b2416;
  --muted: #8a654a;
  --line: #d4ab80;
  --accent: #b5281d;
  --turquoise: #1f9c95;
  --user-bg: var(--turquoise);
  --bot-bg: #f6e4cc;
  --code-bg: #ecd4b6;
  --bubble-radius: 22px;
  --font-display: "Rye", "DM Serif Display", Georgia, serif;
}
.theme-adobe .chat-header {
  position: relative;
  min-height: 112px;
  align-items: flex-start;
  padding-right: 44px;
  margin-bottom: 0;
  background: var(--parapet) 0 100% / 100% 40px no-repeat, linear-gradient(#2f86d1, #7bbbe8);
  box-shadow: none;
}
.theme-adobe .chat-header::after {
  content: "";
  position: absolute;
  right: 12px;
  top: 0;
  width: 18px;
  height: 78px;
  background: var(--ristra) 0 0 / 100% 100% no-repeat;
}
.theme-adobe .chat-title { color: #fff8ec; text-shadow: 0 2px 0 rgba(0, 0, 0, 0.25); font-size: 26px; }
.theme-adobe .chat-title::before { filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.2)); }
.theme-adobe .messages {
  background:
    radial-gradient(rgba(120, 70, 30, 0.07) 1px, transparent 1.4px) 0 0 / 5px 5px,
    radial-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1.4px) 2px 3px / 7px 7px,
    var(--bg);
}
.theme-adobe .assistant .body {
  border: 0;
  box-shadow: inset 0 3px 0 rgba(255, 255, 255, 0.55), inset 0 -4px 0 rgba(120, 70, 30, 0.12), 0 8px 0 -2px #d0a77c, 0 14px 18px -12px rgba(80, 40, 10, 0.45);
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
.theme-adobe .user .body { box-shadow: 0 6px 0 -1px #157670; }
.theme-adobe .composer { background: #c9784a; box-shadow: inset 0 4px 0 #a75d33; }
.theme-adobe .composer textarea { background: var(--surface); border-color: #a75d33; }
.theme-adobe .send { background: var(--turquoise); color: #fff; border-radius: 999px; }


/* ============================================================
   CHOMP — 1980 arcade maze: double walls, white pellets, four ghosts
   ============================================================ */

@property --chomp {
  syntax: "<angle>";
  inherits: false;
  initial-value: 32deg;
}
.theme-chomp {
  --bg: #000000;
  --surface: #000000;
  --ink: #f4f4f4;
  --muted: #8c8cff;
  --line: #2121de;
  --accent: #ffe600;
  --on-accent: #000000;
  --wall: #2121de;
  --pellet: #f7f7f7;
  --ghost: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'%3E%3Cpath d='M0 14V7a7 7 0 0 1 14 0v7l-2.33-2-2.34 2-2.33-2-2.33 2-2.34-2z' fill='%23ff0000'/%3E%3Ccircle cx='4.5' cy='6' r='2' fill='white'/%3E%3Ccircle cx='9.5' cy='6' r='2' fill='white'/%3E%3Ccircle cx='5.2' cy='6.5' r='1' fill='%232121de'/%3E%3Ccircle cx='10.2' cy='6.5' r='1' fill='%232121de'/%3E%3C/svg%3E");
  --ghost-ink: #ff4040;
  --user-bg: transparent;
  --bot-bg: transparent;
  --code-bg: #000000;
  --font-body: "Space Mono", ui-monospace, monospace;
  --font-display: "Press Start 2P", ui-monospace, monospace;
  --font-meta: "Press Start 2P", ui-monospace, monospace;
  --text: 13.5px;
  --leading: 1.65;
  --bubble-pad: 14px 17px;
  --bubble-radius: 10px;
  --gap: 20px;
  --measure: 88%;
  --radius: 8px;
}
.theme-chomp .chat-header { flex-wrap: wrap; row-gap: 10px; border-bottom: 0; padding-bottom: 18px; box-shadow: inset 0 -2px 0 var(--wall), inset 0 -6px 0 #000, inset 0 -8px 0 var(--wall); }
.theme-chomp .chat-header::after {
  content: "1UP  2340      HIGH SCORE  10000";
  order: 3;
  flex-basis: 100%;
  white-space: pre;
  font: 8px var(--font-meta);
  color: #fff;
  line-height: 16px;
  min-height: 16px;
  padding-right: 20px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14' shape-rendering='crispEdges'%3E%3Crect x='1' y='8' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='1' y='9' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='1' y='10' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='1' y='11' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='2' y='7' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='2' y='8' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='2' y='9' width='1' height='1' fill='%23ffffff'/%3E%3Crect x='2' y='10' width='1' height='1' fill='%23ffffff'/%3E%3Crect x='2' y='11' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='2' y='12' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='3' y='7' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='3' y='8' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='3' y='9' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='3' y='10' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='3' y='11' width='1' height='1' fill='%23ffffff'/%3E%3Crect x='3' y='12' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='4' y='6' width='1' height='1' fill='%23de9751'/%3E%3Crect x='4' y='7' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='4' y='8' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='4' y='9' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='4' y='10' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='4' y='11' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='4' y='12' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='5' y='5' width='1' height='1' fill='%23de9751'/%3E%3Crect x='5' y='7' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='5' y='8' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='5' y='9' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='5' y='10' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='5' y='11' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='5' y='12' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='6' y='5' width='1' height='1' fill='%23de9751'/%3E%3Crect x='6' y='8' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='6' y='9' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='6' y='10' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='6' y='11' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='7' y='4' width='1' height='1' fill='%23de9751'/%3E%3Crect x='7' y='9' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='7' y='10' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='7' y='11' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='7' y='12' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='8' y='3' width='1' height='1' fill='%23de9751'/%3E%3Crect x='8' y='8' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='8' y='9' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='8' y='10' width='1' height='1' fill='%23ffffff'/%3E%3Crect x='8' y='11' width='1' height='1' fill='%23ffffff'/%3E%3Crect x='8' y='12' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='8' y='13' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='9' y='2' width='1' height='1' fill='%23de9751'/%3E%3Crect x='9' y='8' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='9' y='9' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='9' y='10' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='9' y='11' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='9' y='12' width='1' height='1' fill='%23ffffff'/%3E%3Crect x='9' y='13' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='10' y='2' width='1' height='1' fill='%23de9751'/%3E%3Crect x='10' y='5' width='1' height='1' fill='%23de9751'/%3E%3Crect x='10' y='6' width='1' height='1' fill='%23de9751'/%3E%3Crect x='10' y='7' width='1' height='1' fill='%23de9751'/%3E%3Crect x='10' y='8' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='10' y='9' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='10' y='10' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='10' y='11' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='10' y='12' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='10' y='13' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='11' y='1' width='1' height='1' fill='%23de9751'/%3E%3Crect x='11' y='2' width='1' height='1' fill='%23de9751'/%3E%3Crect x='11' y='3' width='1' height='1' fill='%23de9751'/%3E%3Crect x='11' y='4' width='1' height='1' fill='%23de9751'/%3E%3Crect x='11' y='8' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='11' y='9' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='11' y='10' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='11' y='11' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='11' y='12' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='11' y='13' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='12' y='1' width='1' height='1' fill='%23de9751'/%3E%3Crect x='12' y='9' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='12' y='10' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='12' y='11' width='1' height='1' fill='%23ff0000'/%3E%3Crect x='12' y='12' width='1' height='1' fill='%23ff0000'/%3E%3C/svg%3E") right center / 16px 16px no-repeat;
}
.theme-chomp .chat-title { display: flex; align-items: center; gap: 12px; font-size: 15px; font-weight: 400; color: var(--accent); }
.theme-chomp .chat-title::before {
  content: "";
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: conic-gradient(var(--accent) 0 calc(90deg - var(--chomp)), transparent 0 calc(90deg + var(--chomp)), var(--accent) 0);
  animation: chomp 0.3s ease-in-out infinite alternate;
}
.theme-chomp .chat-title::after {
  content: "";
  width: 48px;
  height: 10px;
  background:
    radial-gradient(circle, var(--pellet) 0 4.5px, transparent 5px) 100% 50% / 10px 10px no-repeat,
    radial-gradient(circle, var(--pellet) 0 1.6px, transparent 2px) 0 50% / 10px 10px repeat-x;
  -webkit-mask: linear-gradient(90deg, #000 calc(100% - 13px), transparent calc(100% - 13px) calc(100% - 10px), #000 calc(100% - 10px));
  mask: linear-gradient(90deg, #000 calc(100% - 13px), transparent calc(100% - 13px) calc(100% - 10px), #000 calc(100% - 10px));
}
@keyframes chomp { from { --chomp: 2deg; } to { --chomp: 40deg; } }
@keyframes chomp-blink { 50% { opacity: 0.15; } }
.theme-chomp .model { color: #fff; background: #000; border: 2px solid var(--wall); border-radius: 8px; font: 7.5px var(--font-meta); padding: 7px 10px; }
.theme-chomp .messages::before {
  content: "READY!";
  align-self: center;
  margin-bottom: 4px;
  font: 13px var(--font-meta);
  color: var(--accent);
}
.theme-chomp .who { display: flex; align-items: center; gap: 8px; font: 8px var(--font-meta); letter-spacing: 0.04em; text-transform: uppercase; color: var(--accent); }
.theme-chomp .user .who { justify-content: flex-end; }
.theme-chomp .user .who::after {
  content: "";
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: conic-gradient(var(--accent) 0 60deg, transparent 0 120deg, var(--accent) 0);
}
.theme-chomp .assistant .who { color: var(--ghost-ink); }
.theme-chomp .assistant .who::before { content: ""; width: 14px; height: 14px; background: var(--ghost) 0 0 / 100% 100%; }
.theme-chomp .assistant:nth-child(8n + 4) { --ghost: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'%3E%3Cpath d='M0 14V7a7 7 0 0 1 14 0v7l-2.33-2-2.34 2-2.33-2-2.33 2-2.34-2z' fill='%23ffb8ff'/%3E%3Ccircle cx='4.5' cy='6' r='2' fill='white'/%3E%3Ccircle cx='9.5' cy='6' r='2' fill='white'/%3E%3Ccircle cx='5.2' cy='6.5' r='1' fill='%232121de'/%3E%3Ccircle cx='10.2' cy='6.5' r='1' fill='%232121de'/%3E%3C/svg%3E"); --ghost-ink: #ffb8ff; }
.theme-chomp .assistant:nth-child(8n + 6) { --ghost: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'%3E%3Cpath d='M0 14V7a7 7 0 0 1 14 0v7l-2.33-2-2.34 2-2.33-2-2.33 2-2.34-2z' fill='%2300ffff'/%3E%3Ccircle cx='4.5' cy='6' r='2' fill='white'/%3E%3Ccircle cx='9.5' cy='6' r='2' fill='white'/%3E%3Ccircle cx='5.2' cy='6.5' r='1' fill='%232121de'/%3E%3Ccircle cx='10.2' cy='6.5' r='1' fill='%232121de'/%3E%3C/svg%3E"); --ghost-ink: #00ffff; }
.theme-chomp .assistant:nth-child(8n) { --ghost: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'%3E%3Cpath d='M0 14V7a7 7 0 0 1 14 0v7l-2.33-2-2.34 2-2.33-2-2.33 2-2.34-2z' fill='%23ffb852'/%3E%3Ccircle cx='4.5' cy='6' r='2' fill='white'/%3E%3Ccircle cx='9.5' cy='6' r='2' fill='white'/%3E%3Ccircle cx='5.2' cy='6.5' r='1' fill='%232121de'/%3E%3Ccircle cx='10.2' cy='6.5' r='1' fill='%232121de'/%3E%3C/svg%3E"); --ghost-ink: #ffb852; }
.theme-chomp .user .body { border: 2px solid var(--wall); box-shadow: inset 0 0 0 5px #000, inset 0 0 0 7px var(--wall); padding: 16px 19px; }
.theme-chomp .assistant { max-width: 100%; }
.theme-chomp .assistant .body { padding: 0; }
.theme-chomp .assistant::after {
  content: "";
  display: block;
  height: 10px;
  margin-top: 18px;
  background:
    radial-gradient(circle, var(--pellet) 0 4.5px, transparent 5px) 100% 50% / 10px 10px no-repeat,
    radial-gradient(circle, var(--pellet) 0 1.6px, transparent 2px) 0 50% / 14px 10px repeat-x;
  -webkit-mask: linear-gradient(90deg, #000 calc(100% - 16px), transparent calc(100% - 16px) calc(100% - 10px), #000 calc(100% - 10px));
  mask: linear-gradient(90deg, #000 calc(100% - 16px), transparent calc(100% - 16px) calc(100% - 10px), #000 calc(100% - 10px));
}
.theme-chomp .body li::marker { color: var(--pellet); }
.theme-chomp .body code { color: var(--accent); background: none; padding: 0; }
.theme-chomp .body pre { border: 2px solid var(--wall); box-shadow: inset 0 0 0 4px #000, inset 0 0 0 6px var(--wall); padding: 16px 18px; }
.theme-chomp .body pre code { color: var(--ink); }
.theme-chomp .composer { align-items: center; border-top: 0; padding-top: 18px; box-shadow: inset 0 2px 0 var(--wall), inset 0 6px 0 #000, inset 0 8px 0 var(--wall); }
.theme-chomp .composer textarea { background: #000; border: 2px solid var(--wall); border-radius: 10px; }
.theme-chomp .send {
  width: 44px;
  height: 44px;
  padding: 0;
  font-size: 0;
  border-radius: 50%;
  background: conic-gradient(var(--accent) 0 calc(90deg - var(--chomp)), transparent 0 calc(90deg + var(--chomp)), var(--accent) 0);
  animation: chomp 0.3s ease-in-out infinite alternate;
}
```
