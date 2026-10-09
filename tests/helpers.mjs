// Shared steps for the suites.

// Opens the app in a fresh browser profile (empty storage) and connects it to the fake LiteLLM.
// The app's security policy only allows https connections, and the fake server is plain
// http on this machine, so the tests switch that one rule off.
export async function openApp({ browser, site, mock }, { viewport = { width: 1280, height: 800 }, init, connect = true } = {}) {
  const context = await browser.newContext({ viewport, bypassCSP: true, permissions: ['clipboard-read', 'clipboard-write'] });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // A missing config.json is normal (nginx answers 204 there; the test server answers 404).
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 400/.test(m.text()) && !m.location().url?.endsWith('/config.json')) errors.push(m.text()); });
  await page.goto(site);
  await page.waitForSelector('#settings[open]');
  if (connect) {
    await page.fill('#set-base-url', mock.url);
    await page.fill('#set-api-key', 'sk-test');
    await page.click('#save-settings');
    await page.waitForSelector('#model-picker .model:not([disabled])');
    await page.click('#close-settings');
  }
  return { page, context, errors };
}

// Waits until the reply has finished streaming.
export const idle = (page) => page.waitForFunction(() => !document.getElementById('send-btn').classList.contains('stop'), null, { timeout: 15000 });

export async function send(page, text) {
  await page.fill('#input', text);
  await page.press('#input', 'Enter');
  await idle(page);
  await page.waitForTimeout(100);
}

export async function pickModel(page, query) {
  await page.click('#model-picker .model');
  await page.keyboard.type(query);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
}

// A real 1×1 PNG, for attachment tests.
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
