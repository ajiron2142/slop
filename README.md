# Minimal LiteLLM chat

A tiny static chat UI for a LiteLLM proxy (OpenAI-compatible API). Plain HTML, CSS and ES modules, with no build step and no backend. Your API key and chats stay in your browser (IndexedDB). See `PLAN.md` for the design.

## Quick local test

Nothing to install or build. You only need a browser and something that can serve files.

1. **Get the code:** `git clone https://github.com/ajiron2142/slop.git`, or on GitHub click **Code → Download ZIP** and unzip it.
2. **Start a local server in that folder:**
   ```sh
   python3 -m http.server 8000
   ```
   On Windows this may be `py -m http.server 8000`. No Python? `npx serve` or the VS Code "Live Server" extension work too.
3. **Open http://localhost:8000.** Don't double-click `index.html`: browsers won't load the app's scripts from a file opened directly.
4. **Open Settings**, enter your LiteLLM base URL and your own API key, click **Test connection**, then **Save**.
5. Pick a model from the dropdown at the top and start chatting. The dropdown lists every model your key can use.

### Check first: will your LiteLLM allow it?

Before downloading anything, open your browser's dev console on any page and run:

```js
fetch("https://YOUR-LITELLM-HOST/v1/models",{headers:{Authorization:"Bearer YOUR-KEY"}}).then(r=>r.json()).then(console.log)
```

- **Prints a model list:** the app will work.
- **CORS error:** the LiteLLM admin needs to allow requests from your page's origin (for this local test, `http://localhost:8000`). Nothing in the app can work around this.

### If your LiteLLM URL is `http://` instead of `https://`

The page only allows connections to `https://` URLs. For a local test, edit the `Content-Security-Policy` line in `index.html` and change `connect-src https:` to `connect-src https: http:`.

### Where your data goes

Your API key and chats are stored only in your browser. The page only talks to the LiteLLM URL you enter. **Delete all local data** in Settings wipes everything.

## Basic mode

The **Basic mode** button in the sidebar swaps the stylesheet from `style.css` to `basic.css`, which is styled like a first-ever website: Times New Roman, gray boxes and underlined blue links. **Fancy mode** switches back, and the choice is remembered.

## Deploy

```sh
docker build -t litellm-chat .
docker run -p 8080:8080 litellm-chat
```

The image is `nginx-unprivileged`, so it runs under OpenShift's arbitrary UIDs.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page and Content-Security-Policy |
| `style.css` | Default styling, with light and dark themes |
| `basic.css` | Beginner-website styling for Basic mode |
| `app.js` | State, event handling, chat flow |
| `api.js` | `/v1/models` and streaming `/v1/chat/completions` |
| `storage.js` | Settings, chats, export/import in IndexedDB |
| `ui.js` | DOM rendering |
| `markdown.js` | Markdown via `marked`, always sanitized with DOMPurify |
| `vendor/` | Vendored libraries (versions in `vendor/README.md`) |
