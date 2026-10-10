// Sandbox (optional add-on). First the runner on its own: code runs in a Worker inside a sandboxed
// iframe, with no network, page or storage, and is stopped after 5 seconds. That part keeps the app's
// security policy on: the policy is what's tested. Then the app: the + menu's Sandbox row, the chip,
// run_js offered only while it's on, pictures in the reply, Copy SVG and Copy reply.
import http from 'node:http';
import { openApp, idle, stepsLine } from '../helpers.mjs';

export default async function ({ browser, site, mock, check }) {
  // A server the code tries to reach. Nothing should ever arrive here.
  const hits = [];
  const spy = http.createServer((req, res) => {
    hits.push(req.url);
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/javascript' }).end('1');
  });
  await new Promise((resolve) => spy.listen(0, '127.0.0.1', resolve));
  const spyUrl = `http://127.0.0.1:${spy.address().port}`;

  const context = await browser.newContext();
  const p = await context.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(site);
  const run = (code) => p.evaluate(async (code) => (await import('./app/sandbox.js')).runJs(code), code);
  const result = (run) => p.evaluate(async (run) => (await import('./app/sandbox.js')).sandboxResult(run), run);

  let r = await run('const xs = [3, 1, 2];\nconsole.log("sorted", xs.sort());\nxs.reduce((a, b) => a + b, 0) * 7');
  check('code runs and returns what it logged, then its last value', r.out === 'sorted [1,2,3]\n42' && !r.error);
  check('the model gets the output as text', (await result(r)) === 'sorted [1,2,3]\n42');
  r = await run('new Promise((resolve) => setTimeout(() => resolve(new Date(Date.UTC(2026, 9, 10)).toISOString()), 50))');
  check('a promise as the last value is waited for', r.out === '2026-10-10T00:00:00.000Z');
  r = await run('let a = 1;\nlet b = a.x.y;');
  check('an error comes back with its line', r.error === "TypeError: Cannot read properties of undefined (reading 'y') (line 2)");
  r = await run('let a = 1;\n\nlet b = (;');
  check('so does code that does not parse', r.error === "SyntaxError: Unexpected token ';' (line 3)");
  check('nothing runs before a syntax error is found', (await run('console.log("ran");\nlet b = (;')).out === '');

  // An endless loop is stopped at 5 s, and the page keeps responding meanwhile.
  const started = Date.now();
  const looping = run('console.log("before");\nwhile (true) {}');
  await p.waitForTimeout(1000);
  const t = Date.now();
  await p.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  check('the page stays responsive while code loops', Date.now() - t < 500);
  r = await looping;
  const took = Date.now() - started;
  check('an endless loop is stopped after 5 s', took >= 4900 && took < 7000 && r.error.startsWith('Stopped after 5 s'));
  check('it says how to fix it', /Keep each run under 5 s\.$/.test(r.error));
  check('output logged before it was stopped is kept', r.out === 'before\n');
  check('the sandbox still runs code afterwards', (await run('1 + 1')).out === '2');

  // No network: the sandbox's own policy forbids it.
  r = await run(`fetch('${spyUrl}/fetch').then((res) => res.status)`);
  check('fetch fails', r.error === 'TypeError: Failed to fetch (line 1)');
  r = await run(`importScripts('${spyUrl}/import'); 'imported'`);
  check('importScripts fails', /^NetworkError: .*importScripts/.test(r.error));
  await run(`new WebSocket('ws://127.0.0.1:${spy.address().port}/ws'); new EventSource('${spyUrl}/events');\n` +
    `new Worker(URL.createObjectURL(new Blob(["fetch('${spyUrl}/nested').catch(() => {})"])));\nnew Promise((resolve) => setTimeout(resolve, 300))`);
  await p.waitForTimeout(300);
  check('no request of any kind leaves the sandbox', hits.length === 0);

  // No page, cookies or storage.
  r = await run('[typeof parent, typeof document, typeof localStorage, typeof sessionStorage].join(" ")');
  check('the code sees no page, cookies or storage', r.out === 'undefined undefined undefined undefined');
  r = await run('indexedDB.open("x")');
  check('nor a database', r.error.startsWith('SecurityError'));
  const frame = p.frames().find((f) => f.url().endsWith('/sandbox/sandbox.html'));
  const inFrame = await frame.evaluate(() => ['parent.document', 'document.cookie', 'localStorage', 'sessionStorage'].map((what) => {
    try { return eval(what) === undefined ? 'blocked' : 'reachable'; } catch { return 'blocked'; }
  }));
  check('even the sandbox page itself cannot reach slop\'s page, cookies or storage', inFrame.every((x) => x === 'blocked'));
  check('and slop\'s page cannot reach into it', await p.evaluate(() => document.querySelector('iframe[sandbox="allow-scripts"]').contentDocument === null));

  // Output is cut at 20,000 characters, and the result says where.
  r = await run('for (let i = 0; i < 3000; i++) console.log("0123456789");\n"end"');
  check('output is cut at 20,000 characters', r.out.startsWith('0123456789\n') && r.out.endsWith('\n[Output cut at 20,000 of 33,003 characters.]'));
  r = await run('"x".repeat(25000)');
  check('a long last value is cut too', r.out.length === 20000 + '\n[Output cut at 20,000 of 25,000 characters.]'.length);

  // Pictures: one <svg> element each, at most 3 per run, 200 KB each.
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10"/></svg>';
  r = await run(`show('${svg}'); show('  ${svg}\\n'); 'two'`);
  check('show() passes pictures back, in order', r.pictures.length === 2 && r.pictures.every((x) => x === svg) && r.out === 'two');
  check('the model hears how many it showed', (await result(r)) === 'two\nShowed 2 pictures (1 KB, 1 KB)');
  const refused = async (code) => (await run(code)).error;
  check('show() refuses anything that isn\'t an <svg>', /^Error: show\(\) takes one SVG element as text, like show\('<svg .*starting with <svg and ending with <\/svg>\. \(line 1\)$/.test(await refused('show("<div></div>")')));
  check('show() refuses a non-string', /it got object\. \(line 1\)$/.test(await refused('show({})')));
  check('show() refuses two pictures in one', /^show\(\) takes one well-formed <svg/.test(await refused(`show('${svg}${svg}')`)));
  check('show() refuses an <svg> that isn\'t well-formed', /^show\(\) takes one well-formed <svg/.test(await refused('show("<svg><g></svg>")')));
  check('show() refuses an <svg> without the SVG namespace', /^show\(\) takes one well-formed <svg/.test(await refused('show("<svg></svg>")')));
  check('show() refuses a 4th picture', /at most 3 times per run\. \(line 1\)$/.test(await refused(`for (let i = 0; i < 4; i++) show('${svg}')`)));
  check('show() refuses a picture over 200 KB', /at most 200 KB per picture; this one is 201 KB\./.test(await refused(`show('<svg xmlns="http://www.w3.org/2000/svg"><!--' + 'x'.repeat(205000) + '--></svg>')`)));
  r = await run('postMessage({ done: true, length: 0, pictures: ["<b>not a picture</b>"], error: "" })');
  check('code that posts its own result gets no further than show()', r.pictures.length === 0 && /^show\(\) takes one SVG element/.test(r.error));

  // Helpers: charts, SVG building, markdown tables, a seeded random.
  r = await run(`show(chart.bar([['W1', 4], ['W2', 7]], { title: 'Deploys <per> week' }))`);
  check('chart.bar() makes a picture show() takes', !r.error && r.pictures.length === 1 && r.pictures[0].startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="260"') && r.pictures[0].includes('>Deploys &lt;per&gt; week</text>'));
  r = await run(`show(chart.line([['Mon', 3, 4], ['Tue', 5, 1], ['Wed', -2, 6]], { names: ['a', 'b'], width: 300 }))`);
  check('chart.line() draws one line per series, with a legend', !r.error && (r.pictures[0].match(/<polyline/g) ?? []).length === 2 && r.pictures[0].includes('>a</text>') && r.pictures[0].includes('>-2</text>'));
  check('a chart refuses rows that break the form, and shows it', /^Error: chart\.bar\(\) takes rows like \[\['Mon', 3\], \['Tue', 5\]\]/.test((await run(`chart.bar([['Mon', '3']])`)).error));
  check('and names that don\'t match the series', /needs one name per series: 1 here/.test((await run(`chart.bar([['Mon', 3]], { names: ['a', 'b'] })`)).error));
  r = await run(`svg(40, 20, el('text', { x: 2, y: 14, title: 'a"b' }, '1 < 2 & 3'))`);
  check('svg() and el() build markup, escaping text and attributes', r.out === '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" viewBox="0 0 40 20" font-family="system-ui, -apple-system, Segoe UI, sans-serif"><rect width="40" height="20" fill="#ffffff"/><text x="2" y="14" title="a&quot;b">1 &lt; 2 &amp; 3</text></svg>');
  r = await run(`table([{ Service: 'route', Deploys: 9, 'Fail | rate': '2%' }, { Service: 'auth', Deploys: 4 }])`);
  check('table() makes a markdown table', r.out === '| Service | Deploys | Fail \\| rate |\n| --- | --- | --- |\n| route | 9 | 2% |\n| auth | 4 |  |');
  r = await run('const a = random(42), b = random(42);\n[a(), a(), a()].join() === [b(), b(), b()].join() && a() !== random(43)()');
  check('random(seed) gives the same numbers for the same seed', r.out === 'true');
  check('random() refuses a seed that isn\'t a whole number', /takes a whole number as its seed, like random\(42\)/.test((await run('random(0.5)')).error));

  // A reply posted from anywhere but the iframe is ignored, even with the right id.
  await frame.evaluate(() => addEventListener('message', (e) => { window.lastJob = e.data.id; }));
  const slow = run('const end = Date.now() + 800;\nwhile (Date.now() < end) {}\n"real"');
  await p.waitForTimeout(200);
  const id = await frame.evaluate(() => window.lastJob);
  await p.evaluate((id) => {
    window.postMessage({ id, out: 'forged', pictures: [], error: '' }, '*');
    const other = document.createElement('iframe');
    other.sandbox = 'allow-scripts';
    other.src = 'sandbox/sandbox.html';
    document.body.append(other); // another copy of the sandbox, but not slop's own
    other.onload = () => other.contentWindow.postMessage({ id, code: '"forged"' }, '*');
  }, id);
  check('a reply posted from anywhere but the iframe is ignored', (await slow).out === 'real');

  // Without frame-src 'self' in slop's policy the sandbox can't load; runs then fail instead of waiting forever.
  const blocked = await browser.newContext();
  const b = await blocked.newPage();
  await b.route(`${site}/`, async (route) => {
    const res = await route.fetch();
    route.fulfill({ response: res, body: (await res.text()).replace("frame-src 'self'; ", '') });
  });
  await b.goto(site);
  r = await b.evaluate(async () => (await import('./app/sandbox.js')).runJs('1'));
  check('if the sandbox can\'t load, a run fails after 10 s', r.error === "Error: the sandbox didn't answer within 10 s.");
  await blocked.close();

  check('no errors on the page', errors.length === 0);
  await context.close();
  spy.close();

  await inTheApp({ browser, site, mock, check });
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#2e9a4f"/></svg>';

async function inTheApp({ browser, site, mock, check }) {
  const { page: p, context, errors } = await openApp({ browser, site, mock });
  const reply = '.msg.assistant:last-of-type';
  const row = '#attach-menu [data-action="sandbox"]';
  const chip = '#tray .tray-chip.sandbox';
  const ask = async (text) => { await p.fill('#input', text); await p.press('#input', 'Enter'); };
  const toolResult = () => JSON.parse(mock.requests.at(-1).sent).find((m) => m.role === 'tool')?.content;

  await p.click('#attach-btn');
  check('the + menu lists Sandbox, with an icon, switched off', await p.isVisible(row) && (await p.getAttribute(row, 'aria-checked')) === 'false' && Boolean(await p.$(`${row} svg.icon`)));
  check('every item in the menu has an icon', await p.$$eval('#attach-menu button:not([hidden])', (bs) => bs.every((b) => b.querySelector('svg.icon'))));
  await p.keyboard.press('Escape');
  await ask('hello');
  await idle(p);
  check('with the sandbox off, a chat sends no tools', !mock.requests.at(-1).hasTools);

  await p.click('#attach-btn');
  await p.click(row);
  check('tapping Sandbox switches it on and closes the menu', await p.isHidden('#attach-menu') && (await p.getAttribute(row, 'aria-checked')) === 'true');
  check('a Sandbox chip shows it\'s on', (await p.textContent(chip)) === 'Sandbox×' && Boolean(await p.$(`${chip} svg.peek`)));
  check('the chip is still while nothing runs', !(await p.$eval(chip, (c) => c.classList.contains('running'))));

  await ask(`sandbox:console.log(6 * 7);\nshow('${SVG}');\n'done'`);
  await idle(p);
  const sent = mock.requests.at(-1);
  check('with it on, run_js is offered', sent.toolNames.includes('run_js'));
  check('the model gets the output and how many pictures it showed', toolResult() === '42\ndone\nShowed 1 picture (1 KB)');
  check('its step says it ran code', (await stepsLine(p)) === 'Ran code');
  check('the picture shows under the reply\'s text, in a block like a code block', await p.$eval(reply, (m) => {
    const pic = m.querySelector('.pictures .picture');
    return Boolean(pic) && m.querySelector('.body').compareDocumentPosition(pic) & Node.DOCUMENT_POSITION_FOLLOWING
      && pic.querySelector('.picture-head').textContent === 'Picture 1 · SVGCopy SVG';
  }));
  check('as an image, so nothing inside it can run', await p.$eval(`${reply} .picture img`, (img, svg) => img.src === `data:image/svg+xml;base64,${btoa(svg)}` && img.naturalWidth === 120, SVG));
  await p.click(`${reply} .act-head`);
  check('the picture sits on white, as drawn', (await p.$eval(`${reply} .picture-paper`, (e) => getComputedStyle(e).backgroundColor)) === 'rgb(255, 255, 255)');
  check('the model is told pictures show on white', await p.evaluate(async () => (await import('./app/sandbox.js')).SANDBOX_TOOLS[0].function.description.includes('on a white background')));
  check('the reply tree shows the Sandbox as a place', await p.isVisible(`${reply} .flow-box[data-flow-box="sandbox"]`));

  await p.click(`${reply} .picture-copy`);
  check('Copy SVG copies the SVG text', (await p.evaluate(() => navigator.clipboard.readText())) === SVG && (await p.textContent(`${reply} .picture-copy`)) === 'Copied');
  await p.click(`${reply} .copy-reply`);
  await p.waitForTimeout(200);
  const copied = await p.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return { text: await (await item.getType('text/plain')).text(), html: await (await item.getType('text/html')).text() };
  });
  const b64 = Buffer.from(SVG).toString('base64');
  check('Copy reply: the text, a line per picture, the picture at the very bottom', copied.text.endsWith(`]\n\n![Picture 1][picture-1]\n\n[picture-1]: data:image/svg+xml;base64,${b64}`) && copied.text.startsWith('Let me work it out.'));
  check('the formatted copy carries it as a PNG, for Outlook and Teams, at its own size', /<img src="data:image\/png;base64,[^"]+" alt="Picture 1" width="120" height="60">/.test(copied.html) && !copied.html.includes('svg+xml'));

  await ask('sandbox:"again"');
  await idle(p);
  check('pictures are never sent back to the model', !mock.requests.at(-1).sent.includes('image/svg+xml') && !mock.requests.at(-1).sent.includes('Picture 1'));

  // While code runs, the chip's box peeks out; it's still again once it's done.
  await ask('sandbox:const end = Date.now() + 1500;\nwhile (Date.now() < end) {}\n"slow"');
  await p.waitForSelector(`${chip}.running`, { timeout: 5000 });
  check('while code runs, the chip peeks', (await p.$eval(`${chip} .peek-lid`, (l) => getComputedStyle(l).animationName)) === 'peek-lid');
  await idle(p);
  check('and is still again once it\'s done', !(await p.$eval(chip, (c) => c.classList.contains('running'))));

  await ask('sandbox:let a = 1;\na.b.c');
  await idle(p);
  check('code that fails is a failed step', (await stepsLine(p)) === 'Ran code (failed)' && (await p.textContent(`${reply} .act-step .act-mark`)) === '✕');
  check('and the model hears the error', toolResult() === "Error: the run failed.\nTypeError: Cannot read properties of undefined (reading 'c') (line 2)");

  // Saved with the chat: reopening it brings back the chip and the pictures.
  await p.reload();
  await p.click('#chat-list li:first-child .chat-open');
  await p.waitForSelector('.msg.assistant');
  check('the sandbox stays on for the chat after a reload', await p.isVisible(chip));
  check('and its pictures are still there', (await p.$$('.msg.assistant .picture img')).length === 1);

  await p.click(`${chip} .tray-remove`);
  check('the chip\'s × switches it off', await p.isHidden(chip) && (await p.getAttribute(row, 'aria-checked')) === 'false');
  await ask('hello again');
  await idle(p);
  check('and run_js is no longer offered', !mock.requests.at(-1).hasTools);

  await p.click('#attach-btn');
  await p.click(row);
  await p.click('#new-chat');
  check('a new chat starts with the sandbox off', await p.isHidden(chip));

  // Reduced motion: no movement; while running, the lid stays open a crack with the eyes looking out.
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.click('#attach-btn');
  await p.click(row);
  await p.evaluate(() => document.querySelector('#tray .tray-chip.sandbox').classList.add('running'));
  check('with reduce motion on, a running chip doesn\'t move but peeks', await p.$eval(chip, (c) => getComputedStyle(c.querySelector('.peek-lid')).animationName === 'none' && getComputedStyle(c.querySelector('.peek-eyes')).opacity === '1'));

  check('no errors on the page', errors.length === 0);
  if (errors.length) console.log('    ', errors.join('\n     '));
  await context.close();
}
