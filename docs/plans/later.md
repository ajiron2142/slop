# Later: ideas to check or decide

Things worth doing that need something we don't have yet. Nothing here is built.

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

## MCP (only once there's a server to connect to)

slop isn't an MCP client. One client could cover many tools (OpenShift, Argo CD, …), but it's only worth
building once an MCP server exists that a page in the browser can reach.

## Set aside

- **Redo on the last reply.** Built Edit instead: saving your last message unchanged asks again, and
  usually it's better to tell the model what to fix, so it keeps the context of what it said.
- **A short answer for a repeated tool call** ("Same result as step 3" when the model calls the same tool
  with the same arguments twice in one reply). Saves some tokens, but a file can change between the two
  calls, and the savings are small. Not worth the rule.
- **An always-on figure of what's happening now** (thinking, reading a file, running code), lighter than
  the reply tree. To be mocked up on its own.
- **Asking two models side by side** ("arena"). The reply loop is one reply at a time per chat; two at once
  reaches into all of it. Compare with two tabs and a fixed set of test questions instead.
- **Remembering the key only while the tab is open** (a "Remember this key" box). Small; worth it before
  slop is used on shared computers.
