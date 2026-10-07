import { el } from '../dom.js';
import { renderMarkdown } from '../markdown.js';

const LABEL = { user: 'You', assistant: 'Assistant', error: 'Error' };
const COPY_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';

// The conversation pane: renders messages, follows the bottom while streaming,
// and handles the Copy and Retry buttons.
export function createMessages(pane, { onRetry }) {
  let stick = true;

  pane.addEventListener('scroll', () => {
    stick = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 40;
  });

  pane.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'retry') return onRetry();
    const code = btn.closest('.code').querySelector('code');
    const label = btn.querySelector('span');
    try {
      await navigator.clipboard.writeText(code.textContent);
      label.textContent = 'Copied';
    } catch {
      label.textContent = 'Failed';
    }
    setTimeout(() => { label.textContent = 'Copy'; }, 1200);
  });

  const follow = () => { if (stick) pane.scrollTop = pane.scrollHeight; };

  return {
    render(messages, streamingMsg, { toBottom = false } = {}) {
      if (toBottom) stick = true;
      pane.replaceChildren(
        ...(messages.length
          ? messages.map((m) => messageNode(m, m === streamingMsg))
          : [el('div', 'empty', 'Start a conversation.')]),
      );
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

function messageNode(msg, streaming) {
  const node = el('article', `msg ${msg.role}${streaming ? ' streaming' : ''}`);
  node.append(el('span', 'who', LABEL[msg.role]));
  if (msg.files?.length) node.append(filesNode(msg.files));
  if (msg.tools?.length) node.append(el('div', 'tool-log', msg.tools.join(' · ')));
  const body = el('div', 'body');
  fillBody(body, msg);
  node.append(body);
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
  // Each code block gets a header bar (language + Copy) that stays visible while scrolling.
  for (const pre of body.querySelectorAll('pre')) {
    const lang = pre.querySelector('code')?.className.match(/language-([\w+#-]+)/)?.[1] ?? '';
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
