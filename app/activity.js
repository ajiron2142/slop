import { el } from './dom.js';

// What a reply did (optional add-on): a folded line under "Assistant" that says what is happening
// right now ("Waiting for claude-haiku 1.2s", "Thinking", "Running gitlab_read"), and once the reply
// is done, how many steps it took. Open it for every step with its time; open a step for exactly what
// was asked and what came back, or the model's thinking. Everything stays in this tab's memory: after
// a reload a reply shows only its saved one-line summary, as it does without this add-on. None of it
// is sent to the model.
//
// Rules, all fixed: a step is one tool call (✓, or ✕ when its result starts with "Error:") or one
// stretch of thinking, which appears only when the model sends reasoning; times are this browser's
// clock; an opened step is at most 200px tall and scrolls, nothing in it is cut; click in it and
// Ctrl+A selects just that step.
//
// To remove it: delete this file and styles/components/activity.css, their lines in index.html and
// tests/run.mjs, tests/suites/activity.mjs, and the lines marked "activity" in main.js, api.js and
// components/messages.js. The reply's tree (flow.js) builds on this one; remove it first.

const MAX_BOX = 200; // px, an opened step's most height

export function createActivity({ now = () => performance.now(), flow = null } = {}) { // flow
  const replies = new Map(); // `${chat id}:${message ts}` → what that reply did
  let timer = 0;

  const secs = (ms) => (ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`);
  const size = (text) => {
    const bytes = new TextEncoder().encode(text).length;
    const lines = text ? text.split('\n').length : 0;
    const amount = bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${lines} line${lines === 1 ? '' : 's'}, ${amount}`;
  };

  function draw(r) {
    const running = r.ended == null;
    const t = now();
    const tools = r.steps.filter((s) => s.kind === 'tool').length;
    const thinks = r.steps.filter((s) => s.kind === 'think');
    const thought = thinks.reduce((sum, s) => sum + ((s.t1 ?? t) - s.t0), 0);
    const doing = { wait: `Waiting for ${r.model}`, think: 'Thinking', write: 'Writing', tool: `Running ${r.steps.at(-1)?.name ?? ''}` }[r.state];
    const done = [tools && `${tools} step${tools === 1 ? '' : 's'}`, thinks.length && `thought ${secs(thought)}`, r.finish === 'stopped' && 'stopped'].filter(Boolean).join(' · ');
    r.ui.tw.textContent = r.open ? '▾' : '▸';
    r.ui.spin.hidden = !running;
    r.ui.text.textContent = running ? doing : done;
    r.ui.time.textContent = secs((running ? t - r.since : r.ended - r.t0));
    r.ui.head.setAttribute('aria-expanded', String(r.open));
    r.ui.list.hidden = !r.open;
    r.steps.forEach((s, i) => drawStep(r, s, i, t));
    r.flow?.draw(); // flow
  }

  function drawStep(r, s, i, t) {
    if (!s.ui) {
      const row = el('button', 'act-row act-step');
      row.type = 'button';
      row.dataset.step = i;
      const ui = { row, tw: el('span', 'act-tw'), mark: el('span', 'act-mark'), name: el('span', 'act-name'), time: el('span', 'act-time'), box: null };
      row.append(ui.tw, ui.mark, ui.name, ui.time);
      s.ui = ui;
      r.ui.list.append(row);
    }
    const { ui } = s;
    const busy = s.t1 == null;
    ui.tw.textContent = s.open ? '▾' : '▸';
    ui.mark.className = busy ? 'act-mark act-spin' : 'act-mark';
    ui.mark.textContent = busy ? '' : s.failed ? '✕' : '✓';
    ui.name.textContent = s.kind === 'think' ? 'Thinking' : s.label ? `${s.label} · ${size(s.result)}` : `Running ${s.name}`;
    ui.time.textContent = secs((s.t1 ?? t) - s.t0);
    ui.row.setAttribute('aria-expanded', String(Boolean(s.open)));
    ui.row.dataset.label = s.label ?? '';
    if (!s.open) { if (ui.box) ui.box.hidden = true; return; }
    if (!ui.box) {
      // A read-only text box, so Ctrl+A inside it selects just this step.
      ui.box = el('textarea', `act-box${s.kind === 'think' ? ' think' : ''}`);
      ui.box.readOnly = true;
      ui.box.rows = 1; // it grows to fit, up to MAX_BOX
      ui.box.spellcheck = false;
      ui.box.addEventListener('scroll', () => { s.scroll = ui.box.scrollTop; });
      ui.row.after(ui.box);
    }
    ui.box.hidden = false;
    const text = s.kind === 'think' ? s.text : `${s.name} ${s.args}\n${s.result == null ? '(running)' : `→ ${size(s.result)}\n\n${s.result}`}`;
    if (ui.box.value !== text) {
      ui.box.value = text;
      ui.box.style.height = 'auto';
      ui.box.style.height = `${Math.min(ui.box.scrollHeight + 2, MAX_BOX)}px`;
    }
  }

  function tick() {
    const live = [...replies.values()].filter((r) => r.ended == null);
    for (const r of live) draw(r);
    if (!live.length) { clearInterval(timer); timer = 0; }
  }

  return {
    // A new reply: returns what the reply loop calls as things happen.
    start(chatId, msg, model) {
      const node = el('div', 'activity');
      const head = el('button', 'act-row act-head');
      head.type = 'button';
      const r = { model, t0: now(), since: now(), state: 'wait', ended: null, finish: null, open: false, steps: [], node, places: [] }; // flow: places
      r.ui = { head, tw: el('span', 'act-tw'), spin: el('span', 'act-mark act-spin'), text: el('span', 'act-name'), time: el('span', 'act-time'), list: el('div', 'act-list') };
      head.append(r.ui.tw, r.ui.spin, r.ui.text, r.ui.time);
      node.append(head, r.ui.list);
      r.flow = flow?.(r); // flow
      if (r.flow) node.append(r.flow.node); // flow
      node.addEventListener('click', (e) => {
        const row = e.target.closest('.act-row');
        if (!row) return;
        if (row === head) r.open = !r.open;
        else { const s = r.steps[row.dataset.step]; s.open = !s.open; }
        draw(r);
      });
      replies.set(`${chatId}:${msg.ts}`, r);
      timer ||= setInterval(tick, 250);
      draw(r);
      const set = (state) => { if (r.state !== state) { r.state = state; r.since = now(); } };
      const closeThinking = () => { const s = r.steps.at(-1); if (s?.kind === 'think' && s.t1 == null) s.t1 = now(); };
      return {
        places(list) { r.places = list; draw(r); }, // flow: what this reply can reach, for the tree
        asking() { closeThinking(); set('wait'); draw(r); },
        thinking(delta) {
          let s = r.steps.at(-1);
          if (s?.kind !== 'think' || s.t1 != null) r.steps.push(s = { kind: 'think', text: '', t0: now(), t1: null });
          s.text += delta;
          set('think');
          if (s.open) draw(r);
        },
        writing() { if (r.state === 'write') return; closeThinking(); set('write'); draw(r); },
        tool(call) {
          closeThinking();
          const s = { kind: 'tool', name: call.function.name, args: call.function.arguments || '{}', t0: now(), t1: null, label: null, result: null };
          r.steps.push(s);
          set('tool');
          draw(r);
          return (label, result) => { Object.assign(s, { label, result, t1: now(), failed: result.startsWith('Error:') }); draw(r); };
        },
        end(finish) { closeThinking(); r.ended = now(); r.finish = finish; draw(r); },
      };
    },
    // The folded line for a reply, or null when there's nothing to show (no activity this tab, or a
    // finished reply that used no tools and didn't think).
    node(chatId, msg) {
      const r = replies.get(`${chatId}:${msg.ts}`);
      if (!r || (r.ended != null && !r.steps.length)) return null;
      // Moving it into a redrawn message resets the boxes' scroll; put each back once it's in place.
      queueMicrotask(() => { for (const s of r.steps) if (s.ui?.box && s.scroll) s.ui.box.scrollTop = s.scroll; });
      return r.node;
    },
  };
}
