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
  // For search and ranged reads.
  const deploy = await dir.getDirectoryHandle('deploy', { create: true });
  await write(deploy, 'route.yaml', 'kind: Route\nspec:\n  timeout: 30s\n  host: chat.example.com\n');
  await write(deploy, 'notes.txt', 'Timeout raised in March.\n');
  await write(dir, 'package-lock.json', '{"timeout": 1}');
  await write(dir, 'logo.png', 'timeout\0\0');
  await write(dir, 'long.txt', Array.from({ length: 1500 }, (_, i) => `line ${i + 1}`).join('\n'));
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
  check('model can list files (node_modules skipped)', reply.includes('FILES[deploy/notes.txt,deploy/route.yaml,logo.png,long.txt,package-lock.json,README.md,src/app.js]'));
  check('model can read a file', reply.includes('APP[console.log("hi")]'));
  check('paths outside the folder are refused', reply.includes('paths must stay inside the folder'));
  check('text before a tool call is kept', reply.startsWith('Let me look.'));
  check('the reply shows what was read', (await p.textContent('.msg.assistant:last-of-type .tool-log')) === "Listed project · Read src/app.js · Couldn't open ../secret.txt");
  // The tools themselves, run directly against the same folder.
  const tool = (name, args) => p.evaluate(async ([name, args]) => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('project');
    return (await (await import('./app/folder.js')).runTool(root, name, JSON.stringify(args)));
  }, [name, args]);
  const found = (await tool('search_files', { query: 'timeout' })).result;
  check('search finds matches with line numbers, grouped by file', found.startsWith('2 matching lines in 2 files') && found.includes('deploy/route.yaml\n  3: timeout: 30s') && found.includes('deploy/notes.txt\n  1: Timeout raised'));
  check('search skips lockfiles, binaries and node_modules', !found.includes('package-lock') && !found.includes('logo.png') && !found.includes('junk'));
  check('search with capitals is case-sensitive', (await tool('search_files', { query: 'Timeout' })).result.startsWith('1 matching lines in 1 files'));
  check('search can use a regular expression and a pattern', (await tool('search_files', { query: 'host:\\s+\\S+example', regex: true, pattern: '*.yaml' })).result.includes('4: host: chat.example.com'));
  check('a bad regular expression is explained', (await tool('search_files', { query: '(', regex: true })).result.startsWith('Error: bad regular expression'));
  check('no matches says how many files were searched', (await tool('search_files', { query: 'nothing-here' })).result.startsWith('No matches for "nothing-here" in'));
  check('list can filter by pattern', (await tool('list_files', { pattern: '*.yaml' })).result === 'deploy/route.yaml');
  const part = await tool('read_file', { path: 'deploy/route.yaml', start_line: 3, end_line: 4 });
  check('read can return just some lines, numbered', part.result === '3\t  timeout: 30s\n4\t  host: chat.example.com\n(lines 3–4 of 4)' && part.label === 'Read deploy/route.yaml:3–4');
  const long = (await tool('read_file', { path: 'long.txt' })).result;
  check('a long file comes back in parts', long.startsWith('1\tline 1\n') && long.endsWith('(lines 1–1000 of 1500; next: start_line 1001)'));
  check('a short file comes back as is', (await tool('read_file', { path: 'README.md' })).result === '# Project');

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
