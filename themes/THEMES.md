# Chat theme system

A small base stylesheet plus one file per theme. Give this file and the `themes/` folder to an AI along with your app's code, and ask it to adapt the app to this system.

**Download everything:** https://github.com/ajiron2142/slop/archive/refs/heads/ccr-60b590e9-4higd9.zip (unzip and use the `themes/` folder)

## Folder

```
themes/
  base.css        layout + default tokens (always loaded)
  <name>.css      one file per theme, everything scoped to .theme-<name>
  assets/         the few SVG drawings themes use (pumpkin, cherry, mountains…)
  fonts.css       @font-face rules for every theme font
  fonts/          self-hosted font files (no Google or other outside requests)
  preview.html    open in a browser to flip through every theme offline
```

## How it works

- `base.css` sets the layout. Every color, font and spacing value is a CSS variable (a "token").
- A theme is one class on the chat container, e.g. `theme-lantern`. Its file sets the tokens and adds a few extra rules.
- Every theme file is scoped to its own class, so loading all of them at once is safe. Switching is just changing the class: instant, no network.

## Loading (everything up front, then snappy)

Load the fonts, the base, then one `<link>` per theme. The `data-` attributes let the app build its theme picker from these lines, so adding a theme is: drop in the file, add one line.

```html
<link rel="stylesheet" href="themes/fonts.css">
<link rel="stylesheet" href="themes/base.css">
<link rel="stylesheet" href="themes/folio.css" data-theme="folio" data-name="Folio">
<link rel="stylesheet" href="themes/lantern.css" data-theme="lantern" data-name="Lantern">
<!-- …one line per theme -->
```

Theme CSS totals about 100 KB and loads once; browsers cache it after that. Fonts only download when a theme uses them, so warm them in the background after the page loads to make every later switch instant:

```js
const warm = () => document.fonts.forEach((f) => f.load().catch(() => {}));
('requestIdleCallback' in window) ? requestIdleCallback(warm) : setTimeout(warm, 1500);
```

Fonts total about 2 MB across 68 files, fetched once in the background and then cached.

## Theme picker

```js
const themes = [...document.querySelectorAll('link[data-theme]')]
  .map((l) => ({ id: l.dataset.theme, name: l.dataset.name }));

function setTheme(id) {
  const chat = document.querySelector('.chat');
  chat.className = chat.className.replace(/\btheme-\S+/g, '').trim() + ' theme-' + id;
  settings.theme = id;
  saveSettings(settings);
}
```

Fill a `<select>` from `themes` and call `setTheme` on change; apply the saved theme on start.

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
- Add `streaming` to an assistant message while it streams (`msg assistant streaming`) for the blinking caret.
- Put the theme class on `.chat`, not on `body`.
- On wide screens the conversation stays a centred column about 760px wide; backgrounds still fill the screen.
- Fonts cover Latin text only; other scripts fall back to system fonts.

## Adding or removing a theme

- **Add:** copy any theme file, rename it and its `.theme-<name>` class, change the tokens, add its `<link>` line.
- **Remove:** delete the file, its `<link>` line, and any `assets/<name>-*.svg`.

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

## Themes

| File | Name | Look |
|---|---|---|
| `folio.css` | Folio | A literary quarterly. No bubbles; your questions become pull-quotes and the first reply opens with a drop cap. |
| `sumi.css` | Sumi | Ink on rice paper. Wide margins, tall leading, and one vermilion seal marking your turn. |
| `grove.css` | Grove | A thin trunk runs down the page and every reply grows from it as a leaf. Your messages are buds. |
| `raster.css` | Raster | International Typographic Style. A strict grid, numbered turns, heavy rules and exactly one red. |
| `linen.css` | Linen | The everyday one. Warm neutrals, soft ink bubbles and a floating composer. |
| `atelier.css` | Atelier | An architect's drafting sheet: blue grid, numbered turns with dimension lines, crop marks on every message. |
| `tide.css` | Tide | Sea glass and morning fog. Frosted replies and pale green bubbles worn smooth by water. |
| `draft.css` | Draft | The conversation as a screenplay, with your lines on the red half of the ribbon. |
| `bauhaus.css` | Bauhaus | Circle, square, triangle. Primary colours used sparingly and a quarter-round corner on your messages. |
| `basalt.css` | Basalt | Neutral graphite, lit in bone white. The quietest dark theme of the set. |
| `airmail.css` | Airmail | Par avion. Striped borders, and every message you send arrives as a stamped postcard. |
| `receipt.css` | Receipt | Every answer, itemised. Torn edges, order numbers, a barcode and a PRINT button. |
| `lumen.css` | Lumen | One neon tube in a dark room. Pink for you, cyan for send, and a sign that hums. |
| `prism.css` | Prism | Clean white with iridescent edges on your messages, the composer and the title. |
| `sticky.css` | Sticky | Office sticky notes. Your messages handwritten on canary yellow, replies on blue, lime, pink and orange pads. |
| `transit.css` | Transit | The conversation is a subway line: your questions are interchanges, replies are stops, the composer is the platform sign. |
| `boarding.css` | Boarding | Boarding passes in a 1970s livery: chocolate header, orange-mustard-brick racing stripes, cream cards with torn-off stubs. |
| `riso.css` | Riso | A two-ink risograph print: blue ink everywhere, your messages on outlined cards with a pink halftone shadow, a solid blue send. |
| `lantern.css` | Lantern | A gradient-built jack-o’-lantern, candy-corn stripes, carved messages that flicker, and a cobweb in the corner. |
| `pocket.css` | Pocket | The 1989 handheld: pea-green screen in a slate bezel, dialogue boxes with a blinking arrow, a D-pad and a magenta A button. |
| `tombstone.css` | Tombstone | Moon, stars and drifting fog; your messages are a softly glowing ghost and replies are whispered. |
| `groove.css` | Groove | A 1970s record sleeve in sunset colours: chocolate, gold, orange and red stripes, and a record spinning out of the header. |
| `taskbar.css` | Taskbar | The early-2000s desktop: blue title bars, balloon tips, a green hill, and a taskbar with a start button and a clock. |
| `springfield.css` | Springfield | Opening-credits sky and clouds, cartoon outlines, yellow for you, a yellow composer bar and a sprinkled donut. |
| `sandia.css` | Sandia | New Mexico at dusk: the watermelon-pink Sandia ridge stays put while balloons drift past as you scroll. |
| `adobe.css` | Adobe | High noon: a stepped adobe parapet against a bright sky, a chile ristra, stucco walls and a turquoise oval send button. |
| `chomp.css` | Chomp | The 1980 arcade maze: double blue walls, white pellets, four ghosts, a score line with a pixel cherry, and a chomping send button. |
