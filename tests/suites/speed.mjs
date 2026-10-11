// The speed work stays in place: idle theme sheets, theme applied before the first paint,
// code colouring loaded on first use, rendered messages reused, search index, and
// "Delete all" during a reply.
import { openApp, send, pickModel, idle } from '../helpers.mjs';

export default async function ({ browser, site, mock, check }) {
  const { page: p, context, errors } = await openApp({ browser, site, mock }, { connect: false });
  const requests = [];
  p.on('request', (r) => requests.push(r.url()));
  check('no theme stylesheet is switched on by default', await p.evaluate(() => [...document.querySelectorAll('link[data-theme]')].every((l) => l.media === 'not all')));
  check('code colouring is not loaded at start', !requests.some((u) => u.includes('vendor/highlight')));

  await p.fill('#set-base-url', mock.url);
  await p.fill('#set-api-key', 'sk-test');
  await p.click('#save-settings');
  await p.waitForSelector('#model-picker .model:not([disabled])');
  await p.click('#theme-picker .model');
  await p.keyboard.type('monokai');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(200);
  check('picking a theme switches on only its stylesheet', await p.evaluate(() => [...document.querySelectorAll('link[data-theme]')].filter((l) => l.media === 'all').map((l) => l.dataset.theme).join() === 'monokai'));
  check('the theme actually styles the page', await p.evaluate(() => getComputedStyle(document.getElementById('chat')).backgroundColor === 'rgb(40, 44, 52)'));
  await p.click('#close-settings');

  await send(p, 'show me code');
  await p.waitForFunction(() => document.querySelectorAll('.body pre [class^="hljs-"]').length > 20);
  check('code colouring loads with the first code block', requests.some((u) => u.includes('vendor/highlight/core')));

  await p.evaluate(() => { document.querySelector('.msg.assistant').marked = true; });
  await pickModel(p, 'gpt-4o');
  check('existing replies are reused, not rebuilt, on re-render', await p.evaluate(() => document.querySelector('.msg.assistant').marked === true));

  await send(p, 'echo searchable-needle');
  await p.fill('#search', 'searchable-needle');
  await p.waitForTimeout(400);
  check('search finds text from the newest reply', (await p.$$('#chat-list li[data-id]')).length === 1);
  await p.fill('#search', '');
  await p.waitForTimeout(400);

  // With the app script held back, the saved theme and sidebar must already be in place.
  await p.click('#collapse-btn');
  await p.waitForTimeout(150);
  await p.route('**/app/main.js', async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
  await p.reload({ waitUntil: 'domcontentloaded' });
  const early = await p.evaluate(() => ({
    theme: document.getElementById('chat').classList.contains('theme-monokai'),
    sheet: document.querySelector('link[data-theme="monokai"]').media,
    collapsed: document.getElementById('app').classList.contains('collapsed'),
  }));
  check('the saved theme shows before the app script runs', early.theme && early.sheet === 'all');
  check('the collapsed sidebar shows before the app script runs', early.collapsed);
  await p.unroute('**/app/main.js');
  await p.waitForSelector('#chat-list li[data-id]', { state: 'attached' });

  // Deleting everything while a reply is still streaming: the chat must not come back.
  await p.click('#collapse-btn');
  await p.waitForTimeout(150);
  await p.click('#chat-list li:first-child .chat-open');
  await p.waitForTimeout(200);
  await p.fill('#input', 'show me a long reply');
  await p.press('#input', 'Enter');
  await p.waitForTimeout(150);
  p.once('dialog', (d) => d.accept());
  await p.click('#settings-btn');
  await p.click('#delete-all');
  await p.waitForTimeout(1500);
  check('"Delete all" during a reply leaves no chats behind', (await p.textContent('#chat-list')).includes('No chats yet'));
  check('"Delete all" resets the theme and sidebar', await p.evaluate(() => !document.getElementById('chat').className.includes('theme-') && !document.getElementById('app').classList.contains('collapsed')));
  check('no errors in the browser console', errors.length === 0);
  if (errors.length) console.log('    ', errors.join('\n     '));
  await context.close();

  await quickStart({ browser, site, mock, check });
}

// The model list shows at once from last time, and the slow model-info request never holds it up.
async function quickStart({ browser, site, mock, check }) {
  const { page: p, context, errors } = await openApp({ browser, site, mock });
  const slow = (path, ms) => p.route(`${mock.url}${path}`, async (route) => { await new Promise((r) => setTimeout(r, ms)); await route.continue(); });
  await slow('/v1/models', 1500);
  await slow('/v2/model/info', 1500);
  const t0 = Date.now();
  await p.reload();
  await p.waitForFunction(() => { const b = document.querySelector('#model-picker .model'); return b && !b.disabled && b.textContent !== 'No models'; });
  check('the models from last time show at once, before the proxy answers', Date.now() - t0 < 1000);
  await p.unroute(`${mock.url}/v1/models`);
  await p.reload();
  const t1 = Date.now();
  await p.waitForFunction(() => { const b = document.querySelector('#model-picker .model'); return b && !b.disabled; });
  check('a slow model-info request doesn\'t hold up the list', Date.now() - t1 < 1000);
  await p.fill('#input', 'echo early');
  await p.press('#input', 'Enter');
  await idle(p);
  check('a reply sent before the model info arrives still asks for the model\'s full output limit', mock.requests.at(-1).maxTokens === 8192);

  // A model saved last time that the proxy no longer lists: a message sent before the list arrives
  // waits for it, and goes to a model that's still there.
  await p.evaluate(async () => {
    const store = await import('./app/storage.js');
    const s = await store.loadSettings();
    await store.saveSettings({ ...s, model: 'gone-model', knownModels: ['gone-model', ...s.knownModels] });
  });
  await slow('/v1/models', 800);
  await p.reload();
  await p.waitForFunction(() => document.querySelector('#model-picker .model')?.textContent === 'gone-model');
  await p.fill('#input', 'echo quick');
  await p.press('#input', 'Enter');
  await idle(p);
  check('a message sent before the list arrives waits for it, and never goes to a model the proxy dropped', mock.requests.at(-1).model !== 'gone-model' && (await p.textContent('#model-picker .model')) !== 'gone-model');
  await p.unroute(`${mock.url}/v1/models`);

  // A list saved from another proxy isn't shown for this one.
  await p.evaluate(async () => {
    const store = await import('./app/storage.js');
    const s = await store.loadSettings();
    await store.saveSettings({ ...s, knownModels: ['other-proxy-model'], knownModelsFrom: 'https://other.example' });
  });
  await slow('/v1/models', 800);
  await p.reload();
  await p.waitForTimeout(300);
  check('a list saved from another proxy isn\'t shown for this one', (await p.textContent('#model-picker .model')) !== 'other-proxy-model');
  await p.unroute(`${mock.url}/v1/models`);

  // The next load starts connecting to the proxy before the app has loaded (https only).
  check('the proxy\'s address is kept for the next load', await p.evaluate((origin) => JSON.parse(localStorage.getItem('chat-boot')).proxy === origin, new URL(mock.url).origin));
  await p.evaluate(() => localStorage.setItem('chat-boot', JSON.stringify({ ...JSON.parse(localStorage.getItem('chat-boot')), proxy: 'https://litellm.example.com' })));
  await p.route('**/app/main.js', (route) => route.fulfill({ contentType: 'text/javascript', body: '' })); // only boot.js runs
  await p.reload({ waitUntil: 'domcontentloaded' });
  check('an https proxy is connected to while the page loads', await p.evaluate(() => document.querySelector('link[rel="preconnect"]')?.href === 'https://litellm.example.com/'));
  await p.unroute('**/app/main.js');

  // Typing re-warms the connection to an https proxy, at most once every 30 seconds.
  await p.goto('about:blank');
  await p.goto(site);
  await p.waitForSelector('#composer');
  await p.evaluate(async () => {
    const store = await import('./app/storage.js');
    await store.saveSettings({ ...(await store.loadSettings()), baseUrl: 'https://litellm.example.com' });
  });
  await p.route('https://litellm.example.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }));
  await p.reload();
  await p.waitForTimeout(300);
  if (await p.isVisible('#settings[open]')) await p.click('#close-settings');
  check('nothing is warmed before you type', !(await p.$('link[data-warm]')));
  await p.type('#input', 'h');
  const first = await p.$eval('link[data-warm]', (l) => { l.marked = true; return l.href; });
  await p.type('#input', 'ello');
  check('typing re-warms the connection to the proxy, once, without sending anything', first === 'https://litellm.example.com/'
    && (await p.$$('link[data-warm]')).length === 1 && await p.$eval('link[data-warm]', (l) => l.marked === true));
  if (errors.length) console.log('    ', errors.join('\n     '));
  await context.close();
}
