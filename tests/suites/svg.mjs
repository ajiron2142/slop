// SVG pictures (optional add-on): a ```svg block in a finished reply shows as an image, in any chat;
// nothing in it runs; one that breaks the rule stays code, with a note; Image | SVG tabs and one Copy
// for what's shown; Copy reply keeps the SVG; the model gets a short line instead of the SVG.
import { openApp, send } from '../helpers.mjs';

export default async function ({ browser, site, mock, check }) {
  const { page: p, context, errors } = await openApp({ browser, site, mock });
  const reply = '.msg.assistant:last-of-type';

  await send(p, 'svgblock please');
  const asked = mock.requests.at(-1);
  check('the model is told in one line, and offered no tools (no sandbox needed)', asked.system.includes('A ```svg code block in your reply is shown to the user as a picture, on white. Write & as &amp;') && !asked.hasTools);
  const imgs = await p.$$eval(`${reply} .picture img`, (list) => list.map((i) => [i.src.slice(0, 26), i.alt, i.classList.contains('fill')]));
  check('a valid ```svg block shows as an image, its title as the alt text (else "Picture N"); an & in a comment or CDATA is fine', imgs.length === 3 && imgs[2][1] === 'Fine' && imgs.every(([src]) => src === 'data:image/svg+xml;base64,')
    && imgs[0][1] === 'Flow' && imgs[1][1] === 'Picture 2' && !imgs[0][2] && imgs[1][2]);
  check('nothing inside it runs, and it\'s never part of the page', await p.evaluate((sel) => window.__svgx === undefined && !document.querySelector(`${sel} .body svg:not(.icon), ${sel} .body script`), reply));
  const notes = await p.$$eval(`${reply} .svg-note`, (list) => list.map((n) => n.textContent));
  check('one that breaks the rule stays a code block, with a note saying why', notes.length === 4 && (await p.$$(`${reply} .code`)).length === 4
    && notes[0].includes('isn\'t well-formed') && notes[1].includes('xmlns="http://www.w3.org/2000/svg"') && /211 KB, and a picture can be at most 200 KB/.test(notes[2]) && notes[3] === 'Not shown as a picture: it has a bare & (an & must be written &amp;).');

  const first = `${reply} .picture >> nth=0`;
  await p.click(`${first} >> [role=tab]:text-is("SVG")`);
  check('the SVG tab shows the source in place of the image', (await p.isHidden(`${first} >> .picture-paper`)) && (await p.textContent(`${first} >> .picture-source`)).startsWith('<svg xmlns'));
  await p.click(`${first} >> .picture-copy`);
  check('Copy on the SVG tab copies the SVG text', (await p.evaluate(() => navigator.clipboard.readText())).includes('<title>Flow</title>'));
  await p.click(`${first} >> [role=tab]:text-is("Image")`);
  await p.click(`${first} >> .picture-copy`);
  await p.waitForTimeout(300);
  check('Copy on the Image tab copies a PNG', (await p.textContent(`${first} >> .picture-copy`)) === 'Copied' && await p.evaluate(async () => (await navigator.clipboard.read())[0].types.includes('image/png')));

  await p.click(`${reply} .copy-reply`);
  await p.waitForTimeout(300);
  const copied = await p.evaluate(async () => { const [item] = await navigator.clipboard.read(); return { text: await (await item.getType('text/plain')).text(), html: await (await item.getType('text/html')).text() }; });
  check('Copy reply keeps the SVG in the text', copied.text.includes('```svg\n<svg xmlns="http://www.w3.org/2000/svg" width="120"'));
  check('and its formatted copy (Outlook, Teams) has each picture as a PNG, a broken one as code', (copied.html.match(/<img src="data:image\/png;base64,/g) ?? []).length === 3
    && copied.html.includes('alt="Flow"') && !copied.html.includes('svg+xml') && copied.html.includes('&lt;rect&gt;&lt;/svg&gt;'));

  await send(p, 'echo and then');
  const sent = mock.requests.at(-1).sent;
  check('the model gets a short line for each picture shown, not the SVG', sent.includes('[Picture 1: Flow (an SVG shown to the user; left out here)]') && sent.includes('[Picture 2: Picture 2') && !sent.includes('fill=\\"#29335c\\"'));
  check('a broken one still goes back, so the model can fix it', sent.includes('<rect></svg>'));
  // With the sandbox add-on (remove this part with it): a ```svg block the same as a picture shown
  // under the reply isn't shown twice.
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20"/></svg>';
  await p.click('#new-chat');
  await p.click('#attach-btn');
  await p.click('#attach-menu [data-action="sandbox"]');
  await p.keyboard.press('Escape');
  await send(p, `sandboxdup:show('${SVG}')`);
  check('a ```svg block the same as a sandbox picture under the reply isn\'t shown twice', (await p.$$(`${reply} .picture`)).length === 1 && (await p.$$(`${reply} .body .code`)).length === 0);
  check('no errors in the browser console', errors.length === 0);
  if (errors.length) console.log('    ', errors.join('\n     '));
  await context.close();
}
