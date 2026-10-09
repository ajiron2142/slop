import { el, onClickOutside } from '../dom.js';
import { fmt } from '../stats.js';

// The usage meter in the chat header: "13% · $0.04". Clicking it opens a summary right below it:
// the context window, your key's budget (when LiteLLM reports one), this chat's cost and cache
// use, and each model the chat used with its cost. "Show detailed stats" adds each model's speed
// and tokens, and what the chat grows by per reply.
export function createMeter({ row, button, pop }) {
  const ring = el('span', 'meter-ring');
  const label = el('span', 'meter-label');
  button.append(ring, label);

  let stopOutside = null;
  const toggle = (open) => {
    pop.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    stopOutside?.();
    stopOutside = open ? onClickOutside(row, () => toggle(false)) : null;
  };
  button.addEventListener('click', () => toggle(pop.hidden));
  row.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { toggle(false); button.focus(); } });

  return {
    render(sum, { detailed = false, key = null, model = '' } = {}) {
      row.hidden = !sum;
      if (!sum) { toggle(false); return; }
      button.classList.toggle('too-long', sum.tooLong);
      ring.style.setProperty('--p', `${Math.min(100, sum.percent ?? 0)}%`);
      ring.hidden = sum.percent == null;
      label.textContent = [
        sum.percent != null ? pct(sum) : `${fmt.short(sum.context)} tokens`,
        sum.cost != null && fmt.usdShort(sum.cost),
      ].filter(Boolean).join(' · ');
      pop.replaceChildren(
        ...context(sum, model),
        ...budget(key),
        el('hr', 'meter-rule'),
        ...thisChat(sum, detailed),
      );
    },
  };
}

const pct = (sum) => (sum.percent === 0 && sum.context > 0 ? '<1%' : `${sum.percent}%`);
const date = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// A titled line with the figures on the right: "Context window   1.2k / 32.8k  4%".
function line(title, detail, figure) {
  const head = el('div', 'meter-line');
  const right = el('span', 'meter-detail', detail);
  if (figure) right.append(el('b', '', figure));
  head.append(el('span', '', title), right);
  return head;
}

function bar(percent, state = '') {
  const node = el('div', `meter-bar ${state}`);
  node.style.setProperty('--p', `${Math.min(100, percent)}%`);
  return node;
}

function context(sum, model) {
  if (sum.limit == null) return [line('Context window', `${fmt.int(sum.context)} tokens`)];
  const nodes = [line('Context window', `${fmt.short(sum.context)} / ${fmt.short(sum.limit)} `, pct(sum)), bar(sum.percent, sum.tooLong ? 'bad' : '')];
  if (sum.tooLong) nodes.push(el('div', 'meter-cap bad', `Too long for ${model}: start a new chat or pick a model with a bigger window.`));
  return nodes;
}

// Only when LiteLLM reports a budget for your key.
function budget(key) {
  if (!key) return [];
  const percent = key.max_budget > 0 ? Math.round((key.spend / key.max_budget) * 100) : 100;
  return [
    line('Key budget', key.budget_reset_at ? `resets ${date(key.budget_reset_at)} ` : '', `${percent}%`),
    bar(percent, percent >= 90 ? 'bad' : percent >= 75 ? 'warn' : ''),
    el('div', 'meter-cap', `${fmt.usd2(key.spend)} of ${fmt.usd2(key.max_budget)} spent`),
  ];
}

// "This chat" with its cost and cache use, then one block per model, most expensive first
// (free ones after, by tokens). With several models, each has a bar for its share of the cost.
function thisChat(sum, detailed) {
  const head = el('div', 'meter-line');
  const right = el('span', 'meter-detail', `Cache ${sum.input ? `${Math.round((sum.cached / sum.input) * 100)}%` : '—'} · Cost `);
  right.append(el('b', '', sum.cost == null ? '—' : fmt.usd(sum.cost)));
  head.append(el('span', 'meter-sec', 'This chat'), right);

  const cost = (m) => (m.priced ? m.cost : 0);
  const models = [...sum.models].sort((a, b) => cost(b) - cost(a) || b.input + b.output - (a.input + a.output));
  // Shares of what the priced models cost; a model without a known price gets an empty bar.
  const total = models.length > 1 ? models.reduce((a, m) => a + cost(m), 0) : 0;
  const blocks = models.map((m) => {
    const block = el('div', 'meter-model');
    const top = el('div', 'meter-model-top');
    const name = el('span', 'meter-model-name', m.model);
    name.title = m.model;
    top.append(name, el('span', m.priced && m.cost ? '' : 'meter-free', m.priced ? fmt.usd(m.cost) : '—'));
    block.append(top);
    if (detailed) {
      const speed = m.speed ? `${Math.round(m.speed)}/s · ` : '';
      block.append(el('div', 'meter-model-meta', `${speed}${fmt.short(m.input + m.output)} tokens (${fmt.short(m.input)} in · ${fmt.short(m.output)} out)`));
    }
    if (total) {
      const share = m.priced ? Math.round((m.cost / total) * 100) : 0;
      const line = el('div', 'meter-share');
      line.append(bar(share), el('small', '', m.priced ? `${share}%` : ''));
      block.append(line);
    }
    return block;
  });

  const nodes = [head, ...blocks];
  if (detailed) {
    const extra = el('div', 'meter-rows');
    const add = (k, v) => extra.append(el('span', 'k', k), el('span', 'v', v));
    if (sum.growth != null) add('Grows per reply', `~${fmt.int(sum.growth)} tokens`);
    if (sum.nextCost != null) add('Next reply costs about', sum.nextCost === 0 ? 'Free' : `~${fmt.usd(sum.nextCost)}`);
    if (extra.childElementCount) nodes.push(extra);
  }
  return nodes;
}
