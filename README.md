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

## Sign-in (optional)

Instead of pasting an API key, people can sign in with your organisation's identity provider (Microsoft Entra ID, GitLab, Keycloak or any other OpenID Connect provider). It runs entirely in the browser (authorization code with PKCE, no backend and no secret), and it only turns on when the web root has a `config.json`. Without one, the app is exactly as described above. The repo never contains your provider's details: `config.json` is in `.gitignore` and isn't copied into the image.

```json
{
  "baseUrl": "https://llm.example.com",
  "oidc": {
    "label": "Sign in",
    "issuer": "https://idp.example.com",
    "clientId": "CLIENT_ID",
    "scope": "openid profile offline_access API_SCOPE",
    "token": "access"
  }
}
```

- `baseUrl` fills in the LiteLLM base URL for new users; they can still change it.
- `issuer` is the provider's address; the app reads `{issuer}/.well-known/openid-configuration` to find the rest.
- `token` is the token sent to LiteLLM: `"access"` (the default) or `"id"`, whichever your LiteLLM accepts.
- `label` is the button's text.

**Register the app with your provider** as a single-page application (a *public* client: no secret), with the redirect URI set to the exact address people open, including the trailing slash (e.g. `https://chat.example.com/`).

- **Entra ID:** App registrations, then Authentication, then add a *Single-page application* platform with that redirect URI. The issuer is `https://login.microsoftonline.com/<tenant-id>/v2.0`. Put the API's scope (e.g. `api://<api-app-id>/access`) in `scope`. Its refresh tokens for single-page apps last about a day, so expect to click Sign in daily (usually without a password).
- **GitLab:** User Settings (or Admin), then Applications; untick *Confidential*, tick `openid` and `profile`. The issuer is your GitLab address.
- **Keycloak:** a client with *Client authentication* off and *Standard flow* on, the redirect URI under *Valid redirect URIs*, and the app's address under *Web origins*. The issuer is `https://<keycloak>/realms/<realm>`.

**LiteLLM has to accept the token.** By default it expects its own `sk-` keys; it needs its JWT authentication set up for your provider, or a gateway in front of it that checks the token. Check before rolling out: `curl -H "Authorization: Bearer <token>" https://<litellm>/v1/models` should list models.

**Provide `config.json`** (copy `config.example.json` and fill it in):

```sh
# Locally
docker run -p 8080:8080 -v "$PWD/config.json:/usr/share/nginx/html/config.json:ro" chat

# Kubernetes / OpenShift: a ConfigMap mounted as that one file
oc create configmap chat-config --from-file=config.json
#   in the Deployment:
#   volumes:      [{ name: config, configMap: { name: chat-config } }]
#   volumeMounts: [{ name: config, mountPath: /usr/share/nginx/html/config.json, subPath: config.json }]
```

How it behaves: the sign-in lasts while the tab is open (it's kept in that tab's session storage, not saved with your chats); the token is refreshed a minute before it expires; a 401 gets one fresh token and one retry, then asks you to sign in again; Sign out (in Settings) forgets it. The "Signed in as" name is read from the ID token for display only. The page's security policy already allows any `https://` address, so nothing else needs configuring.

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
  patch.js            git patches in replies: review per file, Copy for terminal (removable add-on)
  folder-git.js       git, read-only: git_log / git_diff and the branch on the folder chip; reads .git itself (removable add-on)
  diff.js             line diffs, for git
  paste.js            smart paste: long pastes stay in the tab and the model searches them (removable add-on)
  lines.js            line search and numbered ranges, shared by the folder tools and smart paste
  ignore.js           which files to leave out, read from the folder's .gitignore files (folder tools and git)
  copy.js             Copy reply: formatted HTML for Teams/Outlook plus markdown, in one click
  oidc.js             sign-in with an identity provider, when config.json sets it up (removable add-on)
  gitlab.js           GitLab, read-only: self-service connect in Settings, a project per chat, four tools (removable add-on)
  autotitle.js        names a chat after its first reply with one short request (removable add-on)
  activity.js         what a reply is doing and did, foldable under it (removable add-on)
  flow.js             the reply's tree beside its steps: where it went, one ring per call, what failed (removable, builds on activity)
  viewer.js           image viewer: click an image to see it large (removable add-on)
  mini.js             mini window: pops the chat into a floating always-on-top window (Chrome/Edge, removable add-on)
  sandbox.js          runs the model's JavaScript in the sandbox below; its pictures and Copy reply text (removable add-on)
  stats.js            usage maths for the meter and Stats card (tokens, context, cost, speed)
  markdown.js         markdown to sanitised HTML
  highlight.js        syntax colours for code blocks; loads highlight.js on first use (lists the languages)
  theme.js            theme list, switching, font warm-up
  dom.js              tiny DOM helpers ($, el, click-outside-to-close)
  components/         one file per piece of UI
    sidebar.js        chat list, search, rename, mobile menu
    messages.js       message rendering, code copy, retry, per-reply Stats card
    meter.js          usage meter in the header, next to the model (context and cost)
    composer.js       text box, send/stop, attachments (button, paste, drop), folder chip
    panel.js          side panel on the right; any feature can open it with its own content (nothing does yet)
    picker.js         searchable dropdown (used for models and themes)
    settings.js       settings dialog
styles/
  base.css            tokens, the chat column's layout, app shell, shared buttons
  components/         one file per component, same names as app/components (plus one per add-on: folder-git.css, gitlab.css, patch.css, …)
  themes/             one self-contained file per theme (see its README)
sandbox/              sandbox.html + runner.js + helpers.js: a hidden, sandboxed iframe with no network, page or storage (see docs/plans/sandbox.md)
fonts/                self-hosted fonts; fonts.css declares them
vendor/               marked, DOMPurify, idb-keyval, highlight.js (never edited)
tests/                browser tests; not part of the deployed app (see tests/README.md)
```

**Rules that keep it small:** each UI piece is a `.js` + `.css` pair with the same name; components use tokens, never fixed colours; themes only set tokens and overrides, never layout; adding anything means adding a file and one line. Features that come and go (like patches or GitLab) live in their own files and plug in through small hooks, so removing one never touches the rest. Nothing UI-related is remembered unless it has to be: pastes and a reply's activity exist only in this tab.

## How it works

1. `index.html` lays out the page and loads the CSS and `app/main.js`.
2. `main.js` loads your settings and chats from the browser (`storage.js`), applies your theme, and fetches the model list (`api.js`).
3. When you send, the **composer** hands the text and attachments to `main.js`, which saves the message and streams the reply from LiteLLM.
4. As the reply streams in, **messages** renders it (markdown via `markdown.js`, always sanitised), and the chat is saved again when it finishes.
5. The **sidebar** lists saved chats (double-click one to rename it); **settings** edits the connection, system prompt and theme.

**Today's date.** Models don't know the date, so the system prompt starts with one line from your computer: "Today is Thursday, October 8, 2026. The user's time zone is America/Denver (UTC-06:00)." There's no time of day, so the line changes only once a day and providers can keep caching the request; if the exact time matters (say, for fresh logs), mention it in your message. Your messages are sent exactly as you typed them.

**Connected folders.** In Chrome and Edge the **+** menu also offers **Connect folder (read-only)**. The folder belongs to that one chat and is remembered with it. While a folder is connected, each request also sends three tools: `list_files` (optionally filtered, e.g. `*.yaml`), `search_files` (grep-style, returns matching lines with line numbers) and `read_file` (a whole short file, or a range of lines). The model is told to search first and read only the lines around a match, which keeps token use low on big folders. When the model calls one, the browser reads from the folder (`folder.js`), sends the result back, and asks again, up to 20 rounds. The reply shows a line such as "Read test/src/app.js". With no folder connected, requests are exactly as before, so models without tool support are unaffected. Firefox and Safari don't have this browser feature; there the + menu has no folder item.

**Sandbox (off by default).** **Sandbox** in the + menu turns it on for that chat: its box icon glows green, and a Sandbox chip shows under the message box (its × turns it off). Only then is the model offered `run_js`, which runs a short piece of JavaScript in a Worker inside a hidden, sandboxed iframe (`sandbox/`): no network, no access to this page, your files or storage, and stopped after 5 seconds. The chip's box peeks out while code runs. The code can draw with small built-in helpers (`chart.bar`, `chart.line`, `svg`/`el`), make markdown tables with `table()`, use `random(seed)` for repeatable numbers, and work on what slop's other tools returned earlier in the reply (`reads`) and on the chat's attached text and whole pastes (`files`) as is, instead of the model copying it into its code. Pictures the code shows with `show(svg)` appear under the reply's text, each with **Copy SVG**; they're saved with the reply and never sent back to the model. Pictures are drawn for white and shown on white in every theme. **Copy** under such a reply copies its text, then a line per picture, then the pictures as SVG data URLs at the very bottom, so one Markdown file holds everything; the formatted copy that Teams and Outlook paste has them as PNG.

**GitLab (read-only, self-service).** Anyone can connect their own GitLab: in Settings, type your GitLab address and slop shows the steps right there: a button that opens your GitLab's Applications page, the name and redirect URI to paste (with Copy buttons), and the boxes to tick (`openid` and `read_api`, not *Confidential*). Paste the Application ID back and click Connect GitLab; your company's sign-on does the rest. Nobody has to set anything up centrally. Then **Connect GitLab project…** in the + menu connects one of your projects to that chat with one click, on its default branch (click the branch on the chip to pick another), and the chat gets the four `gitlab_` tools above. GitLab gets 30 seconds to answer each request, and Stop ends one at once. Every request slop makes to GitLab is a read, and a token that could do more than read (`api`, `write_repository`, …) is refused and never kept. The token lasts while the tab is open, like sign-in's; Disconnect in Settings forgets it.

**What a reply is doing.** Under "Assistant" a folded line says what's happening right now (*Waiting for claude-haiku*, *Thinking*, *Running gitlab_read*) with a timer, and when the reply is done, how many steps it took. Click it for every step with its time; click a step for exactly what was asked and what came back, or the model's thinking (shown only for models that send their reasoning). An opened step is at most 200px tall and scrolls; nothing in it is cut, and Ctrl+A inside it selects just that step. It all lives in the tab's memory: after a reload a reply shows its one-line "Read …" summary, and none of it is ever sent to the model.

**Chat titles.** After a chat's first reply, the app sends one short extra request to the same model asking for a title of at most five words (abbreviations allowed). It happens once per chat and the title doesn't change after that. The answer is used only if it's one line of at most 8 words and 60 characters; otherwise, or if the request fails, the chat keeps its first message as its title. The request costs a few hundred tokens and isn't counted in the usage meter.

**Tools the model can use.** A chat sends only the tools it has a use for, decided again for every message; a plain chat sends none, which is cheapest and works with any model. Every path starts with the folder's name (`test/src/app.js`).

| Tool | What it does | Sent only when |
|---|---|---|
| `list_files` | Lists files in the folder or a subfolder, optionally by pattern (`*.yaml`) | a folder is connected |
| `search_files` | Searches inside files, like grep; matching lines with line numbers | a folder is connected |
| `read_file` | Reads a file, or a range of its lines | a folder is connected |
| `git_log` | Lists commits, by branch, range, file or text | the folder is a git repository |
| `git_diff` | Shows uncommitted changes, one commit, or two compared | the folder is a git repository |
| `gitlab_list` | Lists files in the chat's GitLab project or one of its folders | the chat has a GitLab project connected |
| `gitlab_search` | Searches the project's files; matching lines with line numbers | the chat has a GitLab project connected |
| `gitlab_read` | Reads a file from the project, or a range of its lines | the chat has a GitLab project connected |
| `gitlab_api` | Any read-only GitLab API request for the project (pipelines, jobs and their logs, merge requests, commits, issues, or with an empty path the project itself), with GitLab's links; long answers in parts | the chat has a GitLab project connected |
| `search_paste` | Searches a long paste, like grep | the chat has a pasted chip still in memory |
| `read_paste` | Reads lines of a long paste | the chat has a pasted chip still in memory |

Listing and searching leave out what the folder's `.gitignore` files list. Nothing a tool does can delete or rename files, and git is only ever read.

**Usage meter.** Each request asks LiteLLM to include token usage at the end of the stream (`stream_options.include_usage`), and each reply saves its own counts, timing and cost. On startup the app also reads `/v2/model/info` (or `/model/info`, if that's where your proxy has the data) for each model's context limit, output limit and prices. Each request asks for the model's full output limit (`max_output_tokens`), so a long reply isn't cut short by a lower default; a reply that still hits it says so under the reply. The meter in the chat header, next to the model picker, shows how full the current model's context is and what the chat has cost; a model priced at 0 is free, and one without a price shows its cost as unknown. If the proxy allows neither, the meter shows token counts without limits or costs. If your key has a budget, `/key/info` adds it to the meter: spend against the budget and when it resets. The summary lists each model the chat used, most expensive first, with a bar for its share of the cost. **Show detailed stats** in Settings adds each model's average speed and tokens, and a Stats card under each reply.

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

- A strict Content-Security-Policy in `index.html`: only this site's own scripts, styles, fonts and images, connections only to `https://` URLs, and frames only from this site (the sandbox).
- Model replies are rendered as markdown and always sanitised with DOMPurify; links open in a new tab without access to this page. Remote images in replies are blocked.
- Everything else (titles, your messages, file names) is inserted as plain text, never as HTML.
- Your API key and chats live only in this browser's IndexedDB and are sent nowhere except your LiteLLM URL. Settings has **Forget key** and **Delete all local data**.
- Attachments are read in the browser: images up to 10 MB, text files up to 512 KB. Imported chat files are validated before saving.
- A connected folder is read-only: the browser grants read access only, and nothing in the app can write. The model can only reach files inside the folder you picked, and the browser asks for permission again after a reload. Every path the model sees or gives starts with the folder's name (`test/src/app.js` in a folder called `test`), so it's always clear where a file is; a path without it is refused. Browsers never tell a page where the folder is on your disk, so that's as full as a path gets. Files the model reads are sent to your LiteLLM URL like any message. What listing and searching leave out comes only from the folder's own `.gitignore` files (each one covers its folder and below, as in git), plus `.git` itself; a folder without one is read in full, and a folder you name explicitly is always listed. Searches also skip lockfiles, minified files and binaries, and stop at 100 matching lines. Long files come back 1,000 lines at a time, and files over 4 MB aren't read. Disconnect with the × on the folder chip.
- **Smart paste keeps long pastes in this tab only.** A paste over 500 lines (or about 40,000 characters) becomes a chip instead of text. The model gets the first and last 10 lines and two tools, `search_paste` and `read_paste`, to look at the rest, so it only sends what it needs. The text is never saved: a reload forgets it, and the chat keeps just the chip.
- **slop never writes files; changes come as patches you apply.** With a folder or GitLab project connected, the model is asked to answer change requests with one git patch. A valid patch shows as a block to review: the totals, then one row per file (new and deleted files marked) that opens into its diff. **Copy for terminal** copies one readable command, `git apply --recount --stat --summary --apply` with the patch between `<<'END_OF_PATCH'` and `END_OF_PATCH`. Paste it in your repo folder (any folder works; git just has to be installed) and press Enter: git applies all of it or nothing, and lists what changed. The quoted marker makes the shell treat the patch as plain data, so nothing inside it runs. A block counts as a patch only if every line is one git patches are made of and no line is the marker itself; otherwise it stays a plain code block with a note naming the line. To undo, `git checkout -- .` (and delete any new files).
- **Git is read-only.** When the connected folder is a git repository, the model also gets `git_log` (commits, filtered by range, path or text) and `git_diff` (uncommitted changes, one commit, or two compared). They read the `.git` folder directly in the browser, with no library and no network: nothing can be committed, fetched or pushed. The folder chip shows the branch and how many commits are waiting to push (⇡) or pull (⇣) as of your last fetch, refreshed when you connect, open the chat and after each reply. New, untracked files are listed unless a `.gitignore` or `.git/info/exclude` leaves them out.

## Features

- Model picker with search and recent models
- Attach images (sent to vision models) and text files (inlined) with the button, paste or drag-and-drop; click an image to see it large
- Connect a folder to a chat, read-only, so the model can look through it (Chrome and Edge, models with tool support)
- Git, read-only: when the folder is a repo, the model can read its history and diffs, and the chip shows the branch (e.g. `slop · main ⇡2`)
- Changes as git patches: review each file's diff in the reply, then one Copy for terminal and one paste applies them
- Copy any reply in one click: pastes formatted into Teams, Outlook and Word, and as markdown everywhere else
- Mini window (Chrome and Edge): pop the chat out into a small floating window that stays on top of your terminal; close it to bring the chat back
- Smart paste: paste a long log or command output and the model searches it instead of reading it all, so follow-up questions stay cheap
- Markdown replies with syntax-coloured, copyable code blocks, tables and nested lists
- Chat history with search, export/import, and Stop / Retry
- Themes, switchable in Settings, each with its own code colours
- Usage meter (context used and cost per chat), with optional detailed stats per reply and per model
