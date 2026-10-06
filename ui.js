import { renderMarkdown } from './markdown.js';

export const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function renderChatList(list, chats, activeId) {
  list.replaceChildren(
    ...chats.map((meta) => {
      const li = el('li', meta.id === activeId ? 'active' : '');
      li.dataset.id = meta.id;
      const open = el('button', 'chat-title', meta.title || 'Untitled');
      open.dataset.action = 'open';
      open.title = meta.title;
      const del = el('button', 'chat-delete', '×');
      del.dataset.action = 'delete';
      del.setAttribute('aria-label', `Delete chat "${meta.title}"`);
      li.append(open, del);
      return li;
    }),
  );
}

export function renderModels(select, models, selected) {
  const ids = selected && !models.includes(selected) ? [selected, ...models] : models;
  if (!ids.length) {
    select.replaceChildren(el('option', '', 'No models loaded'));
    select.disabled = true;
    return;
  }
  select.disabled = false;
  select.replaceChildren(
    ...ids.map((id) => {
      const opt = el('option', '', id);
      opt.value = id;
      return opt;
    }),
  );
  select.value = selected && ids.includes(selected) ? selected : ids[0];
}

// Fill a message node's body. Assistant text is markdown (sanitized), everything else is plain text.
export function fillMessage(node, msg) {
  const body = node.querySelector('.body');
  if (msg.role !== 'assistant') {
    body.textContent = msg.content;
    return;
  }
  body.innerHTML = renderMarkdown(msg.content);
  for (const pre of body.querySelectorAll('pre')) {
    const copy = el('button', 'copy', 'Copy');
    copy.dataset.action = 'copy';
    pre.prepend(copy);
  }
}

function messageNode(msg) {
  const node = el('div', `msg ${msg.role}`);
  node.append(el('div', 'body'));
  fillMessage(node, msg);
  if (msg.role === 'error') {
    const retry = el('button', 'retry', 'Retry');
    retry.dataset.action = 'retry';
    node.append(retry);
  }
  return node;
}

export function renderMessages(pane, messages, streamingMsg) {
  if (!messages.length) {
    pane.replaceChildren(el('div', 'empty', 'Start a conversation.'));
    return;
  }
  pane.replaceChildren(
    ...messages.map((msg) => {
      const node = messageNode(msg);
      if (msg === streamingMsg) node.dataset.streaming = '';
      return node;
    }),
  );
}
