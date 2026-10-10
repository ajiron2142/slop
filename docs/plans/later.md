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

## Set aside

- **A short answer for a repeated tool call** ("Same result as step 3" when the model calls the same tool
  with the same arguments twice in one reply). Saves some tokens, but a file can change between the two
  calls, and the savings are small. Not worth the rule.
- **An always-on figure of what's happening now** (thinking, reading a file, running code), lighter than
  the reply tree. To be mocked up on its own.
