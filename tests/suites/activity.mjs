// What a reply did (optional add-on): a folded line with the current status, every step with its
// time when opened, each step's full request and result (or the model's thinking) when opened, kept
// in memory while the tab is open and gone after a reload.
import { openApp, idle } from '../helpers.mjs';

const LOG = Array.from({ length: 1200 }, (_, i) => (i === 600 ? `line ${i + 1} ERROR database timeout` : `line ${i + 1} INFO all good`)).join('\n');

export default async function ({ browser, site, mock, check }) {
  const { page: p, context, errors } = await openApp({ browser, site, mock });
  const reply = '.msg.assistant:last-of-type';
  const rows = () => p.$$eval(`${reply} .act-step .act-name`, (xs) => xs.map((x) => x.textContent));

  // While a reply works, the line says what it's doing; a plain reply shows nothing once done.
  await p.fill('#input', 'a plain question');
  await p.press('#input', 'Enter');
  await p.waitForSelector(`${reply} .act-head`);
  check('while a reply works, the line says what it is doing', /^(Waiting for claude-haiku|Writing)$/.test(await p.textContent(`${reply} .act-head .act-name`)));
  await idle(p);
  check('a reply that used no tools and didn\'t think shows no line once done', !(await p.$(`${reply} .activity`)));

  // A reply with tools and thinking.
  await p.evaluate((text) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    document.getElementById('input').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, LOG);
  // A tool call with broken JSON isn't run, and the reply carries on.
  await p.fill('#input', 'badjson: try it');
  await p.press('#input', 'Enter');
  await idle(p);
  check('a tool call whose JSON is cut off isn\'t run, and the model is told why', (await p.textContent(`${reply} .body`)).startsWith("GOT[Error: the arguments weren't valid JSON") && !(await p.$('.msg.error')));
  await p.click(`${reply} .act-head`);
  await p.click(`${reply} .act-step >> nth=0`);
  check('the step is marked failed and shows exactly what the model sent', (await p.textContent(`${reply} .act-step .act-mark`)) === '✕' && (await p.inputValue(`${reply} .act-box`)).startsWith('search_paste {"id": "x", "query": "ERR\n'));

  await p.fill('#input', 'paste think: what failed?');
  await p.press('#input', 'Enter');
  await idle(p);
  await p.waitForTimeout(100);
  const head = await p.textContent(`${reply} .act-head`);
  check('when done, the line says how many steps and how long it thought', /^▸2 steps · thought \d+\.\ds\d+\.\ds$/.test(head));
  check('it starts folded', await p.isHidden(`${reply} .act-list`));
  await p.setViewportSize({ width: 1280, height: 600 }); // short enough that what opens doesn't fit below the line, tall enough for all of it
  await p.evaluate(() => { const m = document.getElementById('messages'); m.scrollTop = m.scrollHeight; });
  await p.click(`${reply} .act-head`);
  await p.waitForTimeout(400);
  check('opening it scrolls the chat so all of what opened is in view', await p.evaluate((sel) => {
    const pane = document.getElementById('messages').getBoundingClientRect(), act = document.querySelector(`${sel} .activity`).getBoundingClientRect();
    return act.bottom <= pane.bottom + 1 && act.top >= pane.top - 1;
  }, reply));
  await p.setViewportSize({ width: 1280, height: 800 });
  const names = await rows();
  check('opened, it lists every step in order, thinking only where the model sent some', names.length === 4 && names[0] === 'Thinking' && names[1].startsWith('Searched paste for "ERROR" · ') && names[2].startsWith('Read paste lines 600–602 · 4 lines') && names[3] === 'Thinking');
  check('each step has its time', (await p.$$eval(`${reply} .act-step .act-time`, (xs) => xs.every((x) => /^\d+\.\ds$/.test(x.textContent)))));

  await p.click(`${reply} .act-step >> nth=2`);
  const box = `${reply} .act-box:not(.think)`;
  const value = await p.inputValue(box);
  check('opening a step shows exactly what was asked and what came back', value.startsWith('read_paste {"id":') && value.includes('"start_line":600') && value.includes('→ 4 lines') && value.includes('601\tline 601 ERROR database timeout'));
  check('it can\'t be edited, and is at most 200px tall', await p.$eval(box, (b) => b.readOnly && b.getBoundingClientRect().height <= 200));
  await p.click(box);
  await p.keyboard.press('Control+A');
  check('Ctrl+A in it selects just that step', await p.$eval(box, (b) => b.selectionStart === 0 && b.selectionEnd === b.value.length));

  await p.click(`${reply} .act-step >> nth=0`);
  check('a thinking step shows what the model thought', (await p.inputValue(`${reply} .act-box.think`)) === 'I should search for errors first.');
  await p.click(`${reply} .act-step >> nth=3`);
  check('and each thinking step has its own', (await p.$$eval(`${reply} .act-box.think`, (bs) => bs.map((b) => b.value))).join('|') === 'I should search for errors first.|Line 601 has the error.');

  // Kept while the tab is open, gone after a reload.
  await p.click('#new-chat');
  await p.click('#chat-list li:nth-child(1) .chat-open');
  await p.waitForSelector(`${reply} .activity`);
  check('switching chats and back keeps it, still opened as you left it', await p.isVisible(`${reply} .act-box.think`));

  // What a model writes before its tool calls (Haiku does, where thinking models think it) is a note
  // among the steps, not part of the answer; the model still gets it back.
  await p.fill('#input', 'paste narrate: what failed?');
  await p.press('#input', 'Enter');
  await idle(p);
  await p.waitForTimeout(100);
  check('text written before tool calls stays out of the reply, which is just the answer', (await p.textContent(`${reply} .body`)).startsWith('SEARCH[') && !(await p.textContent(`${reply} .body`)).includes('Let me look'));
  check('the line counts the notes', /^▸2 steps · 2 notes/.test(await p.textContent(`${reply} .act-head`)));
  await p.click(`${reply} .act-head`);
  const steps = await p.$$eval(`${reply} .act-step .act-name`, (xs) => xs.map((x) => x.textContent));
  check('each note sits before the call it led to', steps.length === 4 && steps[0] === 'Note: Let me look (1).' && steps[1].startsWith('Searched paste') && steps[2] === 'Note: Let me look (2).' && steps[3].startsWith('Read paste'));
  check('and the model still gets what it wrote back', mock.requests.at(-1).sent.includes('"content":"Let me look (1)."') && mock.requests.at(-1).sent.includes('"content":"Let me look (2)."'));
  await p.reload();
  await p.waitForSelector('#chat-list li[data-id]');
  await p.click('#chat-list li:nth-child(1) .chat-open');
  await p.waitForSelector(`${reply} .tool-log`);
  check('after a reload only the saved one-line summary is left', !(await p.$('.activity')) && (await p.textContent(`${reply} .tool-log`)).startsWith('Searched paste'));

  // The line's timer is the reply's total time: it keeps counting up when the stage changes.
  await p.route(`${mock.url}/v1/chat/completions`, async (route) => { await new Promise((r) => setTimeout(r, 1200)); await route.continue(); });
  await p.fill('#input', 'slow story please');
  await p.press('#input', 'Enter');
  await p.waitForFunction(() => document.querySelector('.msg.assistant.streaming .body')?.textContent.length > 20);
  const total = parseFloat(await p.textContent('.msg.assistant.streaming .act-head .act-time'));
  check('once it starts writing, the timer still counts from when you sent, not from 0', total >= 1.2);
  await p.unroute(`${mock.url}/v1/chat/completions`);
  await idle(p);
  check('no errors in the browser console', errors.length === 0);
  if (errors.length) console.log('    ', errors.join('\n     '));
  await context.close();
}
