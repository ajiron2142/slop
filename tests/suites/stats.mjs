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
  check('summary shows context and cost', pop.includes('Context') && pop.includes('of 200,000 tokens') && pop.includes('Total'));
  check('no details while detailed stats are off', !pop.includes('This chat in detail'));
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
  check('per-model table with a total row', pop2.includes('This chat in detail') && pop2.includes('llama-3.1-70b') && pop2.includes('claude-haiku') && pop2.includes('Avg speed') && /Total2/.test(pop2.replace(/\s/g, '')));
  check('a model with no price counts as free', pop2.includes('Free') && pop2.includes('Next reply costs aboutFree'));
  check('growth per reply and next message size shown', pop2.includes('Grows per reply') && pop2.includes('Next message sends'));
  check('context is measured against the newly picked model', pop2.includes('of 32,768 tokens'));
  const rows = await p.$$eval('.meter-table tr:not(.total) td:nth-child(3)', (tds) => tds.map((td) => td.textContent));
  const total = numbers(await p.textContent('.meter-table .total td:nth-child(3)'));
  check('model rows add up to the total', rows.map(numbers).reduce((a, r) => [a[0] + r[0], a[1] + r[1]], [0, 0]).join() === total.join());
  await p.keyboard.press('Escape');

  await send(p, 'cut this reply short');
  await p.click('.msg.assistant:last-of-type .stats-btn');
  const cut = await p.textContent('.msg.assistant:last-of-type .stats-card');
  check('a cut-off reply is marked', cut.includes('Cut off'));
  check('cached input is shown when reported', cut.includes('Cached'));

  await pickModel(p, 'gemini-pro');
  await send(p, 'echo unknown price');
  const unpriced = await label();
  check('with an unpriced model, the meter keeps tokens and drops cost', unpriced.includes('tokens') && !unpriced.includes('$'));

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
