// Edit (optional add-on): your message, reworded, replaces everything after it and is answered again;
// unchanged it asks again; attachments stay; it can't be emptied; hidden while a reply is written.
import { openApp, idle, send } from '../helpers.mjs';

export default async function ({ browser, site, mock, check }) {
  const { page: p, context, errors } = await openApp({ browser, site, mock });
  const users = () => p.$$eval('.msg.user .body', (bs) => bs.map((b) => b.textContent));
  const count = () => p.$$eval('.msg', (ms) => ms.length);
  const edit = async (n) => { await p.hover(`.msg.user >> nth=${n}`); await p.click(`.msg.user >> nth=${n} >> .edit-btn`); };

  await p.setInputFiles('#file-input', [{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('route timeout 30s') }]);
  await send(p, 'echo first');
  await send(p, 'echo second');
  check('each of your messages has an Edit button', (await p.$$('.msg.user .edit-btn')).length === 2);

  await edit(0);
  check('Edit opens your words in a box', (await p.inputValue('.msg.user .edit-box')) === 'echo first');
  await p.keyboard.press('Escape');
  check('Esc closes it and nothing changes', !(await p.$('.edit-box')) && (await users()).join('|') === 'echo first|echo second');

  await edit(0);
  await p.fill('.edit-box', '   ');
  check('a message with only an attachment can still be saved', !(await p.isDisabled('.edit-buttons .primary')));
  await p.fill('.edit-box', 'echo first, reworded');
  const asked = mock.requests.length;
  await p.press('.edit-box', 'Enter');
  await idle(p);
  const sent = mock.requests.slice(asked);
  check('Save replaces everything after it, and the model answers the new wording', (await users()).join('|') === 'echo first, reworded' && (await count()) === 2
    && sent.length === 1 && sent[0].text.startsWith('echo first, reworded\n') && !sent[0].sent.includes('echo second'));
  check('its attachment stays with it', sent[0].hasFile && (await p.textContent('.msg.user .file-chip')) === 'notes.txt');

  await edit(0);
  await p.click('.edit-buttons .primary');
  await idle(p);
  check('saving it unchanged asks again, for a fresh answer in the same place', mock.requests.length === asked + 2 && (await count()) === 2);

  await p.click('#new-chat');
  await send(p, 'echo words only');
  await edit(0);
  await p.fill('.edit-box', '');
  check('a message with no attachment can\'t be emptied', await p.isDisabled('.edit-buttons .primary'));
  await p.click('.edit-buttons .btn:not(.primary)');

  await p.fill('#input', 'slow reply please');
  await p.press('#input', 'Enter');
  await p.waitForSelector('.msg.assistant.streaming');
  check('while a reply is being written there\'s no Edit', !(await p.isVisible('.msg.user >> nth=0 >> .edit-btn')));
  await idle(p);

  await p.reload();
  await p.waitForSelector('#chat-list li[data-id]');
  await p.click('#chat-list li[data-id]:last-child .chat-open');
  await p.waitForSelector('.msg.user');
  check('the edited chat is saved as edited', (await users()).join('|') === 'echo first, reworded' && (await count()) === 2);
  check('no errors in the browser console', errors.length === 0);
  if (errors.length) console.log('    ', errors.join('\n     '));
  await context.close();
}
