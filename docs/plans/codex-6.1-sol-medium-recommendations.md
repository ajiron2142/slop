# Codex / ChatGPT 6.1 Sol medium recommendations

Planning notes for Claude to review with the user before implementation. This is the user's requested report label. These recommendations are proposals, not approved design decisions or implemented fixes.

Reviewed baseline: `9294a7bd725b51d9342b152ceaab16696630826e` in `ajiron2142/slop`. Line numbers below refer to that commit; use the named functions if the code has moved. Only this planning document was added to the repository. Earlier experiments modified HTTP responses in an isolated harness, not application files.

## User priorities and existing design rules

The user wants a small, local, robust app and wants to make the design decisions. Avoid introducing infrastructure, build steps, new dependencies, elaborate state machines, or optimizations with unclear benefits. A person cloning the repo should still serve the static files as they do today. Keep the configured LiteLLM API connection and optional integrations as existing explicit connections.

Read [CLAUDE.md](../../CLAUDE.md), [sandbox.md](sandbox.md), and [later.md](later.md) before implementing. Relevant deliberate choices:

- Plain browser ES modules, vendored libraries, no application backend or build step.
- Pastes and detailed reply activity live only in memory. Chats and settings persist.
- Integrations are optional; file access is read-only. The sandbox is an isolated, offline execution feature, not a server.
- Deterministic rules, modular add-ons, theme tokens, and no hidden heuristics.
- Ask before heavy work or behavior/design changes; follow the documented mockup requirement for visual design changes.
- For a confirmed bug, add a regression check, observe it fail, fix it, then observe it pass. Follow the documented checks and benchmark requirements.

The existing nginx deployment configuration is an optional static-serving arrangement, not a dependency to add to browser features. It already compresses JS/CSS automatically (`nginx.conf:9–14`). No manually compressed libraries, CDN, bundler, or new nginx requirement is proposed.

## Revised shortlist

| Proposal | Reason | Cost / decision | Suggested status |
| --- | --- | --- | --- |
| Enforce tool permissions | An unoffered tool can currently execute; paste IDs are not scoped to the requesting chat. | Small checks at dispatch; deny unauthorized calls explicitly. | Prioritize correctness fix. |
| Preserve supported backup fields | Export includes persistent information that import discards. | Explicit validation of supported fields; decide which connection metadata should restore. | Prioritize correctness fix. |
| Clear temporary data on Delete all | Deleted chats' pastes and activity can remain in memory. | Small cleanup hooks; decide whether temporary data is included in "all". | Recommend, subject to that decision. |
| Mark incomplete streams accurately | Unexpected EOF can be saved as a complete answer. | Define completion signals and user-facing wording without breaking provider compatibility. | Recommend, subject to that decision. |
| Skip opening absent `.gitignore` files | Avoid needless missing-file lookups during folder traversal. | Small traversal adjustment; measured listing benefit, no consistent search benefit. | Best small performance candidate. |
| Load only needed syntax languages | Reduce first-use coloring-library transfers. | More asynchronous loading bookkeeping; a newly encountered language may briefly be plain. | Optional; keeping the current loader is reasonable. |
| Prevent regex searches freezing the page | Certain valid regexes monopolize the UI thread. | Worker isolation adds machinery; removing regex removes a feature. | User design decision required. |

No change is guaranteed bug-free. Prefer a narrow fix with regression evidence over a broader rewrite. There is no authorization in this document to implement the shortlist wholesale.

## 1. Enforce tools and paste access at execution

**Locations:** `app/main.js:405–407` builds the offered tools; `complete()` dispatches returned calls at `453–460`. `app/paste.js:17` owns the shared registry, `55–56` checks whether the chat has any available paste, and `runPasteTool()` at `88–92` looks up any supplied ID.

**Observed:** A mocked provider returned `run_js` in a plain chat with Sandbox off, and the dispatcher executed it, returning `42`. Another reproduction used a valid paste ID not attached to the requesting chat and successfully read that paste. Offering a tool to the provider is not an execution permission check. This does not demonstrate an escape from the sandbox's existing isolation.

**Narrow implementation direction:** Build a set of tool names actually offered for the request and check it before dispatch, including when no tools were offered. Independently authorize paste IDs against the requesting chat's attachments: having one paste must not grant access to every paste in the tab. Preserve malformed-argument handling and the existing tool-result protocol, result ordering, activity hooks, and add-on removal boundaries. Return an explicit error without executing unauthorized work.

**Trade-off:** A provider's unavailable tool request is rejected rather than accidentally executed. Keep permission snapshots consistent with the request; consider follow-up messages that attach pastes while a reply is running, rather than silently choosing new semantics.

**Validation:** In the app/paste/sandbox suites, cover an unoffered known tool, unknown tool, Sandbox off, one authorized paste plus another chat's paste, no attached paste, and authorized calls still succeeding. Assert the forbidden handler did not run, not just that an error was displayed. Use fake provider responses; no real credentials are necessary.

## 2. Make backup import preserve supported persistent data

**Locations:** `app/storage.js:65–72` (`exportAll`) exports full stored messages and metadata. `87–117` (`importData`) reconstructs messages using only `role`, `content`, `ts`, and validated `files` (`100–105`), and metadata using only ID/title/dates (`106–111`). Consumers include `app/components/messages.js:99–105` and `199–223`; sandbox pictures are stored on `message.pictures`.

**Observed:** Export/import round trips lost saved reply statistics and pictures. The field whitelist also drops tool summaries and additional chat metadata; determine each field's intended persistence before restoring it.

**Narrow implementation direction:** Inventory the actual persisted schema and explicitly validate supported fields, including pictures, statistics, and saved tool summaries. Do not blindly spread imported objects into internal state. Preserve version-1 compatibility, duplicate handling, and current basic file validation. Decide separately whether `meta.sandbox` and GitLab project metadata should restore; project metadata must not imply an authenticated connection or permission.

**Trade-off:** More validation, but no new infrastructure. Backups should restore supported saved content, not credentials, live file handles, in-memory paste bodies, detailed activity, or session tokens. A saved paste chip is not the paste's full text: its unavailable-after-reload behavior is intentional. Do not expand export to include secrets as part of this fix.

**Validation:** Round-trip a representative chat with pictures, tool summary, statistics including zero costs, and ordinary attachments. Cover old minimal version-1 exports, malformed optional fields, duplicate IDs, and exclusion of secrets/live access. Check restored pictures render safely through existing rendering paths. Use the app suite and the relevant sandbox/stats suites; keep add-on-specific checks modular.

## 3. Clear temporary data when Delete all succeeds

**Locations:** `app/main.js:169–190` (`onDeleteAll`), `app/storage.js:60–63` (`clearAll`), the `pastes` map at `app/paste.js:17`, and the `replies` map/timer in `createActivity()` at `app/activity.js:22–23`, `89–92`, and `114–115`.

**Observed:** After confirming Delete all, `pasteText(oldId)` still returned the deleted chat's full pasted text in the current tab. IndexedDB cleanup does not clear the paste registry. The activity registry also lacks an explicit clear operation and retains reply details/DOM references until reload.

**Narrow implementation direction:** Add small explicit cleanup hooks in the owning modules, called by the existing Delete all path. Clear retained entries and the activity timer. Keep these hooks removable with their add-ons. Check references held by a reply already running: aborting a network request does not synchronously end every tool or callback. Ensure completion after deletion cannot recreate stored chats or reintroduce cleared activity.

**User decision:** Does Delete all also discard every temporary paste and detailed activity in the tab? Recommended yes; the current confirmation explicitly names chats, settings, and the API key, so review its wording if needed. Do not silently broaden individual-chat deletion in this change.

**Validation:** Confirm cancellation leaves data intact; confirmation clears stored data and makes old paste IDs unavailable. Exercise deletion during streaming/tool execution and after an activity record has been created. Check no lingering timer, stale composer attachment, or resurrected chat. Relevant suites: app, paste, activity, sandbox.

## 4. Distinguish incomplete streams from successful completion

**Locations:** `app/api.js:139–175` (`streamChat`) tracks `finish`, recognizes `[DONE]`, and also returns on transport EOF. `app/main.js:438` converts missing finish to `'stop'`; `446–447` gates tool execution. `app/components/messages.js:199` maps `'stop'` to "Complete" and `'interrupted'` to "Interrupted by your message".

**Observed:** A mocked SSE response containing partial text and then EOF, with neither a finish reason nor `[DONE]`, was saved with `stats.finish === 'stop'`. It therefore appeared complete.

**Narrow implementation direction:** Preserve an explicit completion signal from the parser and distinguish a stream lacking any completion evidence. Keep received text. Do not run a partially assembled tool call from an incomplete response. Do not reuse the existing user-message interruption label for a network interruption.

**User decision / trade-off:** Choose wording and retry behavior. Automatic retries could duplicate provider work and cost; this proposal does not imply automatic retry. Provider compatibility matters: `[DONE]` without a finish reason, a finish reason without `[DONE]`, usage-only chunks after completion, and providers' documented variations need deliberate handling. Missing `[DONE]` alone is not proof of failure if a valid finish reason arrived.

**Validation:** Fake SSE fixtures for ordinary completion, `[DONE]` without finish reason, finish reason followed by EOF, partial text followed by EOF, truncated tool arguments, explicit Stop, user-message interruption, and length limits. Verify saved status, retained text, and whether tools ran. Relevant suites: app, stats, plus affected tool add-ons.

## 5. Skip absent `.gitignore` opens during traversal

**Locations:** `app/folder.js:108–118` (`walk`) already enumerates each directory, but line `116` opens each child directory's `.gitignore` before enumerating that child. `ignoreRulesFor()` / `withIgnoreFile()` in `app/ignore.js` own rule loading. The root/path rules are loaded by `list()` and `search()` at `123` and `133`.

**Narrow implementation direction:** For a child directory, enumerate its entries first; only load its own ignore file if that fresh listing contains a file named exactly `.gitignore`. Apply that directory's rules before filtering/descending into its entries. Preserve root and ancestor rules, nested precedence, negation, name ordering, explicit-path behavior, and existing list/search limits. Avoid loading the root's rules twice. Do not cache absence across calls: a newly created ignore file must be picked up on a subsequent traversal.

**Measured:** On a real browser OPFS fixture of 3,000 files / 200 directories, median listing time fell from **67.8 ms to 49.8 ms (26.5%)**. Ranges were 52.1–78.9 ms before and 47.7–55.1 ms after. Cold search changed from 475.2 to 482.6 ms; warm search from 187.3 to 196.1 ms. There was no consistent search improvement. Listing and search output hashes matched; the existing folder suite passed 42 checks with the prototype.

**Trade-off:** Small change in when ignore files are read. A directory changing during enumeration is not an atomic snapshot; do not promise stronger filesystem consistency than the existing implementation. This optimization does not fix the existing ignore parser's incomplete Git pattern support or the search cap's semantics.

**Validation:** Nested ignores, negations, ignored subdirectories, a real `.gitignore`, a directory named `.gitignore`, and creating/removing an ignore file between calls. Confirm identical ordering/output and ancestor rules when starting from a subpath. Run the folder suite and `npm run bench` before/after; separately reproduce the representative listing fixture.

## 6. Optional: load only syntax languages actually used

**Locations:** `app/highlight.js:5` lists 23 vendored languages. `load()` at `12–22` imports core plus all 23 on first use. `highlight()` at `27–43` queues connected code elements, accepts language aliases via highlight.js, and caches output. `app/components/messages.js:139` onward renders Markdown/code blocks; styling remains in existing theme CSS.

**Clarification:** The current app already loads the highlighter asynchronously when the first code block appears, not at app startup. The proposal changes how many language files are loaded. A Python block would trigger a same-origin request for the existing vendored Python module; later Python blocks reuse it. A new language triggers its own request. These are local static assets, not external services. Ordinary browser HTTP serving remains necessary as today; this is not a promise that opening `index.html` through `file://` will work.

**Narrow implementation direction if approved:** Keep one shared core load and deduplicate per-language loads. Use an explicit mapping of supported names/aliases to existing canonical vendored files, including uppercase inputs. Unknown/missing languages remain plain. Do not interpolate untrusted language names directly into import paths. Register a language before coloring it, preserve safe escaped output and the bounded result cache, and avoid recoloring detached elements. Review grammar dependencies before loading one language alone. Define failed-load behavior without unhandled rejections or retry storms. Adding a language should remain straightforward rather than maintaining multiple inconsistent registries.

**Measured:** For JavaScript, Python, and JSON on a cold page, requests fell from **24 to 4**, library payload from **47,341 to 13,052 gzip bytes**, and readiness from **205.0 to 68.5 ms**. Timing used a controlled 40 ms delay per static response, not a production connection. Readiness ranges: 196.5–210.8 ms before, 66.4–74.4 ms after. Uncompressed bytes fell from 112,057 to 31,444. The 76-check app suite passed, and output matched for all 80 existing canonical names/aliases plus their uppercase forms.

**Trade-off / recommendation:** Roughly 34 KB saved in that compressed fixture, at the cost of alias mapping, per-language asynchronous state, and first-use loading for each language. A slow connection may briefly show plain code. Keep the current loader if this complexity is not worth the savings. Neither option needs builds or server code. Existing theme CSS determines colors; changing themes should not fetch a different highlighter. The prototype's alias tests do not establish slow-network/theme-switch behavior.

**Validation still needed before implementation:** Concurrent blocks in the same/different languages; a new language midway through streaming; slow responses; failed module fetches; unknown/missing aliases; code elements replaced while loading; theme changes during and after loading; multiple supported themes; safe output for hostile text; and the app's real CSP. Compare final markup and copy behavior. Do not combine this with delaying colors until completion without a separate decision and measurement.

## 7. Regex safety requires a product choice

**Locations:** `app/lines.js:7–15` (`queryRegex`) accepts arbitrary JavaScript regexes. They execute synchronously in `app/folder.js:141–144` and `app/paste.js:101`; `excerpt()` also performs a regex search.

**Observed:** An isolated V8 worker executing `(a+)+$` against `'a'.repeat(20) + '!'` took about 85 ms. Inputs with 25 and 29 `a` characters exceeded a one-second harness deadline and were terminated. These are synthetic examples of catastrophic backtracking, not normal-search performance measurements. On the UI thread, this work cannot be interrupted by a Stop click or `setTimeout` callback.

**Choices for the user:**

1. Keep literal search and remove/refuse regex mode: simplest implementation, but intentionally removes regex functionality and requires updating tool schemas/descriptions.
2. Retain regex with an isolated worker and fixed deadline: preserves the feature and protects responsiveness, but adds worker lifecycle, serialization, cancellation, and timeout handling. Legitimate expensive searches may be rejected; moving large paste/file contents also costs memory and time.
3. Leave current behavior temporarily: no new logic, but the confirmed freeze risk remains.

Do not claim a pattern-length limit, keyword blacklist, or main-thread timeout makes arbitrary regex safe. A non-backtracking regex library changes semantics and adds a dependency; it conflicts with the simplicity preference unless explicitly justified and approved.

**Validation if a protection is chosen:** Observe the original regression in an isolated test process/worker so the suite cannot hang. Confirm the UI remains responsive, cancellation works, errors are explicit, literal matching remains unchanged, and valid regex behavior and deterministic case sensitivity are preserved if regex stays supported. Keep folder/paste add-on tests modular.

## Experiments deliberately left out of the shortlist

- **Delay syntax coloring until the answer finishes:** In a 100,260-character streamed fixture with 160 JavaScript blocks, rendering work fell from 325.7 to 218.8 ms and the longest UI task from 130 to 73 ms, but complete-response time only fell from 2245.2 to 2182.8 ms (2.8%). Code visibly changes from plain to colored at the end. The measured prototype also delayed initial library loading until completion; background warming combined with deferred coloring was not tested. The user prefers seamless behavior, so this is not recommended by default.
- **Plain-text streaming, format only at completion:** Rendering work fell to 49.5 ms, but Markdown formatting disappears while streaming and final formatting produced a 99 ms task. This is a visible design trade-off, not a free optimization.
- **Bounded/batched folder traversal rewrite:** A 50,000-file synthetic handle fixture fell from 50.6 to 8.6 ms and visited 105 instead of 1,001 directories, returning the same first 5,000 files. Real OPFS listing regressed from 67.8 to 76.1 ms; real search results were mixed, including a slower cold-search pilot. Do not adopt the measured prototype as a general speed improvement. Accurate total counts and cap/filter behavior also require separate decisions.

## Evidence limits and implementation handoff

Performance experiments used Chromium **154.0.8037.57**, Node **24.19.0**, five repetitions per variant with rotated/alternating ordering, and medians. Gzip sizes used level 6; an uncompressed static server still works but transfers different sizes. OPFS is real browser storage, not a guarantee about every user's local folder or device. Synthetic handles measure traversal overhead, not disk throughput. Fake APIs were used; no real provider speed or cost improvement was established.

The earlier full baseline suite passed **440 checks**. Prototype-specific checks were 42 folder checks for each tested folder variant, 76 app checks for deferred colors, and a separate 76 app checks plus alias parity for the language loader. Those checks do not replace regression tests for the correctness findings or validation of a future implementation. Playwright used the available system Chromium rather than its pinned browser, which is another environment limitation.

Temporary experiment artifacts were stored outside the checkout at `/tmp/slop-perf-review/`: `bench.mjs`, `report.md`, `results.json`, `results-folders.json`, and `results-validation-lazy.json`. They are session-local and may not exist in a later checkout. The essential measurements and limitations are recorded here; remeasure proposed code in the implementation environment rather than assuming those artifacts will be available.

Claude should first review these findings against the current code, flag any disagreement, and present the user with the remaining design choices. Implement only the agreed scope, preserve the documented deliberate behavior, and avoid folding unrelated rewrites into a small fix.
