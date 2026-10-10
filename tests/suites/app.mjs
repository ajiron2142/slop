// The core app: settings, model picker, streaming, markdown and code blocks, attachments,
// chats and search, themes, the collapsible sidebar and the phone layout.
import { openApp, idle, send, PNG } from '../helpers.mjs';

export default async function ({ browser, site, mock, check }) {
  const { page: p, context, errors } = await openApp({ browser, site, mock }, { connect: false });

  check('settings opens on first visit', await p.evaluate(() => document.getElementById('settings').open));
  await p.fill('#set-base-url', mock.url);
  await p.fill('#set-api-key', 'sk-test');
  await p.click('#save-settings');
  await p.waitForSelector('#model-picker .model:not([disabled])');
  check('save shows status', (await p.textContent('#settings-status')).includes('Saved'));
  await p.click('#close-settings');

  // Model picker: 40 models, searchable, keyboard, recent group.
  check('model picker shows a model', (await p.textContent('#model-picker .model')) === 'claude-haiku');
  await p.click('#model-picker .model');
  await p.keyboard.type('mini');
  check('search filters the model list', (await p.$$('#model-picker .picker-option')).length === 10);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(100);
  check('model picked by keyboard', (await p.textContent('#model-picker .model')).includes('mini'));
  await p.click('#model-picker .model');
  check('recent models listed first', (await p.textContent('#model-picker .picker-list')).startsWith('Recent'));
  await p.keyboard.press('Escape');

  // Streaming and markdown.
  await p.fill('#input', 'show me tricky markdown');
  await p.press('#input', 'Enter');
  await p.waitForTimeout(150);
  check('send turns into stop while streaming', await p.evaluate(() => document.getElementById('send-btn').classList.contains('stop')));
  await idle(p);
  const md = await p.evaluate(() => {
    const last = [...document.querySelectorAll('.msg.assistant')].at(-1);
    const pre = last.querySelector('.code pre');
    return {
      codes: last.querySelectorAll('.code').length, table: !!last.querySelector('table'), heading: !!last.querySelector('h2'),
      nested: !!last.querySelector('li .code'), scrolls: pre.scrollWidth > pre.clientWidth, copyInsidePre: !!last.querySelector('pre .copy'),
    };
  });
  check('code blocks get a header with Copy', md.codes === 2 && !md.copyInsidePre);
  check('table, heading and code inside a list render', md.table && md.heading && md.nested);
  check('long code lines scroll inside the block', md.scrolls);
  await p.waitForFunction(() => document.querySelector('.msg.assistant .body pre .hljs-keyword'));
  check('code blocks get syntax colours', await p.evaluate(() => {
    const k = document.querySelector('.msg.assistant .body pre .hljs-keyword');
    return getComputedStyle(k).color !== getComputedStyle(k.closest('code')).color;
  }));
  await p.click('.msg.assistant .code .copy');
  check('Copy puts the exact code on the clipboard', (await p.evaluate(() => navigator.clipboard.readText())).startsWith('def hello(name):'));
  await p.click('.msg.assistant .copy-reply');
  await p.waitForSelector('.msg.assistant .copy-reply:text-is("Copied")');
  const copied = await p.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const html = await (await item.getType('text/html')).text();
    const text = await (await item.getType('text/plain')).text();
    return { html, text };
  });
  check('Copy reply puts formatted HTML on the clipboard for Teams and Outlook', copied.html.includes('<h2') && copied.html.includes('<table') && /<pre style="[^"]*background:#f6f8fa/.test(copied.html));
  check('…and the markdown as plain text', copied.text.startsWith("Here's a tricky reply.") && copied.text.includes('## A heading'));
  check('Copy stays visible while scrolling a long block', await p.evaluate(() => {
    const pane = document.getElementById('messages');
    const code = [...document.querySelectorAll('.msg.assistant .code')].at(-1);
    pane.scrollTop += code.getBoundingClientRect().top - pane.getBoundingClientRect().top + 400;
    const btn = code.querySelector('.copy').getBoundingClientRect();
    const box = pane.getBoundingClientRect();
    return btn.top >= box.top && btn.bottom <= box.bottom && code.getBoundingClientRect().top < box.top;
  }));

  // Long code lines scroll inside their block in every theme; the conversation never scrolls sideways.
  const wide = await p.evaluate(async () => {
    const { listThemes, applyTheme } = await import('./app/theme.js');
    const pane = document.getElementById('messages');
    const bad = [];
    for (const { id } of listThemes()) {
      applyTheme(id);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (pane.scrollWidth > pane.clientWidth + 1) bad.push(id || 'default');
    }
    applyTheme('');
    return bad;
  });
  check(`no theme makes the conversation scroll sideways${wide.length ? ` (${wide.join(', ')})` : ''}`, wide.length === 0);

  // Sidebar collapse.
  await p.click('#collapse-btn');
  await p.waitForTimeout(200);
  check('sidebar collapses to a rail', await p.evaluate(() => document.querySelector('.sidebar').getBoundingClientRect().width < 70));
  await p.click('#collapse-btn');
  await p.waitForTimeout(200);
  check('sidebar expands again', await p.evaluate(() => document.querySelector('.sidebar').getBoundingClientRect().width > 200));

  // Attachments: button, paste, drop, size and type checks.
  await p.setInputFiles('#file-input', [
    { name: 'pic.png', mimeType: 'image/png', buffer: PNG },
    { name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Notes\nsome text') },
  ]);
  await p.waitForTimeout(200);
  check('attach button adds two chips', (await p.$$('.tray-chip')).length === 2);
  await p.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'pasted.png', { type: 'image/png' }));
    document.getElementById('input').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await p.waitForTimeout(200);
  check('pasting an image attaches it', (await p.$$('.tray-chip')).length === 3);
  const drop = (name, type, text) => p.evaluate(([name, type, text]) => {
    const dt = new DataTransfer();
    dt.items.add(new File([text], name, { type }));
    const chat = document.getElementById('chat');
    for (const t of ['dragenter', 'dragover', 'drop']) chat.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, [name, type, text]);
  await drop('data.csv', 'text/csv', 'a,b\n1,2');
  await p.waitForTimeout(200);
  check('dropping a file attaches it', (await p.$$('.tray-chip')).length === 4);
  await drop('doc.pdf', 'application/pdf', 'x');
  await p.waitForTimeout(200);
  check('unsupported files are refused with a notice', (await p.$$('.tray-chip')).length === 4 && (await p.textContent('#notice')).includes('doc.pdf'));
  await p.click('.tray-chip:nth-child(3) .tray-remove');
  check('× removes an attachment', (await p.$$('.tray-chip')).length === 3);
  await send(p, 'echo files');
  const sent = mock.requests.at(-1);
  check('API gets the image and the inlined text files', sent.images === 1 && sent.hasFile && sent.model.includes('mini'));
  check('the system prompt starts with the date and time zone', /^Today is \w+day, \w+ \d{1,2}, \d{4}\. The user's time zone is .+ \(UTC[+-]\d\d:\d\d\)\.$/m.test(sent.system.split('\n')[0]));
  check('your message is sent exactly as you typed it', !/Today is|app-note|Current date/.test(sent.sent.split('"role":"user"').slice(1).join('')));
  check('the time is not saved or shown in the chat', !(await p.textContent('#messages')).includes('Current date'));
  check('sent message shows thumbnail and file chips', (await p.$$('.msg.user .file-thumb')).length === 1 && (await p.$$('.msg.user .file-chip')).length === 2);

  // Stop, chat list, search.
  await p.click('#new-chat');
  await p.fill('#input', 'second chat');
  await p.press('#input', 'Enter');
  await p.waitForTimeout(300);
  await p.click('#send-btn');
  await p.waitForTimeout(300);
  check('Stop ends streaming', !(await p.evaluate(() => document.getElementById('send-btn').classList.contains('stop'))));
  check('both chats are listed', (await p.$$('#chat-list li')).length === 2);
  await p.fill('#search', 'deliberately long');
  await p.waitForTimeout(400);
  check('search finds chats by message text', (await p.$$('#chat-list li[data-id]')).length >= 1);
  await p.fill('#search', 'zzzz');
  await p.waitForTimeout(400);
  check('search shows when nothing matches', (await p.textContent('#chat-list')).includes('No matches'));
  await p.fill('#search', '');
  await p.waitForTimeout(400);

  // Renaming: double-click a title.
  const names = () => p.$$eval('#chat-list .chat-open', (xs) => xs.map((x) => x.textContent));
  const before = await names();
  await p.dblclick('#chat-list li:nth-child(2) .chat-open');
  check('double-clicking a chat\'s title edits it, with the old name selected', await p.evaluate(() => {
    const input = document.querySelector('#chat-list .chat-rename');
    return Boolean(input) && input.value.length > 0 && input.selectionStart === 0 && input.selectionEnd === input.value.length;
  }));
  await p.keyboard.press('Escape');
  check('Esc keeps the old name', !(await p.$('.chat-rename')) && (await names()).join() === before.join());
  await p.dblclick('#chat-list li:nth-child(2) .chat-open');
  await p.keyboard.press('Backspace');
  await p.keyboard.press('Enter');
  check('an empty name isn\'t saved; it stays open for one', await p.isVisible('.chat-rename'));
  await p.keyboard.type('Renamed chat');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => [...document.querySelectorAll('#chat-list .chat-open')].some((x) => x.textContent === 'Renamed chat'));
  check('Enter saves the new name', (await names())[1] === 'Renamed chat' && (await names())[0] === before[0]);

  // Themes and persistence.
  await p.click('#settings-btn');
  await p.click('#theme-picker .model');
  await p.keyboard.type('mono');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(200);
  check('theme applies to sidebar, chat and settings', await p.evaluate(() => [...document.querySelectorAll('.themed')].every((n) => n.classList.contains('theme-monokai'))));
  await p.click('#close-settings');
  await send(p, 'echo a second message');
  const bars = await p.$$eval('.msg.user .body', (bodies) => bodies.map((b) => getComputedStyle(b).borderRightColor));
  check('in Monokai every message of yours has the blue bar', bars.length > 1 && bars.every((c) => c === 'rgb(97, 175, 239)'));
  await p.click('#collapse-btn');
  await p.waitForTimeout(300);
  await p.reload();
  await p.waitForSelector('#chat-list li[data-id]', { state: 'attached' });
  check('collapsed sidebar is remembered', await p.evaluate(() => document.getElementById('app').classList.contains('collapsed')));
  check('theme and chats are remembered', await p.evaluate(() => document.getElementById('chat').classList.contains('theme-monokai')) && (await p.$$('#chat-list li[data-id]')).length === 2);
  check('and so is a chat\'s new name', (await p.textContent('#chat-list')).includes('Renamed chat'));

  // Phone layout.
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(200);
  await p.click('#menu-btn');
  await p.waitForTimeout(300);
  check('menu button opens the chat list on a phone', await p.evaluate(() => document.getElementById('app').classList.contains('sidebar-open')));
  const isOpen = () => p.evaluate(() => document.getElementById('app').classList.contains('sidebar-open'));
  await p.click('#collapse-btn');
  await p.waitForTimeout(300);
  check('the sidebar\'s own button closes it, and leaves the wide-window setting alone', !(await isOpen()) && await p.evaluate(() => document.getElementById('app').classList.contains('collapsed')));
  await p.click('#menu-btn');
  await p.waitForTimeout(300);
  await p.keyboard.press('Escape');
  check('Escape closes it too', !(await isOpen()));
  check('nothing scrolls sideways on a phone', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  check('no errors in the browser console', errors.length === 0);
  if (errors.length) console.log('    ', errors.join('\n     '));
  await context.close();

  await onAPhone({ browser, site, mock, check });
}

// On a phone: Settings fits the visible screen, a picker opens without the keyboard and stays open
// while the keyboard comes and goes (the height changes), and taps don't flash a tinted box.
async function onAPhone({ browser, site, mock, check }) {
  const { page: p, context, errors } = await openApp({ browser, site, mock }, { viewport: { width: 390, height: 560 }, connect: false, phone: true });
  const box = await p.locator('#settings').boundingBox();
  check('on a phone, Settings fits the screen, its top and bottom both in view', box.y >= 0 && box.y + box.height <= 560 && box.x >= 0 && box.x + box.width <= 390);
  await p.$eval('#settings', (d) => { d.scrollTop = d.scrollHeight; });
  check('and scrolls to its last line', await p.$eval('#settings .hint', (h) => h.getBoundingClientRect().bottom <= innerHeight));
  // Theme near the bottom of the screen, as on a phone.
  await p.$eval('#settings', (d) => { d.scrollTop += document.querySelector('#theme-picker .model').getBoundingClientRect().bottom - 540; });
  await p.tap('#theme-picker .model');
  const pop = await p.locator('#theme-picker .picker-pop').boundingBox();
  check('near the bottom of the screen, a picker opens upward, all of it in view', pop.y >= 0 && pop.y + pop.height <= (await p.locator('#theme-picker .model').boundingBox()).y);
  check('a picker opens without bringing up the keyboard', await p.isVisible('#theme-picker .picker-pop') && !(await p.$eval('#theme-picker .picker-search', (s) => s === document.activeElement)));
  await p.setViewportSize({ width: 390, height: 300 });
  await p.waitForTimeout(100);
  check('it stays open when the keyboard changes the height', await p.isVisible('#theme-picker .picker-pop'));
  await p.setViewportSize({ width: 390, height: 560 }); // the keyboard goes away
  const before = await p.textContent('#theme-picker .model');
  await p.tap('#theme-picker .picker-option >> nth=1');
  check('and a theme can be picked', await p.isHidden('#theme-picker .picker-pop') && (await p.textContent('#theme-picker .model')) !== before);
  await p.tap('#theme-picker .model');
  await p.setViewportSize({ width: 600, height: 560 });
  await p.waitForTimeout(100);
  check('a picker still closes when the width changes', await p.isHidden('#theme-picker .picker-pop'));
  check('taps don\'t flash a tinted box', await p.$eval('#settings button', (b) => getComputedStyle(b).webkitTapHighlightColor === 'rgba(0, 0, 0, 0)'));
  check('no errors on the phone', errors.length === 0);
  await context.close();
}
