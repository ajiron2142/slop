import { el } from '../dom.js';
import { renderMarkdown } from '../markdown.js';
import { highlight } from '../highlight.js';
import { fmt, replySpeed } from '../stats.js';
import { copyReply } from '../copy.js';

const LABEL = { user: 'You', assistant: 'Assistant', error: 'Error' };
const COPY_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
const CHECK_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L19 7"/></svg>';

// The conversation pane: renders messages, follows the bottom while streaming,
// and handles the Copy (code and whole reply), Retry and Stats buttons. `extra(msg)` lets an add-on put content of its own
// under a reply's text, as { key, node }; the key says when it needs redrawing.
export function createMessages(pane, { onRetry, extra = () => null }) {
  let stick = true;
  const openStats = new Set(); // replies whose Stats card is open, by timestamp
  // Rendered messages, reused while nothing about them has changed. Re-rendering markdown
  // and code colours is the expensive part, so this keeps switching models, toggling
  // settings and finishing a reply quick even in long chats.
  const built = new WeakMap();
  const nodeFor = (m, streaming, showStats) => {
    const more = extra(m);
    if (streaming) return messageNode(m, true, false, more);
    const key = `${m.content.length}|${m.tools?.length ?? 0}|${m.stats ? 1 : 0}|${showStats}|${more?.key ?? ''}`;
    const hit = built.get(m);
    if (hit?.key === key) return hit.node;
    const node = messageNode(m, false, showStats && openStats, more);
    built.set(m, { key, node });
    return node;
  };

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
      fillBody(node, msg);
      follow();
    },
  };
}

function messageNode(msg, streaming, openStats, more) {
  const node = el('article', `msg ${msg.role}${streaming ? ' streaming' : ''}`);
  node.dataset.ts = msg.ts;
  node.append(el('span', 'who', LABEL[msg.role]));
  if (msg.files?.length) node.append(filesNode(msg.files));
  if (msg.tools?.length) node.append(el('div', 'tool-log', msg.tools.join(' · ')));
  const body = el('div', 'body');
  fillBody(body, msg);
  node.append(body);
  if (more) node.append(more.node);
  if (msg.role === 'assistant' && !streaming && msg.stats?.finish === 'length') {
    node.append(el('div', 'reply-note', 'Cut off: the model reached the most it can write in one reply. Say "continue" to get the rest.'));
  }
  // Under a finished reply, on the right so they don't read as part of it: Stats (when detailed
  // stats are on), then Copy.
  if (msg.role === 'assistant' && !streaming && msg.content) {
    const actions = el('div', 'reply-actions');
    const stats = openStats && msg.stats ? statsNodes(msg.stats, openStats.has(String(msg.ts))) : [];
    if (stats.length) actions.append(stats[0]);
    actions.append(copyButton(msg));
    node.append(actions, ...stats.slice(1));
  }
  if (msg.role === 'error') {
    const retry = el('button', 'btn retry', 'Retry');
    retry.dataset.action = 'retry';
    node.append(retry);
  }
  return node;
}

// Assistant text is markdown (always sanitized); everything else is plain text.
function fillBody(body, msg) {
  if (msg.role !== 'assistant') {
    body.replaceChildren(msg.content ? el('p', 'plain', msg.content) : '');
    return;
  }
  body.innerHTML = renderMarkdown(msg.content);
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

function copyButton(msg) {
  const btn = el('button', 'reply-btn copy-reply');
  btn.type = 'button';
  btn.title = 'Copy this reply, formatted for Teams, Outlook and Word';
  const show = (icon, text) => { btn.innerHTML = icon; btn.append(text); };
  show(COPY_ICON, 'Copy');
  btn.addEventListener('click', async () => {
    try {
      await copyReply(msg.content, btn.ownerDocument.defaultView);
      show(CHECK_ICON, 'Copied');
    } catch {
      show(COPY_ICON, 'Copy failed');
    }
    setTimeout(() => show(COPY_ICON, 'Copy'), 1200);
  });
  return btn;
}

const FINISH = { stop: 'Complete', length: 'Cut off (length limit)', stopped: 'Stopped by you', tool_calls: 'Complete' };

// "Stats" button and the card it opens: what one reply used, cost and how long it took.
function statsNodes(s, open) {
  const btn = el('button', 'reply-btn stats-btn', 'ⓘ Stats');
  btn.type = 'button';
  btn.dataset.action = 'stats';
  btn.setAttribute('aria-expanded', String(open));
  const card = el('div', 'stats-card');
  card.hidden = !open;
  const rows = [['Model', s.model]];
  if (s.input != null) {
    rows.push(['Tokens', `${fmt.int(s.input)} in + ${fmt.int(s.output)} out = ${fmt.int(s.input + s.output)}`]);
    if (s.cached) rows.push(['Cached', `${fmt.int(s.cached)} of ${fmt.int(s.input)} in`]);
    rows.push(['Context', s.limit ? `${fmt.int(s.context)} of ${fmt.int(s.limit)} (${Math.round((s.context / s.limit) * 100)}%)` : fmt.int(s.context)]);
    const speed = replySpeed(s);
    if (speed) rows.push(['Speed', `${Math.round(speed)} tok/s`]);
  }
  rows.push(['Time', s.firstMs ? `${fmt.secs(s.firstMs)} to start · ${fmt.secs(s.ms)} total` : `${fmt.secs(s.ms)} total`]);
  if (s.files) rows.push(['Folder', `Read ${s.files} file${s.files > 1 ? 's' : ''} in ${s.rounds} round${s.rounds > 1 ? 's' : ''}`]);
  if (s.cost) {
    const total = s.cost.input + s.cost.output;
    rows.push(['Cost', total === 0 ? 'Free' : `${fmt.usd(s.cost.input)} in + ${fmt.usd(s.cost.output)} out = ${fmt.usd(total)}`]);
  }
  rows.push(['Finished', FINISH[s.finish] ?? s.finish, s.finish === 'length' ? 'warn' : '']);
  if (s.input == null) rows.push(['', 'Token counts arrive at the end of a reply, so a stopped one has none.', 'note']);
  for (const [k, v, cls = ''] of rows) card.append(el('span', `k ${cls}`, k), el('span', `v ${cls}`, v));
  return [btn, card];
}
