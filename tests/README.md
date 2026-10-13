# Tests

Browser tests for the whole app: about 440 checks covering chatting, markdown and code blocks, attachments, the model picker, chats and search, themes, folder access, git, patches, smart paste, the mini window, the image viewer, sign-in (against a fake identity provider), chat titles, GitLab (against a fake GitLab), the usage meter and stats, the speed work, editing a sent message, adding to a reply while it's written, and the code sandbox (the runner with the app's real security policy on, then its menu row, chip and pictures). They run against a fake LiteLLM, so no real server or API key is needed, and take about 70 seconds.

Nothing here is part of the deployed app: the Dockerfile only copies the app's own files.

## Run them

**With Docker only** (nothing to install; uses Microsoft's Playwright image, which matches the pinned version):

```sh
docker run --rm -v "$PWD":/app -w /app mcr.microsoft.com/playwright:v1.56.1-noble sh -c "npm ci && npm test"
```

**With Node.js** (one-time setup, then `npm test` whenever you like):

```sh
npm ci
npx playwright install chromium
npm test
```

**Speed:** `npm run bench` measures startup, sending, a round of tool calls, opening a long chat, streaming and folder search against the same fake servers with realistic network delays, and prints milliseconds. It isn't part of `npm test`; run it before and after a change meant to make something faster.

It prints one line per suite and only the checks that fail; `npm test -- --all` prints every check. Run one suite with `npm test -- stats` (suites: `app`, `edit`, `folder`, `git`, `paste`, `patch`, `activity`, `flow`, `sandbox`, `mini`, `viewer`, `signin`, `titles`, `gitlab`, `stats`, `speed`).

The `git` suite builds a small sample repository with the `git` command, so git needs to be installed (it fails with a clear message otherwise).

Each check prints `PASS` or `FAIL`; the command exits with an error if anything failed.

## What's here

```
run.mjs        starts the servers, runs every suite, prints the results
servers.mjs    a small web server for the app and the fake LiteLLM (Node built-ins only)
helpers.mjs    shared steps: open the app connected to the fake LiteLLM, send a message, pick a model
suites/        app.mjs, edit.mjs, folder.mjs, git.mjs, paste.mjs, patch.mjs, activity.mjs, flow.mjs, sandbox.mjs, mini.mjs, viewer.mjs, signin.mjs, titles.mjs, gitlab.mjs, stats.mjs, speed.mjs
```

The only dependency is Playwright (it drives a real Chromium), pinned to one exact version in `package.json`. It never needs updating unless you want to. If you change the version, change the Docker image tag above to match.

When you change a feature on purpose, a check may need its expected text updated. The check's name says what it tests, and each suite reads top to bottom like a script of clicks.
