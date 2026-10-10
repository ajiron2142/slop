import { el } from './dom.js';

// The reply's tree (optional add-on to the activity add-on): beside the opened steps, a small tree of
// where the reply went: you, the model, each place this chat has connected (a folder, a GitLab
// project, pasted text), and the reply last. Each place shows one ring per call, in order: green
// worked, red failed, filling while it runs, grey for the model's thinking; a red badge counts a
// place's failures. While the reply runs, the line to the place in use moves and everything but
// what's happening now is faded. Point at, click or tap a box, ring or step to pick out its partners;
// click it again, or empty space, to show everything. It draws only what activity.js already
// recorded, so it lives and goes with that: memory only, nothing sent to the model.
//
// Rules, all fixed: a call belongs to the place whose tools include its name, or to the model when
// none does; places are listed in the order first used, unused ones last; a call failed when its
// result starts with "Error:", and a place's badge counts them up to 9, then says 9+ (it's always a
// circle); the reply box says how the reply ended, never what a tool did. Below 640px wide the tree
// goes above the steps.
//
// To remove it: delete this file and styles/components/flow.css, their lines in index.html and
// tests/run.mjs, tests/suites/flow.mjs, and the lines marked "flow" in activity.js and main.js.

const RING = '<svg viewBox="0 0 10 10" aria-hidden="true"><circle class="flow-track" cx="5" cy="5" r="4"/><circle class="flow-fill" cx="5" cy="5" r="4"/></svg>';
const SVG = 'http://www.w3.org/2000/svg';
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;

// For activity.js: called once per reply with its record; returns { node, draw }.
export function createFlow({ now = () => performance.now() } = {}) {
  return (r) => {
    const node = el('div', 'act-flow');
    const tree = el('div', 'flow-tree');
    const wires = document.createElementNS(SVG, 'svg');
    wires.setAttribute('class', 'flow-wires');
    wires.setAttribute('aria-hidden', 'true');
    const kids = el('div', 'flow-kids');
    const boxes = new Map(); // id → its parts
    const paths = new Map(); // id of the box a line leads to → the line
    const marks = new Map(); // step → its ring
    let hover = null; // { step } or { box }: what the mouse is over
    let pick = null; // the same, clicked or tapped
    let order = '';

    const makeBox = (id, kind) => {
      const ui = { node: el('div', 'flow-box'), kind: el('span', 'flow-kind', kind), name: el('span', 'flow-name'), meta: el('span', 'flow-meta'), marks: el('span', 'flow-marks'), badge: el('span', 'flow-badge') };
      ui.node.dataset.flowBox = id;
      ui.node.append(ui.badge, ui.kind, ui.name, ui.meta, ui.marks);
      boxes.set(id, ui);
      return ui;
    };
    tree.append(wires, makeBox('you', 'You').node, makeBox('model', 'Model').node, kids);
    node.append(tree);

    // Which box a step belongs to.
    const placeOf = (s) => (s.kind === 'think' ? 'model' : r.places.find((p) => p.tools.includes(s.name))?.id ?? 'model');
    const focusBox = (f) => (f?.step != null ? placeOf(r.steps[f.step]) : f?.box ?? null);
    // While it runs and nothing is picked, what's happening now stands out.
    const current = () => {
      if (r.ended != null) return null;
      if (r.state === 'tool' || r.state === 'think') return { step: r.steps.length - 1 };
      return { box: r.state === 'write' ? 'reply' : 'model' };
    };

    function draw() {
      const shown = r.open && r.places.length > 0;
      r.node.classList.toggle('has-flow', r.places.length > 0);
      node.hidden = !shown;
      if (!shown) return;
      const t = now();
      const ended = r.ended != null;
      const at = r.steps.map(placeOf);

      // The places: first used first, the rest in the order they were connected.
      for (const p of r.places) if (!boxes.has(p.id)) makeBox(p.id, p.kind);
      if (!boxes.has('reply')) makeBox('reply', 'Reply');
      const used = r.places.filter((p) => at.includes(p.id)).sort((a, b) => at.indexOf(a.id) - at.indexOf(b.id));
      const ids = [...used, ...r.places.filter((p) => !used.includes(p))].map((p) => p.id).concat('reply');
      if (ids.join() !== order) { order = ids.join(); kids.replaceChildren(...ids.map((id) => boxes.get(id).node)); }

      const focus = hover ?? pick ?? current();
      const fb = focusBox(focus);
      const stateOf = {};
      for (const [id, ui] of boxes) {
        const mine = r.steps.filter((s, i) => at[i] === id);
        const calls = mine.filter((s) => s.kind === 'tool');
        const failed = calls.filter((s) => s.failed).length;
        const busy = !ended && mine.some((s) => s.t1 == null) || (!ended && ((id === 'model' && r.state === 'wait') || (id === 'reply' && r.state === 'write')));
        const place = r.places.find((p) => p.id === id);
        let state = busy ? 'on' : mine.length || id === 'you' ? 'done' : 'wait';
        if (id === 'reply' && ended) state = r.finish === 'stopped' ? 'stopped' : r.finish ? 'done' : 'bad';
        stateOf[id] = state;
        ui.node.className = `flow-box ${state}${failed ? ' has-bad' : ''}${fb && fb !== id ? ' flow-dim' : ''}`;
        if (id === 'you') ui.name.textContent = 'Your message';
        else if (id === 'model') {
          ui.name.textContent = r.model;
          const thought = mine.filter((s) => s.kind === 'think').reduce((sum, s) => sum + ((s.t1 ?? t) - s.t0), 0);
          ui.meta.textContent = thought ? `thought ${secs(thought)}` : '';
        } else if (id === 'reply') {
          ui.name.textContent = { on: 'Writing', done: 'Written', stopped: 'Stopped', bad: 'Didn\'t finish', wait: 'Not started' }[state];
        } else {
          ui.name.textContent = place.name;
          ui.meta.textContent = [place.sub, calls.length ? `${calls.length} call${calls.length === 1 ? '' : 's'}` : ended ? 'not used' : ''].filter(Boolean).join(' · ');
        }
        ui.meta.hidden = !ui.meta.textContent;
        ui.badge.textContent = failed > 9 ? '9+' : failed || ''; // always a circle, so never more than two characters
        ui.badge.title = failed ? `${failed} call${failed === 1 ? '' : 's'} failed` : '';
        // One ring per step, kept between draws so a filling ring keeps filling.
        for (const s of mine) {
          let mk = marks.get(s);
          if (!mk) { mk = el('span', 'flow-mk'); mk.dataset.step = r.steps.indexOf(s); marks.set(s, mk); ui.marks.append(mk); }
          const running = s.t1 == null && !ended;
          mk.className = `flow-mk${running ? ' run' : s.failed ? ' bad' : s.kind === 'think' ? ' think' : ''}`;
          if (running && !mk.firstChild) mk.innerHTML = RING;
          if (!running && mk.firstChild) mk.replaceChildren();
          mk.title = s.kind === 'think' ? 'Thinking' : s.label ?? `Running ${s.name}`;
        }
        ui.marks.hidden = !mine.length;
      }

      // The steps beside it fade the same way.
      r.steps.forEach((s, i) => {
        const dim = Boolean(focus) && !(focus.step === i || (focus.box != null && at[i] === focus.box));
        s.ui?.row.classList.toggle('flow-dim', dim);
        s.ui?.box?.classList.toggle('flow-dim', dim);
      });
      wire(stateOf, fb);
    }

    // One line down the left, from you to the model, then branching right into each box under it.
    function wire(stateOf, fb) {
      const base = tree.getBoundingClientRect();
      const box = (id) => { const b = boxes.get(id).node.getBoundingClientRect(); return { l: b.left - base.left, t: b.top - base.top, b: b.bottom - base.top, m: b.top - base.top + b.height / 2 }; };
      const model = box('model'), you = box('you'), x = model.l + 14;
      wires.setAttribute('width', tree.scrollWidth);
      wires.setAttribute('height', tree.scrollHeight);
      const line = (id, d, state) => {
        let p = paths.get(id);
        if (!p) { p = document.createElementNS(SVG, 'path'); paths.set(id, p); wires.append(p); }
        p.setAttribute('d', d);
        p.setAttribute('class', `${state}${fb && fb !== id ? ' flow-dim' : ''}`);
      };
      line('model', `M${x},${you.b} L${x},${model.t}`, 'done');
      for (const id of order.split(',')) {
        const q = box(id);
        line(id, `M${x},${model.b} L${x},${q.m - 6} Q${x},${q.m} ${x + 6},${q.m} L${q.l},${q.m}`, stateOf[id] === 'on' ? 'on' : stateOf[id] === 'wait' ? 'wait' : 'done');
      }
    }

    // Point at, click or tap: a box picks its place, a ring or a step picks that step.
    const target = (e) => {
      const step = e.target.closest('.flow-mk, .act-step');
      if (step) return { step: Number(step.dataset.step) };
      const box = e.target.closest('.flow-box');
      return box ? { box: box.dataset.flowBox } : null;
    };
    const same = (a, b) => (a && b ? a.step === b.step && a.box === b.box : a === b);
    r.node.addEventListener('pointerover', (e) => { if (e.pointerType !== 'mouse') return; const f = target(e); if (!same(f, hover)) { hover = f; draw(); } });
    r.node.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && hover) { hover = null; draw(); } });
    r.node.addEventListener('click', (e) => {
      if (e.target.closest('.act-head, .act-box')) return;
      const f = target(e);
      pick = !f || same(f, pick) ? null : f;
      draw();
    });

    return { node, draw };
  };
}
