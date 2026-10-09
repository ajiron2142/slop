// Smart paste (optional add-on): a long paste becomes a chip the model searches instead of a
// giant message; "in full" sends it as before; nothing survives a reload.
import { openApp, idle } from '../helpers.mjs';

const LOG = Array.from({ length: 1200 }, (_, i) => (i === 600 ? `line ${i + 1} ERROR database timeout` : `line ${i + 1} INFO all good`)).join('\n');

export default async function ({ browser, site, mock, check }) {
  const { page: p, context, errors } = await openApp({ browser, site, mock });
  const paste = (text) => p.evaluate((text) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    document.getElementById('input').dispatchEvent(e);
    return e.defaultPrevented;
  }, text);
  const ask = async (text) => {
    await p.fill('#input', text);
    await p.press('#input', 'Enter');
    await idle(p);
    await p.waitForTimeout(100);
  };

  check('a short paste is left alone', (await paste('one\ntwo\nthree')) === false && (await p.$$('.tray-chip.paste')).length === 0);
  check('a long paste becomes a chip instead of text', (await paste(LOG)) === true && (await p.textContent('.tray-chip.paste')).includes('Pasted · 1,200 lines') && (await p.inputValue('#input')) === '');
  check('the chip says it goes as a reference', (await p.textContent('.tray-chip.paste .paste-mode')) === 'as reference');

  const before = mock.requests.length;
  await ask('paste: what failed?');
  const sent = mock.requests[before]; // the first request of the reply, before any tool results
  check('the model gets the paste tools', sent.toolNames.includes('search_paste') && sent.toolNames.includes('read_paste'));
  check('the message carries a short preview, not the whole paste', sent.sent.includes('line 1 INFO') && sent.sent.includes('line 1200 INFO') && !sent.sent.includes('line 600 INFO') && sent.sent.length < 6000);
  const reply = await p.textContent('.msg.assistant:last-of-type .body');
  check('the model can search the paste', reply.includes('SEARCH[1 matching lines | 601: line 601 ERROR database timeout]'));
  check('the model can read lines of the paste', reply.includes('READ[600\tline 600 INFO all good | 601\tline 601 ERROR'));
  check('the reply shows what it looked at', (await p.textContent('.msg.assistant .tool-log')) === 'Searched paste for "ERROR" · Read paste lines 600–602');
  check('the sent message shows the paste as a chip', (await p.textContent('.msg.user .file-chip')).includes('Pasted · 1,200 lines'));
  check('the paste is not saved with the chat', await p.evaluate(async () => {
    const id = document.querySelector('#chat-list li.active').dataset.id;
    const stored = await new Promise((res) => {
      const r = indexedDB.open('keyval-store');
      r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get(`chat:${id}`); q.onsuccess = () => res(q.result); };
    });
    const file = stored.messages[0].files[0];
    return file.kind === 'paste' && file.name === 'Pasted · 1,200 lines' && !('text' in file);
  }));

  // In full: the old behaviour, inlined like an attached file.
  await p.click('#new-chat');
  await paste(LOG);
  await p.click('.tray-chip.paste .paste-mode');
  check('one click switches it to in full', (await p.textContent('.tray-chip.paste .paste-mode')) === 'in full');
  await ask('echo full');
  check('in full, the whole paste goes with the message and no paste tools are sent', mock.requests.at(-1).hasFile && mock.requests.at(-1).sent.includes('line 600 INFO') && !mock.requests.at(-1).toolNames.includes('search_paste'));

  // After a reload the paste is gone, and the model is told so.
  await p.reload();
  await p.waitForSelector('#chat-list li[data-id]', { state: 'attached' });
  await p.click('#chat-list li:nth-child(2) .chat-open');
  await p.waitForTimeout(300);
  await ask('echo after reload');
  const after = mock.requests.at(-1);
  check('after a reload the paste is gone and the model is told', !after.toolNames.includes('search_paste') && after.sent.includes('No longer available'));
  check('no errors in the browser console', errors.length === 0);
  if (errors.length) console.log('    ', errors.join('\n     '));
  await context.close();
}
