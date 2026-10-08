import { el } from '../dom.js';
import { fmt } from '../stats.js';

// The usage meter above the message box: "13% · $0.04". Clicking it opens a summary right above it:
// the context window, your key's budget (when LiteLLM reports one), and this chat's cost and cache
// use. With "Show detailed stats" on, it adds a breakdown by model.
export function createMeter({ row, button, pop }) {
  const ring = el('span', 'meter-ring');
  const label = el('span', 'meter-label');
  button.append(ring, label);

  const toggle = (open) => {
    pop.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  };
  button.addEventListener('click', () => toggle(pop.hidden));
  document.addEventListener('pointerdown', (e) => { if (!row.contains(e.target)) toggle(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { toggle(false); button.focus(); } });

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
        ...thisChat(sum),
        ...(detailed ? [el('hr', 'meter-rule'), ...breakdown(sum)] : []),
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

// Only when LiteLLM reports a budget or an expiry date for your key.
function budget(key) {
  if (!key) return [];
  const nodes = [];
  if (key.max_budget != null) {
    const percent = key.max_budget > 0 ? Math.round((key.spend / key.max_budget) * 100) : 100;
    nodes.push(
      line('Key budget', key.budget_reset_at ? `resets ${date(key.budget_reset_at)} ` : '', `${percent}%`),
      bar(percent, percent >= 90 ? 'bad' : percent >= 75 ? 'warn' : ''),
    );
  }
  const caption = [];
  if (key.max_budget != null) caption.push(el('span', '', `${fmt.usd2(key.spend)} of ${fmt.usd2(key.max_budget)} spent`));
  if (key.expires) {
    const days = (new Date(key.expires) - Date.now()) / 86400000;
    if (caption.length) caption.push(el('span', '', ' · '));
    caption.push(el('span', days < 14 ? 'warn' : '', days < 0 ? `Key expired ${date(key.expires)}` : `Key expires ${date(key.expires)}`));
  }
  const cap = el('div', 'meter-cap');
  cap.append(...caption);
  return [...nodes, cap];
}

function thisChat(sum) {
  const pair = (k, v) => {
    const node = el('span', 'meter-pair', k);
    node.append(el('b', '', v));
    return node;
  };
  const stats = el('div', 'meter-pairs');
  stats.append(
    pair('Cost', sum.cost == null ? '—' : fmt.usd(sum.cost)),
    pair('Cache', sum.input ? `${Math.round((sum.cached / sum.input) * 100)}%` : '—'),
  );
  const chips = el('div', 'meter-chips');
  for (const m of sum.models) chips.append(el('span', 'meter-chip', `${m.model} ${Math.round((m.replies / sum.replies) * 100)}%`));
  return [el('div', 'meter-sec', 'This chat'), stats, chips];
}

// Rows of figures, one column per model plus Total.
function breakdown(sum) {
  const head = el('div', 'meter-sec');
  head.append(el('span', '', 'Breakdown'));
  const cols = sum.models.length > 1 ? [...sum.models, { model: 'Total', total: true, ...sum, priced: sum.cost != null }] : sum.models;
  const table = el('table', 'meter-table');
  const tr = (cells, cls = '') => {
    const row = el('tr', cls);
    cells.forEach((c, i) => row.append(el(i ? 'td' : 'th', '', c)));
    table.append(row);
  };
  const top = el('tr');
  top.append(el('th', ''), ...cols.map((c) => el('th', c.total ? 'total' : '', c.model)));
  table.append(top);
  const speed = (s) => (s ? `${Math.round(s)}/s` : '—');
  tr(['Input', ...cols.map((c) => fmt.int(c.input))]);
  tr(['Output', ...cols.map((c) => fmt.int(c.output))]);
  tr(['Cached', ...cols.map((c) => fmt.int(c.cached))]);
  tr(['Avg speed', ...cols.map((c) => speed(c.speed))]);
  tr(['Cost', ...cols.map((c) => (c.priced ? fmt.usd(c.cost) : '—'))], 'total');
  const scroll = el('div', 'meter-table-wrap');
  scroll.append(table);

  const extra = el('div', 'meter-rows');
  const add = (k, v) => extra.append(el('span', 'k', k), el('span', 'v', v));
  if (sum.growth != null) add('Grows per reply', `~${fmt.int(sum.growth)} tokens`);
  if (sum.nextCost != null) add('Next reply costs about', sum.nextCost === 0 ? 'Free' : `~${fmt.usd(sum.nextCost)}`);
  return [head, scroll, extra];
}
