# Codex / ChatGPT 6.1 Sol medium recommendations

Proposals for Claude and the user to review. **Nothing here authorizes implementation.** The user wants to make the design decisions.

## Start here

Keep the app small, local, and robust: no new backend, build steps, dependencies, or broad rewrites. Only this document should differ from the original repository; keep mockups outside the repo.

| Idea | Benefit | Main trade-off | Recommendation |
| --- | --- | --- | --- |
| Tool permissions | Prevent unoffered tools and access to another chat's pastes. | Small dispatch checks. | Prioritize. |
| Backup import | Restore saved pictures, stats, and other supported fields. | Explicit field validation. | Prioritize. |
| Delete all cleanup | Clear temporary pastes/activity as well as stored data. | Confirm what “all” means. | Recommend. |
| Incomplete responses | Stop labeling cut-off responses “Complete.” | Agree on wording and completion rules. | Recommend. |
| Skip missing `.gitignore` opens | Faster folder listing in the measured fixture. | Small traversal change; no consistent search gain. | Best small speed candidate. |
| Load syntax languages individually | Transfer fewer local library files. | More loading logic; brief first-use coloring delay. | Optional; current loader is reasonable. |
| Regex safety | Prevent some searches freezing the page. | Keep regex with a worker, or remove the feature. | User decision. |
| `ask_user` tool | Ask useful questions with selectable answers. | Question UI and cancellation state; can interrupt users. | New proposal; principles agreed. |

Read [CLAUDE.md](../../CLAUDE.md), [sandbox.md](sandbox.md), and [later.md](later.md). Preserve modular add-ons, deterministic rules, theme tokens, read-only integrations, and the deliberate distinction between saved chats/settings and temporary pastes/activity.

Locations below refer to baseline `9294a7bd725b51d9342b152ceaab16696630826e`; recheck them if code has moved.

## 1. Tool permissions

**Problem:** A fake provider called `run_js` with Sandbox off and got `42`. Another reproduction read a valid paste ID belonging to a different chat. This shows missing dispatch authorization, not a sandbox escape.

**Code:** `app/main.js:405–407` builds offered tools; `453–460` dispatches by name. `app/paste.js:88–92` looks up IDs in a shared registry.

**Fix direction:** Reject calls not in the request's offered-tool set. Separately restrict paste IDs to attachments in the requesting chat; having one paste must not expose every paste. Preserve tool-result ordering and existing add-on hooks.

**Check:** Forbidden handlers never execute; authorized calls still work. Cover Sandbox off, no tools, unknown tools, and cross-chat pastes. Define how a paste added mid-reply affects access rather than silently changing permissions.

## 2. Backup import

**Problem:** Export/import round trips lost pictures and statistics. Import also omits tool summaries and extra metadata.

**Code:** `app/storage.js:65–72` exports full messages; `87–117` imports a limited field list, especially `100–111`.

**Fix direction:** Inventory and validate supported saved fields explicitly; don't blindly copy imported objects. Preserve version-1 compatibility and duplicate handling. Never restore credentials, session tokens, live folder access, temporary paste bodies, or detailed activity. Saved paste chips becoming unavailable after reload is deliberate.

**Decision:** Should sandbox settings and GitLab project metadata restore? Metadata must not imply authentication or permission.

**Check:** Round-trip pictures, stats including zero costs, tool summaries, and ordinary attachments. Reject malformed fields safely; support old exports and duplicates.

## 3. Delete all cleanup

**Problem:** After Delete all, `pasteText(oldId)` still returned the deleted chat's pasted text. Activity also retains memory/DOM references until reload.

**Code:** `app/main.js:169–190` deletes data; `app/paste.js:17` owns pastes; `app/activity.js:22–23` owns replies/timer.

**Fix direction:** Add small cleanup hooks in the owning add-ons. Clear registries/timers and prevent a running reply's later callbacks from restoring deleted data.

**Decision:** Include temporary pastes and activity in “all”? Recommended yes; review the confirmation wording. Individual-chat deletion is separate scope.

**Check:** Cancel leaves data intact; confirmation clears it. Test during streaming/tool execution, with no stale attachments, timers, or resurrected chats.

## 4. Incomplete responses

**Problem:** Partial SSE text followed by EOF, without `[DONE]` or a finish reason, was saved as complete.

**Code:** `app/api.js:139–175` parses completion; `app/main.js:438` defaults missing finish to `'stop'`; `446–447` gates tool execution. `app/components/messages.js:199` defines status labels.

**Fix direction:** Track actual completion evidence, retain partial text, and refuse incomplete tool calls. A valid finish reason without `[DONE]` can still be successful; providers vary. Don't reuse “Interrupted by your message” for a network interruption.

**Decision:** Choose wording and retry behavior. Automatic retries can duplicate work/cost and are not included in this proposal.

**Check:** Normal completion, `[DONE]` only, finish reason then EOF, incomplete EOF, partial tool arguments, Stop, user-message interruption, and length limits.

## 5. Skip absent `.gitignore` opens

**Idea:** Enumerate a child directory first; open its ignore file only if that fresh listing contains a file named `.gitignore`. Apply its rules before filtering descendants.

**Code:** `app/folder.js:108–118` (`walk`), especially `116`; `app/ignore.js` (`withIgnoreFile`, `ignoreRulesFor`). Root/path rules are already loaded at `folder.js:123` and `133`.

**Evidence:** On 3,000 OPFS files / 200 directories, median listing fell **67.8 → 49.8 ms (26.5%)**. Cold search was **475.2 → 482.6 ms** and warm search **187.3 → 196.1 ms**: no consistent search gain. Output hashes matched and 42 folder checks passed.

**Keep:** Ancestor/nested rules, negation, ordering, explicit paths, and current caps. Don't load root rules twice or cache absence across calls. This does not fix incomplete Git ignore-pattern support or search-cap semantics.

**Check:** Nested rules, subpath starts, file versus directory named `.gitignore`, and creation/removal between traversals. Remeasure before claiming a speedup; filesystem enumeration is not an atomic snapshot.

## 6. Optional syntax-language loading

**Idea:** Load core plus only the vendored languages actually used. A Python block requests the existing local Python file; later blocks reuse it. No CDN, backend, build, or new nginx requirement. Themes still control colors through CSS.

**Code:** `app/highlight.js:5`, `12–22`, and `27–43`; `app/components/messages.js:139` onward.

**Current behavior:** All 23 languages already load asynchronously on the first code block, not at app startup. This proposal reduces files, not delays coloring until completion. Static HTTP serving remains necessary as today; `file://` support is not promised.

**Evidence:** For JavaScript/Python/JSON, **24 → 4 requests**, **47,341 → 13,052 gzip bytes**, and **205.0 → 68.5 ms** readiness with a simulated 40 ms asset delay. The 76-check app suite and output parity for 80 names/aliases plus uppercase forms passed.

**Trade-off:** About 34 KB saved in that fixture versus alias mapping, per-language loads, and possible first-use plain code on slow connections. Keeping the existing loader is reasonable for simplicity. Nginx already enables automatic gzip (`nginx.conf:9–14`); no manual compression needed.

**Implementation/checks:** Deduplicate loads; explicitly map aliases to trusted file paths; review grammar dependencies; preserve escaping/cache and unknown-language behavior. Test concurrent/new languages, fetch failure, detached code elements, slow networks, theme switching, copy behavior, and actual CSP. Those remaining checks were not established by alias parity alone.

## 7. Regex safety

**Problem:** Arbitrary regexes run on the UI thread. In an isolated V8 worker, `(a+)+$` on `'a'.repeat(20) + '!'` took about 85 ms; lengths 25 and 29 exceeded a one-second cutoff.

**Code:** `app/lines.js:7–15`; `app/folder.js:141–144`; `app/paste.js:101`. `excerpt()` also executes a regex search.

**Choose:**

- Remove regex mode: simplest, but loses a feature and requires updating tool descriptions.
- Keep regex in a worker with a fixed deadline: protects responsiveness, but adds lifecycle, data-transfer, and cancellation logic; legitimate expensive searches may time out.
- Leave it temporarily: no new logic, but the freeze risk remains.

A main-thread timeout, pattern-length limit, or blacklist does not make arbitrary regex safe. A new regex library adds dependencies and may change semantics.

**Check:** Run the pathological regression in an isolated process/worker so tests cannot hang. Verify UI responsiveness, cancellation, explicit errors, literal search, and retained regex semantics if supported.

## 8. Potential new tool: `ask_user`

**Purpose:** Give users a clear choice when missing information would materially change the result. The user agrees with these principles; implementation is still a proposal.

### The experience

- One focused question with 2–3 options and short trade-offs.
- Recommend an option when justified; never submit it automatically.
- Allow free text and cancellation.
- Pause dependent work until an explicit answer; return it as the matching tool result.
- Remember the answer in conversation and avoid asking it again.

### Ask only when useful

Ask about meaningful alternatives, missing constraints that could make output unusable, or significant commitments. Skip questions when the answer is known, the default is obvious, the choice is minor/reversible, or a useful draft is enough. Let the model decide from instructions; don't add keyword heuristics or mandatory questionnaires.

Suggested instruction:

```text
Ask only when the answer would substantially change the result
and cannot be inferred from the conversation.
Otherwise, choose a reasonable default and proceed;
state consequential assumptions briefly.

Ask one focused question with 2–3 options and free text.
Explain trade-offs and recommend an option when justified.
Wait for the answer before continuing dependent work.
Do not repeat answered questions or ask routine confirmations.
```

### Simple implementation

Use one ordinary function tool through LiteLLM. Claude/Bedrock, GPT/Azure, and local models can share it where their model/provider supports tool calling. This is an app harness feature, not a special Claude endpoint. Unsupported models can use ordinary text questions; don't guess support from model names.

Proposed arguments: `question`, `options` with `id`/`label`/`description`, and optional `recommended_id`. Validate fields with fixed limits; display text safely. Return a selected option, free text, or explicit cancellation with the original tool-call ID.

Flow: **receive complete arguments → show card → wait for Submit → return answer → continue the existing model loop**. No separate planning engine or open network stream while waiting. Keep it a removable add-on independent of folder/sandbox access. Decide how it is enabled rather than silently adding a default.

**Code:** `app/main.js:405–407` offers tools, `453–472` dispatches/results; `app/api.js:117–125` sends definitions and `165–170` assembles calls. Existing interruption/deletion paths: `main.js:334–342`, `169–175`.

**Important:** Dispatch currently uses `Promise.all`. Define a simple deterministic rule for multiple questions/mixed batches so answer-dependent tools don't run early. Stop, cancellation, chat switching, deletion, reload, and a new composer message must not leave stale cards or dangling promises. Abandoning pending questions on reload is simpler than persistence, but must keep conversation/protocol valid. A question answer does not authorize unrelated actions.

### Business examples

| Task | Useful question |
| --- | --- |
| Presentation | Executive audience or delivery team? |
| Supplier comparison | Prioritize price, reliability, or delivery speed? |
| Sensitive client email | Offer a concession or hold existing terms? |
| Report summary | Executive brief or detailed action plan? |

Skip each question if the user already supplied the answer or a draft would suffice.

**Cost:** A question component and pending state, an additional model round, and friction if overused. Instructions help but cannot guarantee model behavior.

**Check:** Review a phone-friendly mockup outside the repo first. Test choices/free text, no automatic submission, cancellation, malformed/multiple/mixed calls, correct result IDs, stale-card handling, Stop/reload/deletion, keyboard/touch access, and themes. Use fake providers, then available real LiteLLM configurations; report unsupported cases honestly.

## What to leave out for now

- **Delay colors until completion:** Rendering work fell 325.7 → 218.8 ms, but overall completion improved only 2.8%; visible color change at the end. Background warming combined with deferral was not tested.
- **Plain-text streaming:** Rendering work fell to 49.5 ms, but hides formatting until completion and produced a 99 ms final task. A visual trade-off.
- **Batched/bounded traversal rewrite:** Synthetic traversal improved 50.6 → 8.6 ms, but real listing regressed 67.8 → 76.1 ms and search gains were mixed. Not a general speed improvement.

## Evidence and handoff

Experiments used Chromium 154, Node 24.19.0, five runs per variant with varied order, medians, gzip level 6, and fake APIs. OPFS is browser storage; synthetic handles measure traversal overhead, not disk throughput. Stream fixtures were 100,260 characters with 160 JavaScript blocks. Results are not production/provider speed guarantees.

The baseline passed 440 checks. Prototype checks: 42 folder checks per folder variant; 76 app checks for deferred colors; separately 76 app checks and alias parity for the language loader. System Chromium differed from Playwright's pinned browser. None replaces regression checks for future fixes.

Temporary harness/results: `/tmp/slop-perf-review/` (`bench.mjs`, `report.md`, `results*.json`). These may disappear after this session; remeasure in the implementation environment.

**For Claude:** Recheck findings against current code, flag disagreements, and ask the user about open design choices. Implement only agreed scope. Follow CLAUDE.md: observe regression checks fail before fixing, run relevant suites, and use `npm run bench` before/after speed claims. Keep changes narrow and only this plan file on the review branch until the user authorizes otherwise.
