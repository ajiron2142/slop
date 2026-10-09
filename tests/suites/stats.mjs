// The usage meter and "Show detailed stats": context and cost, per-model totals that add up,
// switching models, free and unpriced models, cut-off and stopped replies, phone layout.
import { openApp, idle, send, pickModel } from '../helpers.mjs';

export default async function ({ browser, site, mock, check }) {
  const { page: p, context, errors } = await openApp({ browser, site, mock });
  const label = () => p.textContent('#meter-btn');
  const numbers = (text) => text.split(' / ').map((x) => +x.replace(/,/g, ''));

  check('meter is hidden before the first reply', await p.isHidden('#meter-row'));
  await send(p, 'echo hello');
  check('meter shows context % and cost', /^(<1|\d+)% · (<\$0\.01|\$\d)/.test(await label()));
  await p.click('#meter-btn');
  const pop = await p.textContent('#meter-pop');
  check('summary shows the context window and this chat', pop.includes('Context window') && pop.includes('/ 200k') && pop.includes('This chat') && pop.includes('Cost') && pop.includes('Cache'));
  check('key budget shows spend and reset date', pop.includes('Key budget') && pop.includes('resets') && pop.includes('$12.40 of $50.00 spent'));
  check('the meter sits in the header with the model', await p.evaluate(() => document.querySelector('.chat-header #meter-btn') !== null));
  check('the summary opens right below its button', await p.evaluate(() => {
    const pop = document.getElementById('meter-pop').getBoundingClientRect();
    const btn = document.getElementById('meter-btn').getBoundingClientRect();
    return Math.abs(pop.right - btn.right) < 2 && pop.top >= btn.bottom && pop.top - btn.bottom < 16;
  }));
  check('without detailed stats, each model shows just its cost', (await p.$$('.meter-model')).length === 1 && (await p.$$('.meter-model-meta')).length === 0);
  await p.keyboard.press('Escape');
  check('Escape closes the summary', await p.isHidden('#meter-pop'));
  check('no Stats button while detailed stats are off', (await p.$$('.stats-btn')).length === 0);

  await p.click('#settings-btn');
  await p.check('#set-stats');
  await p.click('#close-settings');
  await p.waitForTimeout(150);
  check('Stats button appears when turned on', (await p.$$('.stats-btn')).length === 1);
  await p.click('.stats-btn');
  const card = await p.textContent('.stats-card');
  check('Stats card: model, tokens, context, cost, finished', card.includes('claude-haiku') && /\d+ in \+ \d+ out = \d+/.test(card) && card.includes('of 200,000') && card.includes('Cost') && card.includes('Complete'));

  await pickModel(p, 'llama');
  await send(p, 'echo second');
  await p.click('#meter-btn');
  const pop2 = await p.textContent('#meter-pop');
  const blocks = await p.$$eval('.meter-model', (bs) => bs.map((b) => b.textContent));
  check('each model appears once, with speed before its tokens', blocks.length === 2 && blocks.every((b) => /\d+\/s · [\d.k]+ tokens \([\d.k]+ in · [\d.k]+ out\)/.test(b)));
  check('models are sorted by cost, free ones after', blocks[0].startsWith('claude-haiku') && blocks[1].startsWith('llama-3.1-70b') && blocks[1].includes('Free'));
  check('a model priced at 0 is free', pop2.includes('Next reply costs aboutFree'));
  check('growth per reply shown', pop2.includes('Grows per reply'));
  check('context is measured against the newly picked model', pop2.includes('/ 32.8k'));
  const shares = await p.$$eval('.meter-share small', (xs) => xs.map((x) => x.textContent));
  check('each model shows its share of the cost', shares.join() === '100%,0%');
  await p.keyboard.press('Escape');

  await send(p, 'cut this reply short');
  await p.click('.msg.assistant:last-of-type .stats-btn');
  const cut = await p.textContent('.msg.assistant:last-of-type .stats-card');
  check('a cut-off reply is marked', cut.includes('Cut off'));
  check('and says so under the reply, for everyone', (await p.textContent('.msg.assistant:last-of-type .reply-note')).startsWith('Cut off: the model reached the most it can write'));
  check('the output limit is sent only when LiteLLM gives one', mock.requests.some((r) => r.model === 'claude-haiku' && r.maxTokens === 8192) && mock.requests.at(-1).maxTokens === undefined);
  check('cached input is shown when reported', cut.includes('Cached'));

  await pickModel(p, 'gemini-pro');
  await send(p, 'echo unknown price');
  const unpriced = await label();
  check('with an unpriced model, the meter keeps tokens and drops cost', unpriced.includes('tokens') && !unpriced.includes('$'));
  await pickModel(p, 'mistral-large');
  await send(p, 'echo no price given');
  await p.click('#meter-btn');
  const mistral = await p.$$eval('.meter-model', (bs) => bs.map((b) => b.textContent).find((t) => t.startsWith('mistral-large')));
  check('a model LiteLLM lists without a price shows an unknown cost, not Free', mistral.includes('—') && !mistral.includes('Free') && (await p.textContent('#meter-pop')).includes('Cost —'));
  await p.keyboard.press('Escape');

  await p.reload();
  await p.waitForSelector('#chat-list li[data-id]', { state: 'attached' });
  await p.click('#chat-list li:first-child .chat-open');
  await p.waitForTimeout(300);
  check('stats and the setting survive a reload', (await p.$$('.stats-btn')).length >= 3 && !(await p.isHidden('#meter-row')));

  await p.fill('#input', 'a long one to stop');
  await p.press('#input', 'Enter');
  await p.waitForTimeout(250);
  await p.click('#send-btn');
  await idle(p);
  await p.waitForTimeout(100);
  await p.click('.msg.assistant:last-of-type .stats-btn');
  const stopped = await p.textContent('.msg.assistant:last-of-type .stats-card');
  check('a stopped reply says so, without token counts', stopped.includes('Stopped by you') && !stopped.includes(' in + '));

  // A chat bigger than the picked model can take: red meter and a hint.
  await p.click('#new-chat');
  await pickModel(p, 'llama-3.1-70b');
  await send(p, 'huge question');
  await p.click('#meter-btn');
  const huge = await p.textContent('#meter-pop');
  check('a chat too long for the model shows a warning', huge.includes('Too long for llama-3.1-70b') && await p.evaluate(() => document.getElementById('meter-btn').classList.contains('too-long')));
  await p.keyboard.press('Escape');

  await p.click('#new-chat');
  check('a new chat hides the meter', await p.isHidden('#meter-row'));
  await p.setViewportSize({ width: 390, height: 844 });
  await p.click('#menu-btn');
  await p.waitForTimeout(300);
  await p.click('#chat-list li:first-child .chat-open');
  await p.waitForTimeout(300);
  await p.click('#meter-btn');
  await p.waitForTimeout(100);
  check('the summary fits on a phone', await p.evaluate(() => {
    const r = document.getElementById('meter-pop').getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth;
  }));
  check('no errors in the browser console', errors.length === 0);
  if (errors.length) console.log('    ', errors.join('\n     '));
  await context.close();
}
