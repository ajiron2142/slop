# Minimal LiteLLM chat

A tiny static chat UI for a LiteLLM proxy (OpenAI-compatible API). Plain HTML, CSS and ES modules, with no build step and no backend. Your API key and chats stay in your browser (IndexedDB). See `PLAN.md` for the design.

## Run locally

```sh
python3 -m http.server 8000
```

Open http://localhost:8000, then enter your LiteLLM base URL and your own API key in Settings. Use **Test connection** first: if it reports a CORS error, the LiteLLM host has to allow this page's origin (see "Key risk to verify first: CORS" in `PLAN.md`).

ES modules don't load from `file://`, so open the page through a server.

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
| `app.js` | State, event handling, chat flow |
| `api.js` | `/v1/models` and streaming `/v1/chat/completions` |
| `storage.js` | Settings, chats, export/import in IndexedDB |
| `ui.js` | DOM rendering |
| `markdown.js` | Markdown via `marked`, always sanitized with DOMPurify |
| `vendor/` | Vendored libraries (versions in `vendor/README.md`) |
