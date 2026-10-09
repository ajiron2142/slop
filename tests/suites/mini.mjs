// Mini window (optional add-on): the chat moves into a floating window and back, keeps working
// there (sending, menus, copy), and follows theme changes made in the tab.
import { openApp } from '../helpers.mjs';

export default async function ({ browser, site, mock, check }) {
  const { page: p, context, errors } = await openApp({ browser, site, mock });
  // The floating window isn't a Playwright page, so it's driven through the tab's script.
  const inMini = (fn, arg) => p.evaluate(([src, arg]) => new Function('doc', 'arg', `return (${src})(doc, arg)`)(documentPictureInPicture.window?.document, arg), [fn.toString(), arg]);

  check('the pop-out button shows where the browser supports it', await p.isVisible('#mini-btn'));
  await p.click('#mini-btn');
  await p.waitForFunction(() => documentPictureInPicture.window?.document.getElementById('chat'));
  check('the chat moves into the floating window', await p.evaluate(() => !document.getElementById('chat') && Boolean(documentPictureInPicture.window.document.getElementById('panel'))));
  check('the tab says where the chat went', (await p.textContent('.mini-home')).includes('floating window'));
  check('the floating window has the app’s styles', await inMini((doc) => doc.querySelectorAll('link[rel="stylesheet"]').length > 5 && doc.defaultView.getComputedStyle(doc.querySelector('.composer')).display === 'flex'));

  // Sending works from the floating window.
  await inMini((doc) => {
    const input = doc.getElementById('input');
    input.value = 'echo from the mini window';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await p.waitForFunction(() => documentPictureInPicture.window.document.querySelector('.msg.assistant .copy-reply')); // the reply has finished
  check('you can chat from the floating window', true);

  await inMini((doc) => doc.querySelector('.copy-reply').click());
  await p.waitForFunction(() => documentPictureInPicture.window.document.querySelector('.copy-reply').textContent !== 'Copy');
  check('Copy reply works from the floating window', (await inMini((doc) => doc.querySelector('.copy-reply').textContent)) === 'Copied' && (await inMini((doc) => doc.defaultView.navigator.clipboard.readText())).startsWith('Got 0 image'));

  // Menus open there and close on a click elsewhere in that window.
  await inMini((doc) => doc.getElementById('attach-btn').click());
  const menuOpen = await inMini((doc) => !doc.getElementById('attach-menu').hidden);
  await inMini((doc) => doc.querySelector('.messages').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  check('menus open and close on a click elsewhere in the floating window', menuOpen && await inMini((doc) => doc.getElementById('attach-menu').hidden));

  // Theme changes in the tab reach the floating window.
  await p.evaluate(async () => (await import('./app/theme.js')).applyTheme('monokai'));
  await p.waitForTimeout(100);
  check('the floating window follows theme changes', await inMini((doc) => doc.getElementById('chat').classList.contains('theme-monokai') && doc.querySelector('link[data-theme="monokai"]').media === 'all'));

  // Closing the floating window brings the chat back with everything in it.
  await p.evaluate(() => documentPictureInPicture.window.close());
  await p.waitForFunction(() => document.getElementById('chat'));
  check('closing it brings the chat back to the tab', await p.evaluate(() => document.querySelector('.app > .chat + .panel') !== null && !document.querySelector('.mini-home')?.isConnected));
  check('the conversation is still there', (await p.textContent('#messages')).includes('echo from the mini window'));
  check('it keeps the theme it was given', await p.evaluate(() => document.getElementById('chat').classList.contains('theme-monokai')));
  check('no errors in the browser console', errors.length === 0);
  if (errors.length) console.log('    ', errors.join('\n     '));
  await context.close();
}
