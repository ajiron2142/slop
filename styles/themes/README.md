# Themes

A theme is one self-contained CSS file in this folder. It sets the tokens from `styles/base.css` under `.theme-<name>`, plus a few overrides where a token isn't enough. The app applies the class to the sidebar, chat and settings (everything marked `.themed`), so switching is instant.

## Add a theme

1. Copy any theme file, e.g. `linen.css` to `mytheme.css`.
2. Rename every `.theme-linen` to `.theme-mytheme` and change the tokens.
3. Add one line to `index.html` next to the others:

   ```html
   <link rel="stylesheet" href="styles/themes/mytheme.css" data-theme="mytheme" data-name="My theme">
   ```

It shows up in Settings → Theme automatically.

## Remove a theme

Delete its file and its line in `index.html`.

## Rules

- Only set tokens and style things inside `.theme-<name>`. Never change layout (widths, positions of the sidebar or composer); that stays in `base.css`.
- Fonts come from `fonts/`. A theme names a font with fallbacks, e.g. `"Jost", system-ui, sans-serif`; if the font is missing it falls back quietly.
- Drawings are inlined as `url("data:image/svg+xml,…")` so each theme stays one file.

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
