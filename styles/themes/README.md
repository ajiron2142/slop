# Themes

A theme is one self-contained CSS file in this folder. It sets the tokens from `styles/base.css` under `.theme-<name>`, plus a few overrides where a token isn't enough. The app applies the class to the sidebar, chat and settings (everything marked `.themed`), so switching is instant.

## Add a theme

1. Copy any theme file, e.g. `linen.css` to `mytheme.css`.
2. Rename every `.theme-linen` to `.theme-mytheme` and change the tokens.
3. Add one line to `index.html` next to the others:

   ```html
   <link rel="stylesheet" href="styles/themes/mytheme.css" media="not all" data-theme="mytheme" data-name="My theme">
   ```

   `media="not all"` keeps it from slowing the first paint; the app switches it on when it's chosen.

It shows up in Settings → Theme automatically.

### The smallest theme

A theme only has to set what it changes; everything else comes from the Default theme. This is a complete theme:

```css
.theme-mytheme {
  --bg: #fdf6e3;
  --ink: #3b3a36;
  --accent: #b58900;
  --radius: 0; /* square corners everywhere */
}
```

A dark theme should also set `--surface`, `--muted`, `--line`, `--code-bg` and the code colours, since Default's are light.

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
| `--add`, `--del` | Green and red for what worked and what failed: errors, failed steps, added and removed lines |
| `--code-keyword`, `--code-string`, `--code-number`, `--code-title`, `--code-attr`, `--code-comment` | Syntax colours in code blocks. Defaults to GitHub's light palette; each theme sets its own in one line at the end of its file, and a dark theme must. Optional: `--code-addition` / `--code-deletion` for diffs (default to the string and keyword colours) |
| `--font-body`, `--font-display`, `--font-meta`, `--font-code` | Fonts for text, titles, labels, code |
| `--text`, `--leading` | Text size and line height |
| `--bubble-pad`, `--bubble-radius` | Bubble padding and corners |
| `--gap`, `--edge` | Space between messages and side margins |
| `--pad-top` | Space above the first message (code headers stick at the very top because of it) |
| `--measure` | Max bubble width |
| `--user-align` | Where your bubbles sit (`flex-end`, `stretch`, `center`) |
| `--radius` | Corners everywhere: 0 is square, larger is rounder |
| `--radius-sm`, `--radius-md`, `--radius-lg` | Optional. Worked out from `--radius` (at most 6, 10 and 14px) for buttons and rows, blocks and cards, dialogs and popovers; set one to change only that size |

## Themes

| File | Name | Look |
|---|---|---|
| `monokai.css` | Monokai | One Monokai's dark palette and code colours, with steel-blue buttons and heading bars, shaded quotes and plain blue links. |
| `linen.css` | Linen | The everyday one. Warm neutrals, soft ink bubbles and a floating composer. |
| `bauhaus.css` | Bauhaus | Circle, square, triangle. Primary colours used sparingly and a quarter-round corner on your messages. |

More themes (Springfield, Sandia, Basalt and 21 others) are parked on the `themes-archive` branch while the core features settle. To bring one back, copy its file (and any fonts it uses) from that branch and add its `<link>` line.
