// Sandbox (optional add-on), phase 1: the runner on its own, with no UI yet. Code runs in a Worker
// inside a sandboxed iframe, with no network, page or storage, and is stopped after 5 seconds.
// Unlike the other suites, this one keeps the app's security policy on: the policy is what's tested.
import http from 'node:http';

export default async function ({ browser, site, check }) {
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
}
