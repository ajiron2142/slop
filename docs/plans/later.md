# Later: ideas to check or decide

Things worth doing that need something we don't have yet. Nothing here is built.

## Prompt caching (check your LiteLLM first)

**What it is.** In a reply that uses tools, every round sends the whole conversation again: the system
prompt, the messages, and every tool result so far. Providers can keep the start of a request that hasn't
changed and charge much less for it the next time (often about a tenth), and answer faster.

**Where it stands.** slop already reports cached tokens (the Stats card's "Cached" row) and keeps the start
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

## Set aside

- **Redo on the last reply.** Built Edit instead: saving your last message unchanged asks again, and
  usually it's better to tell the model what to fix, so it keeps the context of what it said.
- **A short answer for a repeated tool call** ("Same result as step 3" when the model calls the same tool
  with the same arguments twice in one reply). Saves some tokens, but a file can change between the two
  calls, and the savings are small. Not worth the rule.
- **An always-on figure of what's happening now** (thinking, reading a file, running code), lighter than
  the reply tree. To be mocked up on its own.
