# Chat

A small, fast chat app for a LiteLLM proxy (OpenAI-compatible API). Plain HTML, CSS and JavaScript modules: no build step, no framework, no backend. Your API key and chats stay in your browser.

## Run it locally

Any static file server works. From this folder:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000 (not the file directly; browsers won't load the scripts that way), then enter your LiteLLM URL and API key in Settings.

Your LiteLLM must allow requests from the page's origin (CORS). The page only connects to `https://` URLs; for an `http://` LiteLLM, change `connect-src https:` to `connect-src https: http:` in `index.html`.

## Deploy

```sh
docker build -t chat .
docker run -p 8080:8080 chat
```

The image is `nginx-unprivileged`, so it runs under OpenShift's arbitrary UIDs. `nginx.conf` turns on gzip, has the browser re-check app files on each load (so a new release is never mixed with old cached files), caches fonts for a month, and stops other sites from embedding the page.

## How it's organised

```
index.html            the page; loads every stylesheet and app/main.js
nginx.conf            web server settings for the Docker image
app/                  behaviour
  boot.js             applies the saved theme before the first paint (plain script, not a module)
  main.js             state and wiring: sending, streaming, chats, models
  api.js              LiteLLM calls (/v1/models, streaming /v1/chat/completions)
  storage.js          settings and chats in IndexedDB, search, export/import
  folder.js           read-only folder tools for the model (list_files, search_files, read_file)
  stats.js            usage maths for the meter and Stats card (tokens, context, cost, speed)
  markdown.js         markdown to sanitised HTML
  highlight.js        syntax colours for code blocks; loads highlight.js on first use (lists the languages)
  theme.js            theme list, switching, font warm-up
  dom.js              two tiny DOM helpers
  components/         one file per piece of UI
    sidebar.js        chat list, search, mobile menu
    messages.js       message rendering, code copy, retry, per-reply Stats card
    meter.js          usage meter above the message box (context and cost)
    composer.js       text box, send/stop, attachments (button, paste, drop), folder chip
    picker.js         searchable dropdown (used for models and themes)
    settings.js       settings dialog
styles/
  base.css            tokens, chat structure, app shell
  components/         one file per component, same names as app/components
  themes/             one self-contained file per theme (see its README)
fonts/                self-hosted fonts; fonts.css declares them
vendor/               marked, DOMPurify, idb-keyval, highlight.js (never edited)
tests/                browser tests; not part of the deployed app (see tests/README.md)
```

**Rules that keep it small:** each UI piece is a `.js` + `.css` pair with the same name; components use tokens, never fixed colours; themes only set tokens and overrides, never layout; adding anything means adding a file and one line.

## How it works

1. `index.html` lays out the page and loads the CSS and `app/main.js`.
2. `main.js` loads your settings and chats from the browser (`storage.js`), applies your theme, and fetches the model list (`api.js`).
3. When you send, the **composer** hands the text and attachments to `main.js`, which saves the message and streams the reply from LiteLLM.
4. As the reply streams in, **messages** renders it (markdown via `markdown.js`, always sanitised), and the chat is saved again when it finishes.
5. The **sidebar** lists saved chats; **settings** edits the connection, system prompt and theme.

**Current time.** Models don't know the date, so the newest message carries one line with the date, time and time zone from your computer, e.g. "Thursday, October 8, 2026 at 2:32 PM MDT (America/Denver, UTC-06:00)". It helps with logs, certificate expiry and anything else time-related. It goes on the newest message rather than the system prompt so the rest of the request stays the same and providers can keep caching it, and it isn't saved or shown in the chat.

**Connected folders.** In Chrome and Edge the paperclip also offers **Connect folder (read-only)**. The folder belongs to that one chat and is remembered with it. While a folder is connected, each request also sends three tools: `list_files` (optionally filtered, e.g. `*.yaml`), `search_files` (grep-style, returns matching lines with line numbers) and `read_file` (a whole short file, or a range of lines). The model is told to search first and read only the lines around a match, which keeps token use low on big folders. When the model calls one, the browser reads from the folder (`folder.js`), sends the result back, and asks again, up to 10 rounds. The reply shows a line such as "Read src/app.js". With no folder connected, requests are exactly as before, so models without tool support are unaffected. Firefox and Safari don't have this browser feature; there the paperclip just attaches files.

**Usage meter.** Each request asks LiteLLM to include token usage at the end of the stream (`stream_options.include_usage`), and each reply saves its own counts, timing and cost. On startup the app also reads `/model/info` for each model's context limit and prices. The meter above the message box shows how full the current model's context is and what the chat has cost; models without a price there (like locally hosted ones) count as free. If the proxy doesn't allow `/model/info`, the meter shows token counts without limits or costs. If your key has a budget, `/key/info` adds it to the meter: spend against the budget and when it resets. **Show detailed stats** in Settings adds a per-model table to the meter and a Stats card under each reply.

**Kept fast on purpose.** Theme stylesheets download in the background and only the chosen one is switched on, so themes don't slow the first paint. `boot.js` applies the saved theme before anything shows, so there's no flash of the default. Code colouring loads on first use, already-rendered messages are reused instead of rebuilt, a streaming reply only repaints what's needed, and chat search keeps a small in-memory index instead of reloading every chat.

Each component only touches its own part of the page and reports back to `main.js` through callbacks like `onSend` or `onOpen`.

## Testing

`tests/` has about 90 browser checks that run against a fake LiteLLM in roughly 30 seconds. With only Docker:

```sh
docker run --rm -v "$PWD":/app -w /app mcr.microsoft.com/playwright:v1.56.1-noble sh -c "npm ci && npm test"
```

Or with Node.js: `npm ci`, `npx playwright install chromium`, then `npm test`. Playwright is the only dependency and is used for testing only; the app itself still has none. See `tests/README.md`.

## Customising

- **Theme:** add a file in `styles/themes/` and one `<link>` line in `index.html`. See `styles/themes/README.md`.
- **Component:** add `app/components/x.js` and `styles/components/x.css`, create it in `main.js`, and link the CSS in `index.html`. Use tokens (`var(--ink)`, `var(--line)`, …) for colours so every theme applies.
- **Look of everything at once:** change the default tokens at the top of `styles/base.css`.

## Security

- A strict Content-Security-Policy in `index.html`: only this site's own scripts, styles, fonts and images, and connections only to `https://` URLs.
- Model replies are rendered as markdown and always sanitised with DOMPurify; links open in a new tab without access to this page. Remote images in replies are blocked.
- Everything else (titles, your messages, file names) is inserted as plain text, never as HTML.
- Your API key and chats live only in this browser's IndexedDB and are sent nowhere except your LiteLLM URL. Settings has **Forget key** and **Delete all local data**.
- Attachments are read in the browser: images up to 10 MB, text files up to 512 KB. Imported chat files are validated before saving.
- A connected folder is read-only: the browser grants read access only, and nothing in the app can write. The model can only reach files inside the folder you picked, and the browser asks for permission again after a reload. Files the model reads are sent to your LiteLLM URL like any message. `.git`, `node_modules` and similar folders are skipped. Searches also skip lockfiles, minified files and binaries, and stop at 100 matching lines. Long files come back 1,000 lines at a time, and files over 4 MB aren't read. Disconnect with the × on the folder chip.

## Features

- Model picker with search and recent models
- Attach images (sent to vision models) and text files (inlined) with the button, paste or drag-and-drop
- Connect a folder to a chat, read-only, so the model can look through it (Chrome and Edge, models with tool support)
- Markdown replies with syntax-coloured, copyable code blocks, tables and nested lists
- Chat history with search, export/import, and Stop / Retry
- Themes, switchable in Settings, each with its own code colours
- Usage meter (context used and cost per chat), with optional detailed stats per reply and per model
