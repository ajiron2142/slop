// Write mode (optional add-on): connecting a folder for editing, reviewing changes in the reply
// (cards that open into diffs), Apply / Skip / Apply all remaining, typing instead of Skip, Undo
// for the latest reply, and what stays read-only.
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
  const waiting = () => p.waitForSelector('.change.waiting .change-actions');
  const footButton = (label) => p.click(`.msg.assistant:last-of-type .write-review button:text-is("${label}")`);
  const waitingPath = () => p.textContent('.change.waiting .change-path');

  await p.click('#attach-btn');
  await p.click('#attach-menu [data-action="folder-edit"]');
  await p.waitForTimeout(200);
  check('the folder chip says it can edit', (await p.textContent('.tray-chip.folder')).includes('can edit'));

  // A reply with two changes: apply the first, skip the second; its third call can't match.
  await ask('edit please');
  await waiting();
  const sent = mock.requests.at(-1);
  check('edit mode sends the write tools and says how to use them', sent.toolNames.includes('edit_file') && sent.toolNames.includes('write_file') && sent.system.includes('change files'));
  check('the model is told to use the tools, not ask first, and where paths start', sent.system.includes("don't ask in the chat first") && sent.system.includes('starts with the folder\'s name, like "wproject/src/app.js"'));
  check('the change shows in the reply, open, with its diff', (await waitingPath()) === 'wproject/src/app.js' && (await p.textContent('.change.waiting .diff')).includes('+ console.log("hello")') && (await p.textContent('.change.waiting .diff')).startsWith('@@ line 1'));
  check('the side panel stays closed', await p.isHidden('#panel'));
  check('the chat says what is waiting', (await p.textContent('.write-log')).includes('Waiting for you: wproject/src/app.js'));
  check('nothing is written before you choose', (await file('src/app.js')) === 'console.log("hi")');
  await footButton('Apply');
  await p.waitForFunction(() => document.querySelector('.change.waiting .change-path')?.textContent === 'wproject/notes/new.txt');
  check('the next change opens and the applied one closes', (await p.textContent('.change.waiting .diff')).includes('+ fresh') && (await p.$$('.write-review .diff')).length === 1);
  await footButton('Skip');
  await idle(p);
  const reply = await p.textContent('.msg.assistant:last-of-type .body');
  check('the model hears what was applied, skipped and refused', reply.includes('EDIT[Applied the change to wproject/src/app.js.]') && reply.includes('CREATE[The user skipped this change') && reply.includes("BAD[Error: old_text wasn't found in wproject/src/app.js"));
  check('applied changes are written', (await file('src/app.js')) === 'console.log("hello")');
  check('skipped changes are not', (await file('notes/new.txt')) === null && (await file('wproject/notes/new.txt')) === null);
  check('the reply lists what happened', (await p.textContent('.msg.assistant:last-of-type .tool-log')) === "Edited wproject/src/app.js (+1 −1) · Skipped wproject/notes/new.txt · Couldn't change wproject/src/app.js");
  check('the reply offers Undo', (await p.textContent('.write-log')).includes('1 changed') && (await p.isVisible('.write-log button:text-is("↶ Undo")')));

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
  const review = () => p.textContent('.msg.assistant:last-of-type .write-review');
  check('each file shows what happened to it', (await review()).includes('applied') && (await review()).includes('created'));
  check('a final newline is not counted as an extra line', (await p.textContent('.msg.assistant:last-of-type .change >> nth=1 >> .change-counts')) === '+1');
  check('finished cards are closed', (await p.$$('.msg.assistant:last-of-type .write-review .diff')).length === 0);
  await p.click('.msg.assistant:last-of-type .change >> nth=0 >> .change-head');
  check('clicking a card opens its diff', (await p.textContent('.msg.assistant:last-of-type .change >> nth=0 >> .diff')).includes('+ console.log("hello")'));
  await p.click('.msg.assistant:last-of-type .change >> nth=0 >> .change-head');
  check('and clicking again closes it', (await p.$$('.msg.assistant:last-of-type .write-review .diff')).length === 0);
  // Opening a card while scrolled up keeps your place (a redraw used to jump to the top).
  await p.setViewportSize({ width: 1280, height: 600 });
  const scrolled = () => p.evaluate(() => document.getElementById('messages').scrollTop);
  await p.evaluate(() => {
    const m = document.getElementById('messages');
    m.scrollTop = m.scrollHeight - m.clientHeight - 60;
  });
  const before = await scrolled();
  await p.click('.msg.assistant:last-of-type .change >> nth=0 >> .change-head');
  await p.waitForTimeout(150);
  const after = await scrolled();
  await p.click('.msg.assistant:last-of-type .change >> nth=0 >> .change-head');
  await p.setViewportSize({ width: 1280, height: 800 });
  check('opening a card keeps your place in the chat', before > 0 && Math.abs(after - before) < 2);
  await footButton('↶ Undo');
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
  check('a new message ends the previous reply’s Undo', (await p.$$('.write-log')).length === 0);

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


  // Typing instead of Skip: the change is skipped and the model gets your words.
  await p.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('wproject');
    await dir.removeEntry('notes', { recursive: true }).catch(() => {}); // left by the Undo you declined above
  });
  await ask('edit with a note');
  await waiting();
  await p.fill('#input', 'make it say howdy instead');
  await p.press('#input', 'Enter');
  await p.waitForFunction(() => document.querySelector('.change.waiting .change-path')?.textContent === 'wproject/notes/new.txt');
  check('typing while a change waits skips it and shows your note', (await p.inputValue('#input')) === '' && (await p.textContent('.msg.assistant:last-of-type .change >> nth=0 >> .change-note')) === 'You: make it say howdy instead' && (await file('src/app.js')) === 'console.log("hi")');
  await footButton('Skip');
  await idle(p);
  check('the model gets your note', (await p.textContent('.msg.assistant:last-of-type .body')).includes('said instead: "make it say howdy instead"'));

  // A change that arrives while you're reading another chat waits there until you come back.
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
  await p.click(`#chat-list li[data-id="${editChat}"] .chat-open`);
  await waiting();
  await footButton('Skip');
  await p.waitForFunction(() => document.querySelector('.change.waiting .change-path')?.textContent === 'wproject/notes/new.txt');
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
