// sandbox: the helpers the model's code can use, besides show(). runner.js turns this function into
// part of each Worker's source, so they run inside the sandbox like the model's own code.
//
//   el(tag, attrs, ...children)  one SVG element; text children are escaped, elements are kept
//   svg(width, height, ...children)  a whole picture, ready for show()
//   chart.bar(rows, options), chart.line(rows, options)  rows like [['Mon', 3], ['Tue', 5]], or
//     [['Mon', 3, 4], …] with options.names for more than one series; options.title, width, height
//   table(rows)  a markdown table from arrays (the first row is the header) or from objects
//   random(seed)  a function giving the same numbers in [0, 1) for the same seed
//
// Every picture is drawn for white: slop shows pictures on white in every theme.

function sandboxHelpers(self) {
  const INK = '#1f2328';
  const MUTED = '#59636e';
  const GRID = '#e5e7eb';
  const AXIS = '#c9d1d9';
  const SERIES = ['#3b78c4', '#e08a2c', '#3a9a5b', '#c4423a', '#7d5bb6'];
  const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif';

  // Markup made by el() is kept as it is when it's a child; any other text is escaped.
  class Markup {
    constructor(text) { this.text = text; }
    toString() { return this.text; }
  }
  const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const child = (c) => (c == null || c === false ? '' : Array.isArray(c) ? c.map(child).join('') : c instanceof Markup ? c.text : escape(c));

  function el(tag, attrs = {}, ...children) {
    if (typeof tag !== 'string' || !/^[a-zA-Z][\w:-]*$/.test(tag)) throw new Error('el() takes a tag name first, like el(\'rect\', { width: 10, height: 10 }).');
    const list = Object.entries(attrs ?? {}).filter(([, v]) => v != null && v !== false).map(([k, v]) => ` ${k}="${escape(v)}"`).join('');
    const inner = children.map(child).join('');
    return new Markup(inner ? `<${tag}${list}>${inner}</${tag}>` : `<${tag}${list}/>`);
  }

  function svg(width, height, ...children) {
    if (!(width > 0 && height > 0)) throw new Error('svg() takes a width and height above 0 first, like svg(400, 200, el(\'circle\', { cx: 20, cy: 20, r: 10 })).');
    return el('svg', { xmlns: 'http://www.w3.org/2000/svg', width, height, viewBox: `0 0 ${width} ${height}`, 'font-family': FONT }, el('rect', { width, height, fill: '#ffffff' }), ...children);
  }

  // Rows like [['Mon', 3], ['Tue', 5]]: a label, then one number per series. Refused otherwise.
  function checkRows(name, rows, names) {
    const form = `${name}() takes rows like [['Mon', 3], ['Tue', 5]]: a label, then one number per series (at most ${SERIES.length}), the same count in every row.`;
    if (!Array.isArray(rows) || !rows.length || !rows.every((r) => Array.isArray(r) && r.length >= 2)) throw new Error(form);
    const count = rows[0].length - 1;
    if (count > SERIES.length || !rows.every((r) => r.length === count + 1 && r.slice(1).every((v) => typeof v === 'number' && Number.isFinite(v)))) throw new Error(form);
    if (names != null && (!Array.isArray(names) || names.length !== count)) throw new Error(`${name}()'s options.names needs one name per series: ${count} here.`);
    return count;
  }

  // An axis from 0 (or below, for negatives) in steps of 1, 2 or 5 × a power of ten, about 5 of them.
  function axis(values) {
    const lo = Math.min(0, ...values);
    const hi = Math.max(0, ...values);
    const span = hi - lo || 1;
    const raw = span / 5;
    const p = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw);
    const min = Math.floor(lo / step) * step;
    const max = Math.ceil(hi / step) * step || step;
    const ticks = [];
    for (let v = min; v <= max + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
    return { min, max, ticks };
  }
  const short = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

  // The frame both charts share: title, legend, gridlines with their numbers, labels under the plot.
  function frame(name, rows, options) {
    const { title = '', names = null, width = 480, height = 260 } = options ?? {};
    const count = checkRows(name, rows, names);
    const top = (title ? 34 : 14) + (names ? 20 : 0);
    const plot = { left: 44, right: width - 14, top, bottom: height - 30 };
    const y = axis(rows.flatMap((r) => r.slice(1)));
    const yAt = (v) => plot.bottom - ((v - y.min) / (y.max - y.min)) * (plot.bottom - plot.top);
    const parts = [];
    if (title) parts.push(el('text', { x: 12, y: 22, 'font-size': 14, 'font-weight': 600, fill: INK }, title));
    if (names) {
      let x = 12;
      names.forEach((n, i) => {
        parts.push(el('rect', { x, y: top - 22, width: 10, height: 10, rx: 2, fill: SERIES[i] }), el('text', { x: x + 14, y: top - 13, 'font-size': 11.5, fill: MUTED }, n));
        x += 26 + String(n).length * 6.5;
      });
    }
    for (const t of y.ticks) {
      parts.push(el('line', { x1: plot.left, x2: plot.right, y1: yAt(t), y2: yAt(t), stroke: t === 0 ? AXIS : GRID }));
      parts.push(el('text', { x: plot.left - 6, y: yAt(t) + 4, 'font-size': 11, 'text-anchor': 'end', fill: MUTED }, short.format(t)));
    }
    return { count, plot, yAt, parts, width, height };
  }

  function bar(rows, options) {
    const f = frame('chart.bar', rows, options);
    const slot = (f.plot.right - f.plot.left) / rows.length;
    const group = slot * 0.7;
    const each = group / f.count;
    rows.forEach((r, i) => {
      const x0 = f.plot.left + i * slot + (slot - group) / 2;
      r.slice(1).forEach((v, s) => {
        const y1 = f.yAt(Math.max(v, 0));
        f.parts.push(el('rect', { x: x0 + s * each, y: y1, width: Math.max(each - 2, 1), height: Math.abs(f.yAt(v) - f.yAt(0)), rx: 2, fill: SERIES[s] }));
      });
      f.parts.push(el('text', { x: f.plot.left + (i + 0.5) * slot, y: f.plot.bottom + 18, 'font-size': 11, 'text-anchor': 'middle', fill: MUTED }, r[0]));
    });
    return svg(f.width, f.height, f.parts);
  }

  function line(rows, options) {
    const f = frame('chart.line', rows, options);
    const xAt = (i) => (rows.length === 1 ? (f.plot.left + f.plot.right) / 2 : f.plot.left + 8 + (i * (f.plot.right - f.plot.left - 16)) / (rows.length - 1));
    const every = Math.ceil(rows.length / 12); // at most about 12 labels under the plot
    rows.forEach((r, i) => {
      if (i % every === 0) f.parts.push(el('text', { x: xAt(i), y: f.plot.bottom + 18, 'font-size': 11, 'text-anchor': 'middle', fill: MUTED }, r[0]));
    });
    for (let s = 0; s < f.count; s++) {
      const points = rows.map((r, i) => `${xAt(i).toFixed(1)},${f.yAt(r[s + 1]).toFixed(1)}`).join(' ');
      f.parts.push(el('polyline', { points, fill: 'none', stroke: SERIES[s], 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      if (rows.length <= 24) rows.forEach((r, i) => f.parts.push(el('circle', { cx: xAt(i), cy: f.yAt(r[s + 1]), r: 2.5, fill: SERIES[s] })));
    }
    return svg(f.width, f.height, f.parts);
  }

  // A markdown table. Arrays: the first row is the header. Objects: their keys are the header.
  function table(rows) {
    const form = 'table() takes rows like [[\'Name\', \'Count\'], [\'a\', 1]] (the first row is the header) or [{ Name: \'a\', Count: 1 }].';
    if (!Array.isArray(rows) || !rows.length) throw new Error(form);
    let grid;
    if (rows.every(Array.isArray)) grid = rows;
    else if (rows.every((r) => r && typeof r === 'object')) {
      const keys = [...new Set(rows.flatMap(Object.keys))];
      grid = [keys, ...rows.map((r) => keys.map((k) => r[k] ?? ''))];
    } else throw new Error(form);
    const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const width = Math.max(...grid.map((r) => r.length));
    const line = (r) => `| ${Array.from({ length: width }, (_, i) => cell(r[i])).join(' | ')} |`;
    return [line(grid[0]), `|${' --- |'.repeat(width)}`, ...grid.slice(1).map(line)].join('\n');
  }

  // mulberry32: small, fast, and the same numbers for the same seed everywhere.
  function random(seed) {
    if (!Number.isInteger(seed)) throw new Error('random() takes a whole number as its seed, like random(42).');
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  Object.assign(self, { el, svg, chart: { bar, line }, table, random });
  return Markup;
}
