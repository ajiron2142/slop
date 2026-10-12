import { el } from '../dom.js';
import { renderMarkdown } from '../markdown.js';
import { highlight } from '../highlight.js';
import { fmt, replySpeed } from '../stats.js';
import { copyReply, copySelection } from '../copy.js';

const LABEL = { user: 'You', assistant: 'Assistant', error: 'Error' };
const COPY_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
const CHECK_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L19 7"/></svg>';

// The conversation pane: renders messages, follows the bottom while streaming,
// and handles the Copy (code and whole reply), Retry and Stats buttons. `activity(msg)` gives a reply's
// activity line, shown in place of its "Read …" summary. `codeBlock(lang, text, n, msg)` (the n-th block in that
// language, in the reply msg) lets an add-on show a
// finished reply's code block its own way: { node } replaces it, { note } goes under it. `extra(msg)`
// gives a node to show under a reply's text, and `copyText(msg)` what its Copy button copies.
// `mine(msg)` gives a node to show under one of your messages. While a reply is being written the pane
// has the class "replying".
export function createMessages(pane, { onRetry, activity = () => null, codeBlock = () => null, extra = () => null, copyText = (m) => m.content, mine = () => null }) { // activity, patch, sandbox, edit
  blockHook = codeBlock; // patch
  mineHook = mine; // edit
  extraHook = extra; // sandbox
  copyHook = copyText; // sandbox
  let stick = true;
  const openStats = new Set(); // replies whose Stats card is open, by timestamp
  // Rendered messages, reused while nothing about them has changed. Re-rendering markdown
  // and code colours is the expensive part, so this keeps switching models, toggling
  // settings and finishing a reply quick even in long chats.
  const built = new WeakMap();
  const nodeFor = (m, streaming, showStats) => {
    const act = m.role === 'assistant' ? activity(m) : null; // activity
    if (streaming) return messageNode(m, true, false, act);
    const key = `${m.waiting ? 1 : 0}|${m.content.length}|${m.tools?.length ?? 0}|${m.pictures?.length ?? 0}|${m.stats ? 1 : 0}|${showStats}|${act ? 1 : 0}`; // sandbox: pictures
    const hit = built.get(m);
    if (hit?.key === key) return hit.node;
    const node = messageNode(m, false, showStats && openStats, act);
    built.set(m, { key, node });
    return node;
  };

  // Copying part of the chat copies its words and formatting, not the theme's colours.
  pane.addEventListener('copy', (e) => {
    if (e.target.closest?.('textarea, input')) return; // the Edit box copies as it is
    copySelection(e, pane.ownerDocument.defaultView);
  });

  pane.addEventListener('scroll', () => {
    stick = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 40;
  });

  pane.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'retry') return onRetry();
    if (btn.dataset.action === 'stats') {
      const card = btn.closest('.msg').querySelector('.stats-card');
      card.hidden = !card.hidden;
      btn.setAttribute('aria-expanded', String(!card.hidden));
      const ts = btn.closest('.msg').dataset.ts;
      if (card.hidden) openStats.delete(ts); else { openStats.add(ts); card.scrollIntoView({ block: 'nearest' }); }
      return;
    }
    const code = btn.closest('.code').querySelector('code');
    const label = btn.querySelector('span');
    try {
      await btn.ownerDocument.defaultView.navigator.clipboard.writeText(code.textContent);
      label.textContent = 'Copied';
    } catch {
      label.textContent = 'Failed';
    }
    setTimeout(() => { label.textContent = 'Copy'; }, 1200);
  });

  const follow = () => { if (stick) pane.scrollTop = pane.scrollHeight; };

  return {
    render(messages, streamingMsg, { toBottom = false, showStats = false } = {}) {
      if (toBottom) stick = true;
      pane.classList.toggle('replying', Boolean(streamingMsg));
      // Swapping the children briefly empties the pane, which resets its scroll; keep your place.
      const top = pane.scrollTop;
      pane.replaceChildren(
        ...(messages.length
          ? messages.map((m) => nodeFor(m, m === streamingMsg, showStats))
          : [el('div', 'empty', 'Start a conversation.')]),
      );
      if (!stick) pane.scrollTop = top;
      follow();
    },
    // Re-render only the message that is streaming.
    update(msg) {
      const node = pane.querySelector('.msg.streaming .body');
      if (!node) return;
      fillBody(node, msg, true);
      follow();
    },
  };
}

function messageNode(msg, streaming, openStats, act) {
  const node = el('article', `msg ${msg.role}${streaming ? ' streaming' : ''}${msg.waiting ? ' waiting' : ''}`);
  node.dataset.ts = msg.ts;
  node.append(el('span', 'who', LABEL[msg.role]));
  if (msg.files?.length) node.append(filesNode(msg.files));
  if (act) node.append(act); // activity
  else if (msg.tools?.length) node.append(el('div', 'tool-log', msg.tools.join(' · ')));
  const body = el('div', 'body');
  fillBody(body, msg, streaming);
  node.append(body);
  const more = msg.role === 'assistant' ? extraHook(msg) : null; // sandbox
  if (more) node.append(more);
  const own = msg.role === 'user' ? mineHook(msg) : null; // edit
  if (own) node.append(own);
  if (msg.waiting) node.append(el('div', 'reply-note', 'Goes in when this step finishes.'));
  if (msg.role === 'assistant' && msg.stats?.finish === 'interrupted') node.append(el('div', 'reply-note', 'Interrupted.'));
  if (msg.role === 'assistant' && !streaming && msg.stats?.finish === 'content_filter') {
    node.append(el('div', 'reply-note', 'Blocked: the provider\'s content filter stopped this reply. Your message above and this reply are left out of the chat from now on, so you can carry on; Edit your message to try it again without the part that tripped the filter.'));
  } else if (msg.role === 'assistant' && !streaming && msg.stats?.finish === 'length') {
    node.append(el('div', 'reply-note', 'Cut off: the model reached the most it can write in one reply. Say "continue" to get the rest.'));
  } else if (msg.role === 'assistant' && !streaming && msg.stats && msg.stats.finish !== 'stopped' && msg.stats.finish !== 'interrupted' && !msg.content) {
    node.append(el('div', 'reply-note', `No answer: the model finished without writing anything${msg.stats.reasoned ? ' (it sent only its reasoning, which isn\'t shown)' : ''}.`));
  }
  // Under a finished reply, on the right so they don't read as part of it: Stats (when detailed
  // stats are on), then Copy (when there's something to copy).
  const copyText = msg.role === 'assistant' && !streaming ? copyHook(msg) : ''; // sandbox
  if (msg.role === 'assistant' && !streaming && (copyText || msg.stats)) {
    const actions = el('div', 'reply-actions');
    const stats = openStats && msg.stats ? statsNodes(msg.stats, openStats.has(String(msg.ts))) : [];
    if (stats.length) actions.append(stats[0]);
    if (copyText) actions.append(copyButton(copyText));
    node.append(actions, ...stats.slice(1));
  }
  if (msg.role === 'error') {
    const retry = el('button', 'btn retry', 'Retry');
    retry.dataset.action = 'retry';
    node.append(retry);
  }
  return node;
}

let blockHook = () => null; // patch
let mineHook = () => null; // edit
let extraHook = () => null; // sandbox
let copyHook = (m) => m.content; // sandbox

// Assistant text is markdown (always sanitized); everything else is plain text. While a reply
// streams, its code blocks stay plain; add-ons get them once it's finished.
function fillBody(body, msg, streaming = false) {
  if (msg.role !== 'assistant') {
    body.replaceChildren(msg.content ? el('p', 'plain', msg.content) : '');
    return;
  }
  body.innerHTML = renderMarkdown(msg.content);
  const seen = {}; // blocks so far in each language
  // Each code block gets syntax colours and a header bar (language + Copy) that stays visible while scrolling.
  for (const pre of body.querySelectorAll('pre')) {
    const code = pre.querySelector('code');
    const lang = code?.className.match(/language-([\w+#-]+)/)?.[1] ?? '';
    highlight(code, lang);
    const copy = el('button', 'copy');
    copy.type = 'button';
    copy.dataset.action = 'copy';
    copy.innerHTML = COPY_ICON;
    copy.append(el('span', '', 'Copy'));
    const head = el('div', 'code-head');
    head.append(el('span', 'code-lang', lang), copy);
    const wrap = el('div', 'code');
    pre.replaceWith(wrap);
    wrap.append(head, pre);
    seen[lang] = (seen[lang] ?? 0) + 1;
    const own = streaming ? null : blockHook(lang, code?.textContent ?? '', seen[lang], msg); // patch, svg
    if (own?.node) wrap.replaceWith(own.node);
    else if (own?.note) wrap.after(own.note);
  }
}

function filesNode(files) {
  const row = el('div', 'files');
  for (const f of files) {
    if (f.kind === 'image') {
      const img = el('img', 'file-thumb');
      img.src = f.dataUrl;
      img.alt = f.name;
      row.append(img);
    } else {
      row.append(el('span', 'file-chip', f.name));
    }
  }
  return row;
}

function copyButton(text) {
  const btn = el('button', 'reply-btn copy-reply');
  btn.type = 'button';
  btn.title = 'Copy this reply, formatted for Teams, Outlook and Word';
  const show = (icon, text) => { btn.innerHTML = icon; btn.append(text); };
  show(COPY_ICON, 'Copy');
  btn.addEventListener('click', async () => {
    try {
      await copyReply(text, btn.ownerDocument.defaultView);
      show(CHECK_ICON, 'Copied');
    } catch {
      show(COPY_ICON, 'Copy failed');
    }
    setTimeout(() => show(COPY_ICON, 'Copy'), 1200);
  });
  return btn;
}

// How a reply ended, first in its Stats card: grey when it ended normally, coloured when it didn't.
const FINISH = { stop: ['Completed', ''], tool_calls: ['Completed', ''], length: ['Cut off: hit the length limit', 'bad'], content_filter: ['Blocked by the provider\'s content filter', 'bad'], stopped: ['Stopped by you', 'odd'], interrupted: ['Interrupted by your message', 'odd'] };
const PHASES = [['wait', 'Waiting'], ['think', 'Thinking'], ['tools', 'Tools'], ['write', 'Writing']];
const MIN_PHASE = 72; // px: the narrowest a part of the time bar gets, so its label above fits

// "Stats" button and the card it opens: what one reply used, cost and how long it took.
function statsNodes(s, open) {
  const btn = el('button', 'reply-btn stats-btn', 'ⓘ Stats');
  btn.type = 'button';
  btn.dataset.action = 'stats';
  btn.setAttribute('aria-expanded', String(open));
  const card = el('div', 'stats-card');
  card.hidden = !open;

  const [ended, how] = FINISH[s.finish] ?? [s.finish, 'odd'];
  const head = el('div', 'stats-head');
  head.append(el('span', `stats-end ${how}`.trim(), ended), el('span', 'stats-model', s.model));
  card.append(head);

  const nums = el('div', 'stats-nums');
  const num = (n, unit) => { const span = el('span', null, n); span.append(el('small', null, unit)); nums.append(span); };
  if (s.input != null) num(fmt.int(s.output), 'tokens');
  const speed = s.input != null && replySpeed(s);
  if (speed) num(String(Math.round(speed)), 'tok/s');
  num(fmt.secs(s.ms), 'total');
  if (s.input != null) nums.append(el('span', 'stats-cost', s.cost ? fmt.usd(s.cost.input + s.cost.output) : 'Price unknown'));
  card.append(nums);

  // Time breakdown: each part's name, time and share sit above its piece of the bar. Replies saved
  // before slop recorded the parts have only the total.
  const parts = s.time ? PHASES.filter(([k]) => s.time[k] > 0) : [];
  if (parts.length) {
    const total = parts.reduce((sum, [k]) => sum + s.time[k], 0);
    const bar = el('div', 'stats-time');
    bar.style.gridTemplateColumns = parts.map(([k]) => `minmax(${MIN_PHASE}px, ${s.time[k]}fr)`).join(' ');
    for (const [k, name] of parts) {
      const part = el('div', `stats-part ${k}`);
      const time = el('div', 'stats-part-time', fmt.secs(s.time[k]));
      time.append(el('small', null, `${Math.round((s.time[k] / total) * 100)}%`));
      part.append(el('div', 'stats-part-name', name), time, el('div', 'stats-seg'));
      bar.append(part);
    }
    card.append(statsLabel('Time breakdown'), bar);
  }

  if (s.input != null) {
    const pct = s.limit && (s.context / s.limit) * 100;
    card.append(statsLabel('Context', s.limit ? `${fmt.int(s.context)} of ${fmt.int(s.limit)} · ${pct > 0 && pct < 1 ? '<1' : Math.round(pct)}%` : `${fmt.int(s.context)} · limit unknown`));
    if (s.limit) {
      const ctx = el('div', 'stats-ctx');
      const fill = el('span');
      fill.style.width = `${Math.min(100, (s.context / s.limit) * 100)}%`;
      ctx.append(fill);
      card.append(ctx);
    }
    if (s.cached) card.append(el('div', 'stats-foot', `${fmt.int(s.cached)} of ${fmt.int(s.input)} tokens in were cached`));
  } else {
    card.append(el('div', 'stats-foot', 'Token counts arrive at the end of a reply, so a stopped one has none.'));
  }
  return [btn, card];
}

function statsLabel(name, value) {
  const label = el('div', 'stats-label', name);
  if (value) label.append(el('span', null, value));
  return label;
}
