# slop: project rules

A lean, static chat UI for a LiteLLM proxy. These are the musts. Read them before changing anything.

## Product

- **Small and simple.** Add a feature only if it brings a lot of value. Prefer removing to adding.
- **No backend.** Everything runs in the browser from static files (nginx serves them). No server code, no storage service.
- **Ephemeral.** Keep only what must be kept (chats, settings). Pastes and a reply's activity live in memory and are gone after a reload.
- **Read-only, everywhere.** slop never writes files or changes anything elsewhere. Changes are suggested as git patches the user reviews and applies themselves.
- **Connections are optional and self-service.** The core app works on its own with just a LiteLLM URL and key. Anything that connects elsewhere (sign-in, GitLab, …) is opt-in, set up by each person for themselves, read-only where possible, and needs no one to manage it.
- **Ask before anything heavy or anything that changes how the app works.** Show a mockup (an artifact that also works on a phone, plus a desktop screenshot) before design changes.
- **No emojis in the UI.** Text symbols like ⓘ ⇡ ⇣ ↶ are fine.

## Code

- **Deterministic rules, never guesses.** Logic follows fixed, stated rules: the same input always gives the same result, and the user can predict it. Don't infer intent from wording, don't add "if it looks like X, assume Y" fallbacks, don't silently fix up bad input. If input breaks a rule, refuse it with a message that shows the right form. Examples:
  - Paths between the app and the model always start with the folder's name (`test/src/app.js`); anything else is refused.
  - The context limit comes only from LiteLLM's `max_input_tokens`; prices only from `input_cost_per_token` and `output_cost_per_token` (0 is free). A missing value is shown as unknown.
  - What the folder tools leave out comes only from the folder's `.gitignore` files; no built-in skip lists.
  - Thresholds are fixed numbers (a paste over 500 lines or 40,000 characters becomes a chip).
- **Modular, like Legos.** Each optional feature lives in its own files and plugs in through small hooks marked with a comment (`// git`, `// patch`, `// smart paste`, `// mini window`, `// image viewer`, `// sign-in`, `// chat titles`, `// gitlab`, `// activity`, `// flow`, `// sandbox`). Its header says exactly how to remove it. Removing one must never touch the others.
- **No dependencies.** Plain ES modules, no build step. The only libraries are vendored in `vendor/` (see its README), and new ones need a very good reason.
- **Components** are a `.js` + `.css` pair with the same name. Components use theme tokens, never fixed colours; themes only set tokens and overrides, never layout.
- **One mark for "chosen" or "on"**: the name in a `.mark` span turns semibold with a thin line drawn under it (`base.css`, same speed everywhere). Where you are (the open chat) is a tinted row instead.
- **Match the surrounding code**: its comment density, naming and idiom.

## Checks

- `npm test` runs every browser suite against a fake LiteLLM (`npm test -- <suite>` for one; it prints only failures, `-- --all` prints every check). Every feature has a suite; add checks with each change and keep them all passing.
- **Speed claims use numbers:** `npm run bench` before and after.
- **Tests are Legos too.** Each add-on's checks live in its own suite (`tests/suites/<add-on>.mjs`), removed along with it; a core suite never touches an add-on, while an add-on's suite may rely on the core.
- **Check rules, not looks.** A check earns its place when it guards a rule or behaviour we'd hate to lose (paths outside the folder are refused, pictures never go back to the model). Avoid pinning details that may change on purpose; keep timing limits generous so they don't flake. Extra checks in an existing scenario are nearly free; a new scenario (reload, connect, wait for a reply) costs seconds per run.
- Look at the real UI (screenshots at desktop size) after visual changes, in more than one theme.
