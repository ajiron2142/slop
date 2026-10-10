// The reply's tree (optional add-on to activity): beside the opened steps, where the reply went, one
// ring per call, a badge for failures; what's happening now stands out while it runs; pointing,
// clicking or tapping picks out a box or step and fades the rest. Uses a folder and a paste.
import { openApp, idle } from '../helpers.mjs';

const LOG = Array.from({ length: 1200 }, (_, i) => (i === 600 ? `line ${i + 1} ERROR database timeout` : `line ${i + 1} INFO all good`)).join('\n');
const fakePicker = async () => {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('proj', { create: true });
  const w = await (await dir.getFileHandle('README.md', { create: true })).createWritable();
  await w.write('# Proj');
  await w.close();
  return dir;
};

export default async function ({ browser, site, mock, check }) {
  const { page: p, context, errors } = await openApp({ browser, site, mock }, { init: `window.showDirectoryPicker = ${fakePicker};` });
  const reply = '.msg.assistant:last-of-type';
  const box = (id) => `${reply} .flow-box[data-flow-box="${id}"]`;
  const has = (sel, cls) => p.$eval(sel, (e, c) => e.classList.contains(c), cls);
  const dimmed = () => p.$$eval(`${reply} .flow-dim`, (xs) => xs.length);

  // Nothing connected: the steps show as before, with no tree.
  await p.fill('#input', 'thinkonly: hmm');
  await p.press('#input', 'Enter');
  await idle(p);
  await p.click(`${reply} .act-head`);
  check('a reply with nothing connected has no tree', !(await has(`${reply} .activity`, 'has-flow')) && await p.isHidden(`${reply} .act-flow`));

  // A folder and a paste.
  await p.click('#attach-btn');
  await p.click('#attach-menu [data-action="folder"]');
  await p.waitForSelector('.tray-chip.folder');
  await p.evaluate((text) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    document.getElementById('input').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, LOG);
  await p.fill('#input', 'flow: look around');
  await p.press('#input', 'Enter');

  // While the model works on its second round, it's what stands out.
  await p.waitForFunction(() => document.querySelector('.msg.assistant:last-of-type .act-head .act-name')?.textContent.startsWith('Waiting'));
  await p.waitForFunction(() => document.querySelectorAll('.msg.assistant:last-of-type .act-step').length >= 3);
  await p.click(`${reply} .act-head`);
  check('opened, the tree sits beside the steps', await p.isVisible(`${reply} .act-flow`) && (await p.locator(`${reply} .act-flow`).boundingBox()).x > (await p.locator(`${reply} .act-step >> nth=0`).boundingBox()).x + 200);
  check('while the model is asked again, its box is the one running', await has(box('model'), 'on'));
  check('and everything else is faded, its thinking step left as it is', await has(box('folder'), 'flow-dim') && await has(box('paste'), 'flow-dim') && !(await has(`${reply} .act-step >> nth=0`, 'flow-dim')) && await has(`${reply} .act-step >> nth=1`, 'flow-dim'));
  check('the line to it doesn\'t move; only a place in use gets a moving line', (await p.$$(`${reply} .flow-wires path.on`)).length === 0);
  check('the tree grows as it goes: the places used so far, and no reply box until it writes', (await p.$$eval(`${reply} .flow-kids .flow-kind`, (xs) => xs.map((x) => x.textContent).join(','))) === 'Folder,Pasted text');
  await idle(p);
  await p.waitForTimeout(100);

  // Done.
  const kinds = await p.$$eval(`${reply} .flow-kids .flow-kind`, (xs) => xs.map((x) => x.textContent));
  check('places come in the order first used, the reply last', kinds.join(',') === 'Folder,Pasted text,Reply');
  check('each place says what it is and which one', (await p.textContent(`${box('folder')} .flow-name`)) === 'proj' && (await p.textContent(`${box('paste')} .flow-name`)) === 'Pastes in this chat');
  check('one ring per call, the failed one red, and a badge counting failures', (await p.textContent(`${box('folder')} .flow-meta`)) === '2 calls'
    && (await p.$$eval(`${box('folder')} .flow-mk`, (xs) => xs.map((x) => x.className).join('|'))) === 'flow-mk|flow-mk bad'
    && (await p.textContent(`${box('folder')} .flow-badge`)) === '1' && (await p.textContent(`${box('paste')} .flow-badge`)) === '');
  check('the model\'s thinking is a grey ring in its box, with how long it thought', (await p.$$(`${box('model')} .flow-mk.think`)).length === 1 && /^thought \d+\.\ds$/.test(await p.textContent(`${box('model')} .flow-meta`)));
  check('the reply box says how it ended', (await p.textContent(`${box('reply')} .flow-name`)) === 'Written' && await has(box('reply'), 'done'));
  check('once done, nothing is faded and nothing moves', (await dimmed()) === 0 && (await p.$$(`${reply} .flow-wires path.on, ${reply} .flow-mk.run`)).length === 0);

  // Picking.
  await p.mouse.move(5, 5);
  await p.click(`${box('folder')} .flow-name`);
  await p.mouse.move(5, 5);
  check('clicking a place picks it: its steps stay, the rest fade', await has(box('paste'), 'flow-dim') && !(await has(box('folder'), 'flow-dim'))
    && !(await has(`${reply} .act-step >> nth=1`, 'flow-dim')) && await has(`${reply} .act-step >> nth=2`, 'flow-dim') && !(await has(`${reply} .act-step >> nth=3`, 'flow-dim')));
  await p.click(`${box('folder')} .flow-name`);
  await p.mouse.move(5, 5);
  check('clicking it again shows everything', (await dimmed()) === 0);
  await p.click(`${reply} .act-step >> nth=3`);
  await p.mouse.move(5, 5);
  check('clicking a step opens it as before and picks it: only its place and itself stay', await p.isVisible(`${reply} .act-box`) && await has(`${reply} .act-step >> nth=1`, 'flow-dim') && !(await has(`${reply} .act-step >> nth=3`, 'flow-dim')) && !(await has(box('folder'), 'flow-dim')) && await has(box('model'), 'flow-dim'));
  await p.click(`${reply} .act-flow`, { position: { x: 4, y: 4 } });
  await p.mouse.move(5, 5);
  check('clicking empty space shows everything again', (await dimmed()) === 0);
  await p.hover(`${box('paste')} .flow-mk`);
  check('pointing at a ring picks out its step while the mouse is there', await has(box('folder'), 'flow-dim') && !(await has(`${reply} .act-step >> nth=2`, 'flow-dim')));
  await p.mouse.move(5, 5);
  check('and moving away shows everything', (await dimmed()) === 0);

  // Narrow: the tree goes above the steps.
  await p.setViewportSize({ width: 560, height: 800 });
  await p.waitForTimeout(100);
  check('on a narrow screen the tree sits above the steps', (await p.locator(`${reply} .act-flow`).boundingBox()).y < (await p.locator(`${reply} .act-step >> nth=0`).boundingBox()).y);

  check('no errors in the browser console', errors.length === 0);
  if (errors.length) console.log('    ', errors.join('\n     '));
  await context.close();
}
