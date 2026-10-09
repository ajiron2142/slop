// Image viewer (optional add-on): clicking an image in the chat or above the message box shows it
// large; Esc, the dimmed area and × close it.
import { openApp, send } from '../helpers.mjs';

export default async function ({ browser, site, mock, check }) {
  const { page: p, context, errors } = await openApp({ browser, site, mock });
  // A real 640×400 picture: a screenshot of the app itself.
  const picture = await p.screenshot({ clip: { x: 0, y: 0, width: 640, height: 400 } });
  await p.setInputFiles('#file-input', [{ name: 'screen.png', mimeType: 'image/png', buffer: picture }]);
  const open = () => p.evaluate(() => Boolean(document.querySelector('dialog.viewer[open]')));

  await p.click('.tray-chip img');
  check('an image waiting above the message box opens large', await open());
  await p.keyboard.press('Escape');
  check('Esc closes it', !(await open()) && !(await p.$('dialog.viewer')));

  await send(p, 'echo look');
  await p.click('.msg.user .file-thumb');
  check('an image in the chat opens large, at its own size', await p.evaluate(() => {
    const img = document.querySelector('dialog.viewer[open] img');
    return img.getBoundingClientRect().width === 640 && img.naturalWidth === 640;
  }));
  check('it shows the file name', (await p.textContent('dialog.viewer .viewer-name')) === 'screen.png');
  await p.mouse.click(20, 20);
  check('clicking the dimmed area closes it', !(await open()));
  await p.click('.msg.user .file-thumb');
  await p.click('dialog.viewer .viewer-close');
  check('× closes it', !(await open()));

  await p.setViewportSize({ width: 500, height: 400 });
  await p.click('.msg.user .file-thumb');
  check('a big image shrinks to fit the window', await p.evaluate(() => {
    const r = document.querySelector('dialog.viewer[open] img').getBoundingClientRect();
    return r.width <= innerWidth && r.height <= innerHeight;
  }));
  await p.keyboard.press('Escape');

  // In the mini window it opens there, not in the tab.
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.click('#mini-btn');
  await p.waitForFunction(() => documentPictureInPicture.window?.document.querySelector('.file-thumb'));
  const inMini = await p.evaluate(() => {
    const doc = documentPictureInPicture.window.document;
    doc.querySelector('.file-thumb').click();
    return Boolean(doc.querySelector('dialog.viewer[open]')) && !document.querySelector('dialog.viewer');
  });
  check('in the mini window it opens there', inMini);
  await p.evaluate(() => documentPictureInPicture.window.close());
  check('no errors in the browser console', errors.length === 0);
  if (errors.length) console.log('    ', errors.join('\n     '));
  await context.close();
}
