// The speed work stays in place: idle theme sheets, theme applied before the first paint,
// code colouring loaded on first use, rendered messages reused, search index, and
// "Delete all" during a reply.
import { openApp, send, pickModel } from '../helpers.mjs';

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
}
