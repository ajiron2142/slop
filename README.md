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

The image is `nginx-unprivileged`, so it runs under OpenShift's arbitrary UIDs.

## How it's organised

```
index.html            the page; loads every stylesheet and app/main.js
app/                  behaviour
  main.js             state and wiring: sending, streaming, chats, models
  api.js              LiteLLM calls (/v1/models, streaming /v1/chat/completions)
  storage.js          settings and chats in IndexedDB, search, export/import
  markdown.js         markdown to sanitised HTML
  theme.js            theme list, switching, font warm-up
  dom.js              two tiny DOM helpers
  components/         one file per piece of UI
    sidebar.js        chat list, search, mobile menu
    messages.js       message rendering, code copy, retry
    composer.js       text box, send/stop, attachments (button, paste, drop)
    picker.js         searchable dropdown (used for models and themes)
    settings.js       settings dialog
styles/
  base.css            tokens, chat structure, app shell
  components/         one file per component, same names as app/components
  themes/             one self-contained file per theme (see its README)
fonts/                self-hosted fonts; fonts.css declares them
vendor/               marked, DOMPurify, idb-keyval (never edited)
```

**Rules that keep it small:** each UI piece is a `.js` + `.css` pair with the same name; components use tokens, never fixed colours; themes only set tokens and overrides, never layout; adding anything means adding a file and one line.

## How it works

1. `index.html` lays out the page and loads the CSS and `app/main.js`.
2. `main.js` loads your settings and chats from the browser (`storage.js`), applies your theme, and fetches the model list (`api.js`).
3. When you send, the **composer** hands the text and attachments to `main.js`, which saves the message and streams the reply from LiteLLM.
4. As the reply streams in, **messages** renders it (markdown via `markdown.js`, always sanitised), and the chat is saved again when it finishes.
5. The **sidebar** lists saved chats; **settings** edits the connection, system prompt and theme.

Each component only touches its own part of the page and reports back to `main.js` through callbacks like `onSend` or `onOpen`.

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

## Features

- Model picker with search and recent models
- Attach images (sent to vision models) and text files (inlined) with the button, paste or drag-and-drop
- Markdown replies with copyable code blocks, tables and nested lists
- Chat history with search, export/import, and Stop / Retry
- Themes, switchable in Settings
