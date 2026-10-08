# Tests

Browser tests for the whole app: about 90 checks covering chatting, markdown and code blocks, attachments, the model picker, chats and search, themes, folder access, the usage meter and stats, and the speed work. They run against a fake LiteLLM, so no real server or API key is needed, and take about 30 seconds.

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

Run one suite with `npm test -- stats` (suites: `app`, `folder`, `stats`, `speed`).

Each check prints `PASS` or `FAIL`; the command exits with an error if anything failed.

## What's here

```
run.mjs        starts the servers, runs every suite, prints the results
servers.mjs    a small web server for the app and the fake LiteLLM (Node built-ins only)
helpers.mjs    shared steps: open the app connected to the fake LiteLLM, send a message, pick a model
suites/        app.mjs, folder.mjs, stats.mjs, speed.mjs
```

The only dependency is Playwright (it drives a real Chromium), pinned to one exact version in `package.json`. It never needs updating unless you want to. If you change the version, change the Docker image tag above to match.

When you change a feature on purpose, a check may need its expected text updated. The check's name says what it tests, and each suite reads top to bottom like a script of clicks.
