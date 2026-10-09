# slop: project rules

A lean, static chat UI for a LiteLLM proxy. These are the musts. Read them before changing anything.

## Product

- **Small and simple.** Add a feature only if it brings a lot of value. Prefer removing to adding.
- **No backend.** Everything runs in the browser from static files (nginx serves them). No server code, no storage service.
- **Ephemeral.** Keep only what must be kept (chats, settings). Review state, pastes, edit access and Undo live in memory and are gone after a reload.
- **Ask before anything heavy or anything that changes how the app works.** Show a mockup (an artifact that also works on a phone, plus a desktop screenshot) before design changes.
- **No emojis in the UI.** Text symbols like ⓘ ⇡ ⇣ ↶ are fine.

## Code

- **Deterministic rules, never guesses.** Logic follows fixed, stated rules: the same input always gives the same result, and the user can predict it. Don't infer intent from wording, don't add "if it looks like X, assume Y" fallbacks, don't silently fix up bad input. If input breaks a rule, refuse it with a message that shows the right form. Examples:
  - Paths between the app and the model always start with the folder's name (`test/src/app.js`); anything else is refused.
  - The context limit comes only from LiteLLM's `max_input_tokens`; without it the limit is shown as unknown.
  - Thresholds are fixed numbers (a paste over 500 lines or 40,000 characters becomes a chip).
- **Modular, like Legos.** Each optional feature lives in its own files and plugs in through small hooks marked with a comment (`// write mode`, `// git`, `// smart paste`, `// mini window`). Its header says exactly how to remove it. Removing one must never touch the others.
- **No dependencies.** Plain ES modules, no build step. The only libraries are vendored in `vendor/` (see its README), and new ones need a very good reason.
- **Components** are a `.js` + `.css` pair with the same name. Components use theme tokens, never fixed colours; themes only set tokens and overrides, never layout.
- **Match the surrounding code**: its comment density, naming and idiom.

## Checks

- `npm test` runs every browser suite against a fake LiteLLM (`npm test -- <suite>` for one). Every feature has a suite; add checks with each change and keep them all passing.
- Look at the real UI (screenshots at desktop size) after visual changes, in more than one theme.
