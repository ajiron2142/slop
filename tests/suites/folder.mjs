// Connecting a folder to a chat (read-only): the menu, the tools loop, safety, memory per chat,
// models without tool support, and browsers without folder access.
import { openApp, send } from '../helpers.mjs';

// The browser's real folder picker can't be clicked by a test, so it is replaced with a real
// folder handle from the browser's private storage, filled with a small sample project.
const fakePicker = async () => {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('project', { create: true });
  const write = async (d, name, text) => {
    const w = await (await d.getFileHandle(name, { create: true })).createWritable();
    await w.write(text);
    await w.close();
  };
  await write(dir, 'README.md', '# Project');
  await write(await dir.getDirectoryHandle('src', { create: true }), 'app.js', 'console.log("hi")');
  await write(await dir.getDirectoryHandle('node_modules', { create: true }), 'junk.js', 'x');
  return dir;
};

export default async function ({ browser, site, mock, check }) {
  const { page: p, context, errors } = await openApp({ browser, site, mock }, { init: `window.showDirectoryPicker = ${fakePicker};` });
  const lastRequest = () => mock.requests.at(-1);

  await send(p, 'echo hello');
  check('without a folder, no tools are sent', lastRequest().hasTools === false);

  await p.click('#new-chat');
  await p.click('#attach-btn');
  check('paperclip opens the menu', await p.isVisible('#attach-menu'));
  await p.keyboard.press('Escape');
  check('Escape closes the menu', !(await p.isVisible('#attach-menu')));
  await p.click('#attach-btn');
  await p.mouse.click(700, 300);
  check('clicking elsewhere closes the menu', !(await p.isVisible('#attach-menu')));
  await p.click('#attach-btn');
  await p.click('#attach-menu [data-action="folder"]');
  await p.waitForTimeout(300);
  check('connected folder shows as a chip', (await p.textContent('#tray')).includes('project'));

  await send(p, 'folder: what is in here?');
  const reply = await p.textContent('.msg.assistant:last-of-type .body');
  check('model can list files (node_modules skipped)', reply.includes('FILES[README.md,src/app.js]'));
  check('model can read a file', reply.includes('APP[console.log("hi")]'));
  check('paths outside the folder are refused', reply.includes('paths must stay inside the folder'));
  check('text before a tool call is kept', reply.startsWith('Let me look.'));
  check('the reply shows what was read', (await p.textContent('.msg.assistant:last-of-type .tool-log')) === "Listed project · Read src/app.js · Couldn't open ../secret.txt");
  check('the system prompt mentions the folder', lastRequest().system.includes('"project"') && lastRequest().hasTools);
  check('the folder stays connected after sending', (await p.textContent('#tray')).includes('project'));

  await p.reload();
  await p.waitForSelector('#chat-list li[data-id]', { state: 'attached' });
  check('a new chat after reload has no folder', await p.isHidden('#tray'));
  await p.click('#chat-list li:first-child .chat-open');
  await p.waitForTimeout(300);
  check('the folder is remembered for its chat', (await p.textContent('#tray')).includes('project'));
  check('the "what was read" line is saved', (await p.$$('.tool-log')).length === 1);
  await send(p, 'folder: again');
  check('it works again after a reload', (await p.textContent('.msg.assistant:last-of-type .body')).includes('APP[console.log("hi")]'));

  await p.click('.tray-chip.folder .tray-remove');
  await p.waitForTimeout(200);
  check('× disconnects the folder', await p.isHidden('#tray'));
  await send(p, 'echo hello again');
  check('after disconnecting, no tools are sent', lastRequest().hasTools === false);
  await p.reload();
  await p.waitForSelector('#chat-list li[data-id]', { state: 'attached' });
  await p.click('#chat-list li:first-child .chat-open');
  await p.waitForTimeout(300);
  check('disconnecting is remembered', await p.isHidden('#tray'));
  await p.click('#chat-list li:last-child .chat-open');
  await p.waitForTimeout(300);
  check('other chats never get the folder', await p.isHidden('#tray'));

  await p.click('#new-chat');
  await p.click('#attach-btn');
  await p.click('#attach-menu [data-action="folder"]');
  await p.waitForTimeout(300);
  await send(p, 'notools please');
  const err = await p.textContent('.msg.error:last-of-type');
  check('a model without tool support gets a clear error', err.includes('UnsupportedParamsError') && err.includes('disconnect the folder'));

  const id = await p.evaluate(() => document.querySelector('#chat-list li.active').dataset.id);
  p.once('dialog', (d) => d.accept());
  await p.click('#chat-list li.active .chat-delete');
  await p.waitForTimeout(300);
  check('deleting a chat forgets its folder', await p.evaluate((id) => new Promise((res) => {
    const r = indexedDB.open('keyval-store');
    r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get(`folder:${id}`); q.onsuccess = () => res(q.result === undefined); };
  }), id));
  check('no errors in the browser console', errors.length === 0);
  if (errors.length) console.log('    ', errors.join('\n     '));
  await context.close();

  // Firefox and Safari have no folder access: the paperclip opens the file chooser directly.
  const other = await openApp({ browser, site, mock }, { connect: false, init: 'delete window.showDirectoryPicker; delete Window.prototype.showDirectoryPicker;' });
  await other.page.click('#close-settings');
  const chooser = other.page.waitForEvent('filechooser', { timeout: 2000 }).then(() => true, () => false);
  await other.page.click('#attach-btn');
  check('without folder support, the paperclip opens the file chooser', await chooser);
  check('without folder support, there is no menu', !(await other.page.isVisible('#attach-menu')));
  check('without folder support, the label says attach only', (await other.page.getAttribute('#attach-btn', 'aria-label')) === 'Attach images or text files');
  await other.context.close();
}
