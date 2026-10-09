// Write mode (optional add-on): connecting a folder for editing, reviewing changes in the side
// panel, Apply / Skip / Apply all remaining, Undo for the latest reply, and what stays read-only.
import { openApp, idle } from '../helpers.mjs';

// A real folder from the browser's private storage, standing in for the folder picker.
const fakePicker = async () => {
  const root = await navigator.storage.getDirectory();
  await root.removeEntry('wproject', { recursive: true }).catch(() => {});
  const dir = await root.getDirectoryHandle('wproject', { create: true });
  const src = await dir.getDirectoryHandle('src', { create: true });
  const w = await (await src.getFileHandle('app.js', { create: true })).createWritable();
  await w.write('console.log("hi")');
  await w.close();
  return dir;
};

export default async function ({ browser, site, mock, check }) {
  const { page: p, context, errors } = await openApp({ browser, site, mock }, { init: `window.showDirectoryPicker = ${fakePicker};` });
  const file = (path) => p.evaluate(async (path) => {
    let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('wproject');
    const parts = path.split('/');
    const name = parts.pop();
    try {
      for (const part of parts) dir = await dir.getDirectoryHandle(part);
      return await (await (await dir.getFileHandle(name)).getFile()).text();
    } catch { return null; }
  }, path);
  const ask = async (text) => {
    await p.fill('#input', text);
    await p.press('#input', 'Enter');
  };
  const waiting = () => p.waitForSelector('#panel:not([hidden]) .change-status.waiting');
  const footButton = (label) => p.click(`#panel .panel-foot button:text-is("${label}")`);

  await p.click('#attach-btn');
  await p.click('#attach-menu [data-action="folder-edit"]');
  await p.waitForTimeout(200);
  check('the folder chip says it can edit', (await p.textContent('.tray-chip.folder')).includes('can edit'));

  // A reply with two changes: apply the first, skip the second; its third call can't match.
  await ask('edit please');
  await waiting();
  const sent = mock.requests.at(-1);
  check('edit mode sends the write tools and says how to use them', sent.toolNames.includes('edit_file') && sent.toolNames.includes('write_file') && sent.system.includes('change files'));
  check('the model is told to use the tools, not ask first, and where paths start', sent.system.includes("don't ask in the chat first") && sent.system.includes('not "wproject/src/app.js"'));
  check('the side panel opens with the change to review', (await p.textContent('#panel .panel-title')) === 'Changes · this reply' && (await p.textContent('#panel .diff')).includes('+ console.log("hello")'));
  check('the chat says what is waiting', (await p.textContent('.write-log')).includes('Waiting for you: src/app.js'));
  check('nothing is written before you choose', (await file('src/app.js')) === 'console.log("hi")');
  await footButton('Apply');
  await p.waitForSelector('#panel .change:nth-child(2) .change-status.waiting');
  check('the next change shows a new file', (await p.textContent('#panel .diff')).includes('+ fresh'));
  await footButton('Skip');
  await idle(p);
  const reply = await p.textContent('.msg.assistant:last-of-type .body');
  check('the model hears what was applied, skipped and refused', reply.includes('EDIT[Applied the change to src/app.js.]') && reply.includes('CREATE[The user skipped this change') && reply.includes("BAD[Error: old_text wasn't found in src/app.js"));
  check('applied changes are written', (await file('src/app.js')) === 'console.log("hello")');
  check('skipped changes are not', (await file('notes/new.txt')) === null && (await file('wproject/notes/new.txt')) === null);
  check('the reply lists what happened', (await p.textContent('.msg.assistant:last-of-type .tool-log')) === "Edited src/app.js (+1 −1) · Skipped notes/new.txt · Couldn't change src/app.js");
  check('the reply offers Undo', (await p.textContent('.write-log')).includes('1 file changed') && (await p.isVisible('#panel .panel-foot button:text-is("↶ Undo this reply")')));

  await p.click('.write-log button:text-is("↶ Undo")');
  await p.waitForTimeout(200);
  check('Undo puts the file back', (await file('src/app.js')) === 'console.log("hi")');
  check('the chat says the changes were undone', (await p.textContent('.write-log')).includes('Changes undone'));

  // Apply all remaining, then Undo from the panel: the new file goes away too.
  await ask('edit again');
  await waiting();
  await footButton('Apply all remaining');
  await idle(p);
  check('Apply all remaining applies the rest without asking', (await file('src/app.js')) === 'console.log("hello")' && (await file('notes/new.txt')) === 'fresh\n');
  check('the panel shows each file and what happened to it', (await p.textContent('#panel .changes')).includes('applied') && (await p.textContent('#panel .changes')).includes('created'));
  check('a final newline is not counted as an extra line', (await p.textContent('#panel .change:nth-child(2) .change-counts')) === '+1');
  await p.click('#panel .change:nth-child(1)');
  check('picking a file shows its diff', (await p.textContent('#panel .change-title')) === 'src/app.js');
  await footButton('↶ Undo this reply');
  await p.waitForTimeout(200);
  check('Undo removes files the reply created', (await file('notes/new.txt')) === null && (await file('src/app.js')) === 'console.log("hi")');

  // Undo asks before overwriting a file you changed yourself.
  await ask('edit third');
  await waiting();
  await footButton('Apply all remaining');
  await idle(p);
  await p.evaluate(async () => {
    const src = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('wproject')).getDirectoryHandle('src');
    const w = await (await src.getFileHandle('app.js')).createWritable();
    await w.write('my own edit');
    await w.close();
  });
  let question = '';
  p.once('dialog', (d) => { question = d.message(); d.dismiss(); });
  await p.click('.write-log button:text-is("↶ Undo")');
  await p.waitForTimeout(200);
  check('Undo asks before losing your own edits', question.includes('src/app.js') && (await file('src/app.js')) === 'my own edit');

  // Undo is only for the latest reply.
  await ask('echo hello');
  await idle(p);
  check('a new message ends the previous reply’s Undo', (await p.$$('.write-log')).length === 0 && await p.isHidden('#panel'));

  // Stop while a change waits: nothing is written.
  await p.evaluate(async () => {
    const src = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('wproject')).getDirectoryHandle('src');
    const w = await (await src.getFileHandle('app.js')).createWritable();
    await w.write('console.log("hi")');
    await w.close();
  });
  await ask('edit and stop');
  await waiting();
  await p.click('#send-btn');
  await idle(p);
  check('stopping while a change waits writes nothing', (await file('src/app.js')) === 'console.log("hi")' && (await p.textContent('.write-log')).includes('No changes applied'));

  await p.click('.write-log button:text-is("Review")');
  check('Review reopens the panel', await p.isVisible('#panel'));
  await p.click('#panel .panel-close');
  check('× closes the panel', (await p.isHidden('#panel')) && !(await p.evaluate(() => document.getElementById('app').classList.contains('panel-open'))));

  // A change that arrives while you're reading another chat waits there; the panel doesn't pop up.
  await p.evaluate(async () => {
    const src = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('wproject')).getDirectoryHandle('src');
    const w = await (await src.getFileHandle('app.js')).createWritable();
    await w.write('console.log("hi")');
    await w.close();
  });
  const editChat = await p.evaluate(() => document.querySelector('#chat-list li.active').dataset.id);
  await ask('edit while away');
  await p.click('#new-chat');
  await p.waitForTimeout(400);
  check('the panel stays closed while you are in another chat', await p.isHidden('#panel'));
  await p.click(`#chat-list li[data-id="${editChat}"] .chat-open`);
  await p.waitForSelector('.write-log .waiting');
  await p.click('.write-log button:text-is("Review")');
  await footButton('Skip');
  await idle(p);
  check('going back, the waiting change is there to review', (await file('src/app.js')) === 'console.log("hi")');

  // Read-only folders never get the write tools, and edit access doesn't survive a reload.
  await p.click('#new-chat');
  await p.click('#attach-btn');
  await p.click('#attach-menu [data-action="folder"]');
  await p.waitForTimeout(200);
  await ask('echo read only');
  await idle(p);
  check('a read-only folder gets no write tools', mock.requests.at(-1).hasTools && !mock.requests.at(-1).toolNames.includes('edit_file'));
  await p.reload();
  await p.waitForSelector('#chat-list li[data-id]', { state: 'attached' });
  await p.click('#chat-list li:nth-child(2) .chat-open');
  await p.waitForTimeout(300);
  check('after a reload the folder is back as read-only', (await p.textContent('.tray-chip.folder')).includes('wproject') && !(await p.textContent('.tray-chip.folder')).includes('can edit'));
  check('no errors in the browser console', errors.length === 0);
  if (errors.length) console.log('    ', errors.join('\n     '));
  await context.close();
}
