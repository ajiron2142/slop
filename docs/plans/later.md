# Later: ideas to check or decide

Things worth doing that need something we don't have yet. Nothing here is built.

## Prompt caching (checked: works)

**What it is.** In a reply that uses tools, every round sends the whole conversation again: the system
prompt, the messages, and every tool result so far. Providers can keep the start of a request that hasn't
changed and charge much less for it the next time (often about a tenth), and answer faster.

**Checked.** Claude Haiku through the proxy shows "Sent, cached" on replies with tool calls, so the proxy
already marks requests and slop needs nothing. A Claude model that never shows it is the one to ask the
proxy's admins about (`cache_control_injection_points`). Each model has its own cache, so the first reply
after switching models pays full price.

**Where it stands.** slop already reports cached tokens (the Stats card's Tokens bar) and keeps the start
of each request the same (the date line changes once a day, and the tools are always in the same order).
OpenAI-style providers cache on their own. Claude models only cache what the request marks with
`cache_control`, and slop marks nothing.

**What to check first, in LiteLLM:**
- Whether `cache_control_injection_points` is set for the Claude models. If it is, LiteLLM already marks
  requests and slop needs nothing.
- Otherwise: send a long chat with a folder connected to a Claude model, open Stats on a reply that used
  tools, and look at "Cached". 0 on every reply means nothing is cached.

**If it's needed in slop.** Mark the system message and the last message with
`cache_control: { type: 'ephemeral' }` (a few lines in `api.js`). Not built untested: some backends refuse
a request with fields they don't know, so this needs a check against each kind of model behind the proxy
first. A safer form would be per model, only when LiteLLM's model info says it supports prompt caching.

## "Think harder" (check your LiteLLM first)

A small control next to the model picker (Default · Low · Medium · High), shown only for models whose
LiteLLM model info says `supports_reasoning`. Default sends nothing, so each model does what it does
today (Claude models don't think unless asked; OpenAI's reasoning models think at medium; newer Gemini
models decide for themselves). Low, Medium and High send LiteLLM's `reasoning_effort`, which it turns
into each provider's own setting. Check with a real model on your proxy before building.
Claude models that think while using tools want their thinking handed back with each tool round (LiteLLM's
`thinking_blocks`), and slop drops reasoning today, so check a reply that thinks *and* reads files.

## Web search (check your LiteLLM first)

The model searches the web itself, through the provider; no backend in slop. LiteLLM passes a
`web_search_options` request through for models that support it. It would be a + menu switch, like the
Sandbox. Whether it works depends on your proxy and models, so check first.

## Microsoft 365: Outlook and Teams (check whether it's possible first)

**The idea.** Connect your own Outlook and Teams, read-only, the way GitLab connects: through Microsoft
Graph straight from the browser, signed in with your own Microsoft account (sign-in with PKCE, no backend).
The model would get tools such as `outlook_search`, `outlook_read`, `calendar_list` and `teams_read`.
Nothing is ever sent, changed or deleted (no `Mail.Send` or other write permission is asked for).

**Try it first:** `docs/plans/m365-check.html` signs you in with your own app registration and makes three
read-only Graph requests (profile, mail, Teams chats), saying in plain words what worked and, if it
didn't, whether an admin is needed. Serve the repo locally (`python3 -m http.server 8000`) and open
`http://localhost:8000/docs/plans/m365-check.html`; add that address as a Single-page application
redirect URI.

**What to check first, in your organisation** (each one can rule it out):
- Can you register an app yourself (Entra ID, *Users can register applications*), or only an admin?
- Can you agree to read-only permissions yourself (`Mail.Read`, `Calendars.Read`, `Chat.Read`), or does
  the tenant ask for admin consent? Many tenants do, which breaks "set up by each person, needs no one
  to manage it".
- Teams *channel* messages need `ChannelMessage.Read.All`, which always needs an admin; your own chats
  (`Chat.Read`) may not.
- Whether your company's rules let an outside web app read mail at all.

**Rules if it's built.** A removable add-on, like GitLab. Each person pastes their own app's ID in Settings;
no tenant or client IDs go in the repo. The token lasts while the tab is open.

**Already there:** Copy under a reply pastes formatted text (and sandbox pictures as PNG) into Outlook and Teams.

## Connectors (only where one pays off a lot)

Each would be an add-on like GitLab: a read-only tool, opt-in, set up by each person. What decides it:
whether the service lets a page in the browser call it (CORS), and whether people can get a token themselves.

- **Several GitLab projects in one chat** (say a GitOps repo and the app it deploys). Clean, because every
  path already starts with its project's path; `gitlab_search`, `gitlab_api` and `gitlab_list` (with no
  path) would take a project, which can be left out when there's one. A chip per project, each with its
  branch. Medium-sized. Until it's needed: connect one repo through GitLab and the other as a folder.
- **OpenShift** (pods, logs, events, VMs through OpenShift Virtualization): one GET-only `openshift_api` tool;
  the token from `oc whoami -t` (self-service, sees only what you can). Needs a cluster admin to add slop's
  address to `additionalCORSAllowedOrigins`, and the host in slop's CSP (a security change: ask first).
  Today: paste `oc get` / `oc describe` / `oc logs` output.
- **Argo CD** (sync, health, drift): one GET-only `argocd_api` tool. Needs CORS allowed on Argo's ingress and
  an account allowed to make API tokens. Today: paste `argocd app get` / `argocd app diff` output.
- **MCP servers** (Red Hat has one for OpenShift): slop isn't an MCP client. One client would cover many
  servers, but it's the biggest of these and each server must allow slop's address. Not until there's a
  server to reach.

## Set aside

- **Redo on the last reply.** Built Edit instead: saving your last message unchanged asks again, and
  usually it's better to tell the model what to fix, so it keeps the context of what it said.
- **A short answer for a repeated tool call** ("Same result as step 3" when the model calls the same tool
  with the same arguments twice in one reply). Saves some tokens, but a file can change between the two
  calls, and the savings are small. Not worth the rule.
- **An always-on figure of what's happening now** (thinking, reading a file, running code), lighter than
  the reply tree. To be mocked up on its own.
- **Replies that keep going with the laptop shut.** The reply loop (streaming, tools, saving) runs in the tab,
  so a sleeping laptop stops it. Running it elsewhere means a server agent: storage, keys on a server,
  sign-in, someone to run it. Not slop. Keeping the laptop awake (screen locked is fine) covers it.
- **Asking two models side by side** ("arena"). The reply loop is one reply at a time per chat; two at once
  reaches into all of it. Compare with two tabs and a fixed set of test questions instead.
- **Remembering the key only while the tab is open** (a "Remember this key" box). Small; worth it before
  slop is used on shared computers.
