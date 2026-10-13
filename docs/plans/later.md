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

## Next, from the Codex review (agreed worth doing, not built yet)

- **Delete all clears memory too.** It wipes everything saved, but pastes (and activity lines) stay in the
  open tab until a reload. Fix: a small cleanup hook in the paste and activity add-ons. About 5 lines and a check.
- **Regex search can freeze the page.** The folder and paste search tools run the model's regular expression
  on the page's thread, so a pathological one hangs it. Leaning to remove regex search (keep plain text):
  simplest, and models rarely need it. Needs a decision.

## Ideas to talk through (not decided, nothing built)

Each of these must still pass the manifesto test: small, simple, and a lot of value. Talk before building.

### Arena (many tries, best one survives)

An orchestrator spawns several sub-agents that each try to implement the same idea; their results are
compared and the best one is kept. Output stays a git patch the user reviews (read-only rule).
*Opinion:* the most expensive idea here (N times the tokens) and the heaviest change: the reply loop is
one reply at a time per chat, so this reaches into all of it (an earlier two-models-side-by-side "arena"
was set aside for this reason). "Best" also needs a rule, not a guess: only fixed, stated criteria such as
"the test suite passes" would fit the deterministic-rules principle. Lowest priority. Cheaper cousin: run
the same prompt in two tabs and compare by hand.

### Feature mode (probe the problem, prototype the options)

Describe a feature; the AI asks what problem you are really solving, then you prototype two or more
approaches interactively (like the mockup artifacts) and compare pros, cons and workflow before choosing
one to implement.
*Opinion:* high value and fits how this project already works (mockup first, ask before building). It
can start tiny: a system prompt/mode that asks clarifying questions and produces two short mockups
with trade-offs, no new machinery. Build only the prompt first, see if it is enough. Best candidate.

### Learn and quiz mode

Ask about a subject ("teach me Go"); the AI teaches in steps and gives interactive quizzes to test you.
*Opinion:* good value, easy to keep small: a mode prompt plus a quiz block (question, choices, answer
revealed on click) rendered in the reply. Quiz results stay in memory (ephemeral) unless you decide
progress is worth saving. Keep it deterministic: the quiz format is fixed, the model fills it in.

### Learn a repo (understand code the AI wrote for you)

Connect a repo (like this one, through the existing read-only GitLab/folder tools) and have the AI walk
you through the core logic and the main design decisions, then quiz you on them, so you can maintain
what Claude wrote and do not end up with slop you do not understand.
*Opinion:* the most valuable of the four for this project's author, and it reuses learn mode plus the
folder tools, so it should be built as a thin layer on top of the quiz mode, not separately. A useful
fixed rule: questions must cite a file and line, and the model must open the file first (no answers from
memory), so the quiz stays checkable. Possible later input: the repo's own CLAUDE.md and docs as the list
of design decisions to learn.

*Suggested order:* feature mode (prompt only), then learn/quiz, then learn-a-repo on top of it; arena last, if ever.

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
