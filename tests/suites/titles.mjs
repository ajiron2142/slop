// Chat titles (optional add-on): after the first reply, one short request names the chat; once per
// chat, never again; and the first-message title stays when it fails or the answer breaks the rule.
import { openApp, send } from '../helpers.mjs';

export default async function ({ browser, site, mock, check }) {
  const { page: p, context, errors } = await openApp({ browser, site, mock });
  const title = () => p.textContent('#chat-list li.active .chat-open');
  const settle = () => p.waitForTimeout(300);
  const before = mock.titles.length; // the fake LiteLLM is shared with the other suites
  const mine = () => mock.titles.slice(before);

  await send(p, 'echo how do I raise the route timeout');
  await settle();
  check('after the first reply the chat gets a short title from the model', (await title()) === 'Mock chat title');
  check('the request is small: first message and reply, a low output cap', mine().length === 1 && mine()[0].about.startsWith('User: echo how do I') && mine()[0].maxTokens === 100);
  await send(p, 'echo and another thing');
  await settle();
  check('it happens once per chat', mine().length === 1 && (await title()) === 'Mock chat title');

  await p.click('#new-chat');
  await send(p, 'echo notitle please');
  await settle();
  check('when the request fails, the first-message title stays', (await title()) === 'echo notitle please');

  await p.click('#new-chat');
  await send(p, 'echo longtitle please');
  await settle();
  check('an answer longer than a few words is refused, and the first-message title stays', (await title()) === 'echo longtitle please');

  await p.reload();
  await p.waitForSelector('#chat-list li[data-id]', { state: 'attached' });
  check('the title is saved', (await p.textContent('#chat-list')).includes('Mock chat title'));
  check('the title request is not counted as a chat message', mock.requests.every((r) => !r.text.startsWith('User: ')));
  check('no errors in the browser console', errors.length === 0);
  if (errors.length) console.log('    ', errors.join('\n     '));
  await context.close();
}
