# Minimal Browser Chat UI for LiteLLM — Build Plan

## Goal
A tiny, fast, pure-frontend chat web app. No backend logic, no build step, no framework. It talks to an existing **LiteLLM proxy** (OpenAI-compatible API) that fronts AWS Bedrock Claude and Azure OpenAI models. Simplicity, small size and speed matter more than features.

## Hard constraints
- Plain HTML, CSS and JavaScript using **ES modules** (`<script type="module">`). No React, no bundler, no npm build, no TypeScript.
- All third-party libraries are **vendored** (downloaded into `vendor/`, committed, version noted in `vendor/README.md`). **No CDN links.**
- All user data (API key, settings, chats) lives **in the user's browser**. Nothing is sent anywhere except to the configured LiteLLM base URL.
- Each user supplies their own LiteLLM API key. The app never ships or embeds a shared key.
- Keep the whole app well under ~100KB excluding vendored libs. Prefer fewer lines of code.
- Must be servable by any static host (target: `nginx-unprivileged` container on OpenShift), and work with `python -m http.server` for development. Note that ES modules do not work from `file://`.

## Stack
| Concern | Choice |
|---|---|
| UI | Vanilla JS, one `index.html`, ES modules |
| Markdown | `marked` (vendored) |
| Sanitizing | `DOMPurify` (vendored) |
| Storage | IndexedDB via `idb-keyval` (vendored). Use it for **everything**, including settings |
| API | `fetch` to LiteLLM `/v1/chat/completions` with `stream: true` (SSE), `/v1/models` for the model list |
| Hosting | Static files only |

Later, only if the UI code becomes painful to maintain: migrate to **Preact 10.x + htm 3.1.1** (vendored, still no build step). Do not use Preact 11 until it is final. Structure the code so that this port is easy (see Architecture).

## File layout
```
index.html       the single page; CSP <meta>; loads app.js as a module
style.css
app.js           entry point; wires modules together; owns the state object + render()
api.js           LiteLLM calls: listModels(), streamChat() (SSE parsing, abort support)
storage.js       idb-keyval wrapper: settings, chats
ui.js            DOM rendering for chat list, messages, settings panel
markdown.js      renderMarkdown(text) => DOMPurify.sanitize(marked.parse(text))
vendor/          marked, purify, idb-keyval + README.md (name, version, source URL)
```
Keep to roughly 4–6 source files. Do not split into tiny files for their own sake.

## Architecture
- A single `state` object in `app.js` (settings, models, chats list, active chat id, streaming status).
- A `render()` function redraws the UI from `state`. Event handlers update `state` and call `render()`. Keeping state and rendering separate makes a later Preact port a straightforward move.
- During streaming, update only the in-progress message node. Throttle re-rendering of markdown with `requestAnimationFrame` to avoid sluggishness on long replies.

## Storage schema (IndexedDB via idb-keyval)
- `settings` → `{ baseUrl, apiKey, model, systemPrompt }`
- `chatmeta:<id>` → `{ id, title, created, updated }`
- `chat:<id>` → `{ id, messages: [{ role, content, ts }] }`
- Keep metadata separate from message bodies so the chat list (and a later search index) never has to load full conversations.
- Generate ids with `crypto.randomUUID()`.
- Call `navigator.storage.persist()` on startup.

## Security requirements (not optional)
1. **Every** piece of rendered model output goes through `DOMPurify.sanitize()`. Model output is untrusted. An XSS bug could steal the locally stored API key.
2. CSP via `<meta http-equiv="Content-Security-Policy">`, for example: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src <configured LiteLLM origin>;`. Because `connect-src` depends on the user's configured base URL, decide between a permissive `https:` and a documented requirement to edit the meta tag.
3. No inline scripts, no inline event handlers, no third-party scripts.
4. The API key is stored in IndexedDB only, sent only as `Authorization: Bearer <key>` to the configured base URL, and has a "Forget key" button. Never log it.
5. Do not include the API key in exports.

## MVP features (build in this order)
1. **Settings panel:** base URL, API key, system prompt, with save and forget-key buttons.
2. **Model picker:** populated from `GET /v1/models`.
3. **Streaming chat:** send the message history to `/v1/chat/completions` with `stream: true` and render tokens as they arrive.
4. **Stop button:** abort the stream via `AbortController`.
5. **New chat** and **chat list** (select, delete, rename-by-first-message title).
6. **Markdown rendering** with code blocks and a copy button, sanitized.
7. **Export / import** as a single `.json` file (below).
8. **Connection test** in settings that reports whether a failure is CORS, auth (401/403) or network. This matters a lot (see risks).

## Export / import format
Single JSON file, `{ "version": 1, "exportedAt": ISO8601, "chats": [{ "meta": {...}, "messages": [...] }] }`. Exclude the API key. Import validates `version` and **merges** (skip existing ids by default). Export triggers a download via `Blob` plus a temporary `<a download>`. Import also accepts drag-and-drop of the file.

## Key risk to verify first: CORS
Browsers block requests to LiteLLM unless it allows the app's origin, and we are **not** the LiteLLM admin. Before building features, run this from the browser dev console on a page served at the intended origin:
`fetch("https://<litellm-host>/v1/models",{headers:{Authorization:"Bearer sk-..."}}).then(r=>r.json()).then(console.log)`
- Works → proceed as a pure static app.
- Fails with a CORS error → either ask the admin to allow the origin, or add a small nginx location that serves the static files and proxies `/v1/*` to LiteLLM (same origin, so no CORS, and the key is passed through, not stored).

## Deployment
A minimal container: `nginxinc/nginx-unprivileged` serving the static files (OpenShift runs containers with arbitrary UIDs). Optional later: the `/v1/*` proxy described above.

## Explicitly out of scope for the MVP
Service worker / offline PWA, local models (Ollama, LM Studio), keyword and semantic search, passphrase-encrypted key storage, sharing, party mode, P2P, Preact. Design so none of these are blocked, but do not build them now.

## Later roadmap (in order, only when asked)
1. Keyword search (MiniSearch, vendored) over `chatmeta` and `chat` records.
2. Semantic search: embeddings via LiteLLM `/v1/embeddings`, vectors stored in idb-keyval as `emb:<chatId>` with the embedding **model name stored alongside** (re-embed if the model changes). Brute-force cosine similarity is fine.
3. Service worker for offline use (PWA).
4. Local model support by making the base URL and key configurable per profile (Ollama and LM Studio need CORS enabled on their side).
5. Passphrase-encrypted API key storage (WebCrypto PBKDF2 → AES-GCM).
6. Share chat as a compressed URL-fragment link (`#share=...`) or `.json` file.
7. Optional "party mode" (multi-user shared chat). Options are a small in-memory WebSocket relay with no persistence, where the host's browser calls the LLM and the relay fans out messages, or WebRTC P2P (Trystero/PeerJS), which may be blocked on corporate networks.
8. Only if the UI code becomes hard to maintain: port to Preact 10.x + htm (vendored).

## Definition of done for the MVP
A user can open the page, enter a base URL and their own key, pick a model, hold a streaming conversation with markdown rendering, stop generation, start new chats, see and reopen past chats after a browser restart, and export and import their history. All output is sanitized, the CSP is in place, and no network request goes anywhere except the configured LiteLLM host and the app's own static files.
