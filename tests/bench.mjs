// Speed benchmark (npm run bench): the same fake LiteLLM and GitLab as the tests, with realistic network
// delays, in a real browser. Prints the median of a few runs for each measure, in ms. Not part of
// `npm test` (it measures, it doesn't pass or fail) and never deployed. Numbers vary a little by machine:
// compare before and after a change on the same one.
import { chromium } from 'playwright';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSite, startMock, startGitlab } from './servers.mjs';
import { openApp, idle } from './helpers.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const site = await startSite(ROOT); const mock = await startMock();
const browser = await chromium.launch();
const DELAY = { '/v1/models': 150, '/v2/model/info': 600, '/model/info': 600, '/key/info': 250 };
const RUNS = 5;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function slowProxy(page) {
  await page.route(`${mock.url}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ms = DELAY[path] ?? (path === '/v1/chat/completions' ? 120 : 0); // time to first byte
    if (ms) await wait(ms);
    await route.continue();
  });
}
const out = {};

// 1 · Startup: page load until a model can be picked (settings already saved).
{
  const times = []; const paints = [];
  const { page: p, context } = await openApp({ browser, site: site.url, mock });
  await slowProxy(p);
  for (let i = 0; i < RUNS; i++) {
    const t0 = Date.now();
    await p.reload();
    await p.waitForFunction(() => { const b = document.querySelector('#model-picker .model'); return b && !b.disabled && b.textContent !== 'No models'; }, null, { timeout: 15000 });
    times.push(Date.now() - t0);
    paints.push(await p.evaluate(() => Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1)));
  }
  out['startup: until a model can be picked (ms)'] = median(times);
  out['startup: first paint (ms)'] = median(paints);
  await context.close();
}

// 2 · Enter to the first word on screen (plain chat; the proxy takes 120 ms to answer).
{
  const { page: p, context } = await openApp({ browser, site: site.url, mock });
  await slowProxy(p);
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    await p.click('#new-chat');
    await p.fill('#input', 'echo hi');
    const t = await p.evaluate(() => new Promise((resolve) => {
      const t0 = performance.now();
      const obs = new MutationObserver(() => {
        const b = document.querySelector('.msg.assistant .body');
        if (b && b.textContent.trim()) { obs.disconnect(); resolve(Math.round(performance.now() - t0)); }
      });
      obs.observe(document.getElementById('messages'), { subtree: true, childList: true, characterData: true });
      document.getElementById('input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }));
    times.push(t);
    await idle(p);
  }
  out['send: Enter to first word, proxy answers in 120 ms (ms)'] = median(times);
  await context.close();
}

// 3 · One round of 10 GitLab tool calls, GitLab answering each in 250 ms.
{
  const gitlab = await startGitlab();
  const { page: p, context } = await openApp({ browser, site: site.url, mock });
  await p.click('#settings-btn');
  await p.fill('#gitlab-url', gitlab.url);
  await p.waitForSelector('#gitlab-settings .gitlab-found.ok');
  await p.fill('#gitlab-client-id', 'my-app');
  await p.waitForTimeout(300);
  await p.click('#gitlab-settings button:text-is("Connect GitLab")');
  await p.waitForFunction(() => document.querySelector('#gitlab-settings')?.textContent.includes('Connected as'));
  await p.click('#close-settings').catch(() => {});
  await p.click('#attach-btn');
  await p.click('#attach-menu [data-action="gitlab"]');
  await p.waitForSelector('dialog.gitlab-picker[open] .gitlab-project');
  await p.click('dialog.gitlab-picker .gitlab-project');
  await p.waitForSelector('.tray-chip.gitlab');
  await p.route(`${gitlab.url}/api/v4/**`, async (route) => { await wait(250); await route.continue(); });
  const times = [];
  for (let i = 0; i < 3; i++) {
    await p.fill('#input', 'gitlab: look');
    const t0 = Date.now();
    await p.press('#input', 'Enter');
    await idle(p);
    times.push(Date.now() - t0);
  }
  out['tools: a round of 10 GitLab calls at 250 ms each (ms)'] = median(times);
  await context.close();
  gitlab.close?.();
}

// 4 · Opening a long chat: 120 messages, every reply with a code block, saved, then opened.
{
  const { page: p, context } = await openApp({ browser, site: site.url, mock });
  await p.evaluate(async () => {
    const store = await import('./app/storage.js');
    const messages = [];
    for (let i = 0; i < 60; i++) {
      messages.push({ role: 'user', content: `Question ${i}: how do I retry a request?`, ts: i * 2 });
      messages.push({ role: 'assistant', content: `Here is how, step ${i}:\n\n1. Wrap the call.\n2. Back off.\n\n\`\`\`js\nasync function retry(fn, n = 3) {\n  for (let i = 0; i < n; i++) {\n    try { return await fn(); } catch (e) { if (i === n - 1) throw e; }\n    await new Promise((r) => setTimeout(r, 2 ** i * 100));\n  }\n}\n\`\`\`\n\n| Try | Wait |\n| --- | --- |\n| 1 | 100 ms |\n| 2 | 200 ms |\n\nThat **should** do it.`, ts: i * 2 + 1 });
    }
    const now = Date.now();
    await store.saveChat({ id: 'long-chat', title: 'Long chat', created: now, updated: now + 1 }, messages);
  });
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    await p.reload();
    await p.waitForSelector('#chat-list li[data-id="long-chat"]');
    const t = await p.evaluate(() => new Promise((resolve) => {
      const t0 = performance.now();
      document.querySelector('#chat-list li[data-id="long-chat"] .chat-open').click();
      const check = () => (document.querySelectorAll('#messages .msg').length === 120 ? requestAnimationFrame(() => resolve(Math.round(performance.now() - t0))) : requestAnimationFrame(check));
      check();
    }));
    times.push(t);
  }
  out['open: a chat of 120 messages with code, until shown (ms)'] = median(times);
  await context.close();
}

// 5 · Streaming a long reply: the longest the page is blocked at once, and total blocked time.
{
  const { page: p, context } = await openApp({ browser, site: site.url, mock });
  const res = [];
  for (let i = 0; i < 3; i++) {
    await p.click('#new-chat');
    await p.evaluate(() => {
      window.__long = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: 'longtask', buffered: false });
    });
    await p.fill('#input', 'show me a long reply');
    await p.press('#input', 'Enter');
    await idle(p);
    res.push(await p.evaluate(() => ({ max: Math.round(Math.max(0, ...window.__long)), total: Math.round(window.__long.reduce((a, b) => a + b, 0)), n: document.querySelector('.msg.assistant:last-of-type .body').textContent.length })));
  }
  out['stream: longest block while a long reply streams (ms)'] = median(res.map((r) => r.max));
  out['stream: total blocked time (ms)'] = median(res.map((r) => r.total));
  out['stream: reply length (chars)'] = res[0].n;
  await context.close();
}

// 6 · A connected folder of 3,000 files in 200 subfolders (the browser's own file storage).
{
  const p = await browser.newPage();
  await p.goto(site.url);
  Object.assign(out, await p.evaluate(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('big', { create: true });
    for (let d = 0; d < 200; d++) {
      const dir = await root.getDirectoryHandle(`pkg${d}`, { create: true });
      for (let f = 0; f < 15; f++) {
        const w = await (await dir.getFileHandle(`file${f}.js`, { create: true })).createWritable();
        await w.write(`// file ${d}/${f}\n${'const x = 1;\n'.repeat(40)}${d === 150 && f === 7 ? 'const needle = 1;\n' : ''}`);
        await w.close();
      }
    }
    const { runTool } = await import('./app/folder.js');
    const time = async (name, args) => { const t0 = performance.now(); await runTool(root, name, JSON.stringify(args)); return Math.round(performance.now() - t0); };
    return {
      'folder: list 3,000 files (ms)': await time('list_files', { path: 'big', pattern: '*.js' }),
      'folder: first search of 3,000 files (ms)': await time('search_files', { path: 'big', query: 'needle' }),
      'folder: search again (ms)': await time('search_files', { path: 'big', query: 'needle' }),
    };
  }));
  await p.close();
}

for (const [what, ms] of Object.entries(out)) console.log(`${String(ms).padStart(6)}  ${what}`);
await browser.close(); site.close(); mock.close();
process.exit(0);
