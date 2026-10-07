import { el } from '../dom.js';
import { fmt } from '../stats.js';

// The usage meter above the message box: "13% · $0.04". Clicking it opens a summary of the
// chat's context and cost; with "Show detailed stats" on, it adds a per-model breakdown.
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
    render(sum, detailed) {
      row.hidden = !sum;
      if (!sum) { toggle(false); return; }
      ring.style.setProperty('--p', `${sum.percent ?? 0}%`);
      ring.hidden = sum.percent == null;
      label.textContent = [
        sum.percent != null ? `${sum.percent}%` : `${fmt.short(sum.context)} tokens`,
        sum.cost != null && fmt.usdShort(sum.cost),
      ].filter(Boolean).join(' · ');
      pop.replaceChildren(...context(sum), ...cost(sum), ...(detailed ? details(sum) : []));
    },
  };
}

const section = (title, right) => {
  const head = el('div', 'meter-sec');
  head.append(el('span', '', title));
  if (right) head.append(el('b', 'meter-big', right));
  return head;
};

function rows(pairs, className = 'meter-rows') {
  const box = el('div', className);
  for (const [k, v, cls = ''] of pairs) box.append(el('span', `k ${cls}`, k), el('span', `v ${cls}`, v));
  return box;
}

function context(sum) {
  if (sum.limit == null) return [section('Context'), el('div', 'meter-cap', `${fmt.int(sum.context)} tokens`)];
  const bar = el('div', 'meter-bar');
  bar.style.setProperty('--p', `${sum.percent}%`);
  return [section('Context', `${sum.percent}%`), bar, el('div', 'meter-cap', `${fmt.int(sum.context)} of ${fmt.int(sum.limit)} tokens`)];
}

function cost(sum) {
  if (sum.cost == null && sum.models.every((m) => !m.priced)) return [];
  const priced = (m) => (m.priced ? fmt.usd(m.cost) : '—');
  const lines = sum.models.length > 1 ? sum.models.map((m) => [m.model, priced(m)]) : [];
  lines.push(['Total', sum.cost == null ? '—' : fmt.usd(sum.cost), 'total']);
  return [section('Cost'), rows(lines)];
}

function details(sum) {
  const table = el('table', 'meter-table');
  const head = el('tr');
  for (const h of ['Model', 'Replies', 'In / out', 'Avg speed']) head.append(el('th', '', h));
  table.append(head);
  const line = (cells, cls) => {
    const tr = el('tr', cls);
    for (const c of cells) tr.append(el('td', '', c));
    table.append(tr);
  };
  const speed = (s) => (s ? `${Math.round(s)} tok/s` : '—');
  for (const m of sum.models) line([m.model, String(m.replies), `${fmt.int(m.input)} / ${fmt.int(m.output)}`, speed(m.speed)]);
  if (sum.models.length > 1) line(['Total', String(sum.replies), `${fmt.int(sum.input)} / ${fmt.int(sum.output)}`, speed(sum.speed)], 'total');

  const extra = [];
  if (sum.growth != null) extra.push(['Grows per reply', `~${fmt.int(sum.growth)} tokens`]);
  extra.push(['Next message sends', `~${fmt.int(sum.context)} tokens`]);
  if (sum.nextCost != null) extra.push(['Next reply costs about', sum.nextCost === 0 ? 'Free' : `~${fmt.usd(sum.nextCost)}`]);

  const wrap = el('div', 'meter-details');
  wrap.append(section('This chat in detail'), table, rows(extra));
  return [wrap];
}
