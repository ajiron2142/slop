import { listModels, streamChat } from './api.js';
import * as store from './storage.js';
import { $, renderChatList, renderModels, renderMessages, fillMessage } from './ui.js';

const state = {
  settings: null,
  models: [],
  chats: [], // chat metadata, newest first
  active: null, // { meta, messages } or null for an unsaved new chat
  streaming: null, // { chat, msg, controller }
};

const pane = $('messages');
const input = $('input');
const sendBtn = $('send-btn');
const dialog = $('settings');
const modelSelect = $('model-select');
let stickToBottom = true;
let frame = 0;

function render() {
  renderChatList($('chat-list'), state.chats, state.active?.meta.id);
  const streamingMsg = state.streaming?.chat === state.active ? state.streaming.msg : null;
  renderMessages(pane, state.active?.messages ?? [], streamingMsg);
  sendBtn.textContent = state.streaming ? 'Stop' : 'Send';
  sendBtn.classList.toggle('primary', !state.streaming);
  scrollIfStuck();
}

function scrollIfStuck() {
  if (stickToBottom) pane.scrollTop = pane.scrollHeight;
}

const setNotice = (text = '') => { $('notice').textContent = text; };

function setStatus(text, kind = '') {
  const el = $('settings-status');
  el.textContent = text;
  el.className = `settings-status ${kind}`;
}

const withoutErrors = (messages) => messages.filter((m) => m.role !== 'error');

async function reloadChatList() {
  state.chats = await store.listChatMeta();
}

async function refreshModels() {
  const s = state.settings;
  state.models = [];
  if (s.baseUrl && s.apiKey) {
    try {
      state.models = await listModels(s);
      setNotice('');
    } catch (e) {
      setNotice(`Could not load models: ${e.message}`);
    }
  }
  renderModels(modelSelect, state.models, s.model);
  if (!s.model && state.models.length) {
    s.model = modelSelect.value;
    await store.saveSettings(s);
  }
}

// ---- chatting ----

async function send() {
  if (state.streaming) return;
  const text = input.value.trim();
  if (!text) return;
  const s = state.settings;
  if (!s.baseUrl || !s.apiKey) return openSettings('Set a base URL and API key first.');
  if (!s.model) return setNotice('Pick a model first.');

  if (!state.active) {
    const now = Date.now();
    const title = text.replace(/\s+/g, ' ').slice(0, 40);
    state.active = { meta: { id: crypto.randomUUID(), title, created: now, updated: now }, messages: [] };
  }
  const chat = state.active;
  chat.messages = withoutErrors(chat.messages);
  chat.messages.push({ role: 'user', content: text, ts: Date.now() });
  input.value = '';
  autosize();
  stickToBottom = true;
  await store.saveChat(chat.meta, chat.messages);
  await reloadChatList();
  await complete(chat);
}

async function complete(chat) {
  const s = state.settings;
  const history = withoutErrors(chat.messages).map(({ role, content }) => ({ role, content }));
  if (s.systemPrompt.trim()) history.unshift({ role: 'system', content: s.systemPrompt });

  const msg = { role: 'assistant', content: '', ts: Date.now() };
  chat.messages.push(msg);
  const controller = new AbortController();
  state.streaming = { chat, msg, controller };
  render();

  try {
    await streamChat({
      settings: s,
      messages: history,
      signal: controller.signal,
      onDelta: (text) => {
        msg.content += text;
        scheduleStreamUpdate();
      },
    });
  } catch (e) {
    if (e.name !== 'AbortError') chat.messages.push({ role: 'error', content: e.message });
  }

  cancelAnimationFrame(frame);
  frame = 0;
  if (!msg.content) chat.messages.splice(chat.messages.indexOf(msg), 1);
  state.streaming = null;
  if (!chat.deleted) {
    chat.meta.updated = Date.now();
    await store.saveChat(chat.meta, withoutErrors(chat.messages));
    await reloadChatList();
  }
  render();
}

// Re-render markdown for the in-progress message at most once per frame.
function scheduleStreamUpdate() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const st = state.streaming;
    if (!st || st.chat !== state.active) return;
    const node = pane.querySelector('[data-streaming]');
    if (node) {
      fillMessage(node, st.msg);
      scrollIfStuck();
    }
  });
}

function retry() {
  const chat = state.active;
  if (!chat || state.streaming) return;
  chat.messages = withoutErrors(chat.messages);
  if (chat.messages.at(-1)?.role === 'assistant') chat.messages.pop();
  if (!chat.messages.length) return render();
  stickToBottom = true;
  complete(chat);
}

// ---- chat list ----

function newChat() {
  state.active = null;
  closeSidebar();
  render();
  input.focus();
}

async function openChat(id) {
  if (state.streaming?.chat.meta.id === id) {
    state.active = state.streaming.chat;
  } else {
    const meta = state.chats.find((c) => c.id === id);
    if (!meta) return;
    state.active = { meta, messages: await store.loadMessages(id) };
  }
  stickToBottom = true;
  closeSidebar();
  render();
  input.focus();
}

async function removeChat(id) {
  const meta = state.chats.find((c) => c.id === id);
  if (!meta || !confirm(`Delete "${meta.title}"?`)) return;
  if (state.streaming?.chat.meta.id === id) {
    state.streaming.chat.deleted = true;
    state.streaming.controller.abort();
  }
  await store.deleteChat(id);
  state.chats = state.chats.filter((c) => c.id !== id);
  if (state.active?.meta.id === id) state.active = null;
  render();
}

const closeSidebar = () => $('app').classList.remove('sidebar-open');

// ---- settings ----

function openSettings(status = '') {
  const s = state.settings;
  $('set-base-url').value = s.baseUrl;
  $('set-api-key').value = s.apiKey;
  $('set-system').value = s.systemPrompt;
  setStatus(status);
  if (!dialog.open) dialog.showModal();
}

function readSettingsForm() {
  return {
    baseUrl: $('set-base-url').value.trim(),
    apiKey: $('set-api-key').value.trim(),
    systemPrompt: $('set-system').value,
  };
}

const httpWarning = (url) =>
  url.startsWith('http://')
    ? ' Note: plain http:// URLs are blocked by the page\'s Content-Security-Policy; edit index.html if you really need one.'
    : '';

async function saveSettingsForm() {
  Object.assign(state.settings, readSettingsForm());
  await store.saveSettings(state.settings);
  setStatus(`Saved.${httpWarning(state.settings.baseUrl)}`, 'ok');
  await refreshModels();
}

async function testConnection() {
  const s = { ...state.settings, ...readSettingsForm() };
  if (!s.baseUrl) return setStatus('Enter a base URL first.', 'bad');
  setStatus('Testing…');
  try {
    const models = await listModels(s);
    setStatus(`Connected. ${models.length} model(s) available.`, 'ok');
  } catch (e) {
    const label = { cors: 'CORS or network error', auth: 'Authentication failed', http: 'HTTP error' }[e.kind] ?? 'Error';
    const origin = e.kind === 'cors' ? ` This page's origin is ${location.origin}.` : '';
    setStatus(`${label}: ${e.message}${origin}${httpWarning(s.baseUrl)}`, 'bad');
  }
}

async function forgetKey() {
  state.settings.apiKey = '';
  $('set-api-key').value = '';
  await store.saveSettings(state.settings);
  setStatus('API key removed from this browser.', 'ok');
  await refreshModels();
}

async function deleteAll() {
  if (!confirm('Delete all chats, settings and your API key from this browser?')) return;
  if (state.streaming) {
    state.streaming.chat.deleted = true;
    state.streaming.controller.abort();
  }
  await store.clearAll();
  state.settings = await store.loadSettings();
  state.chats = [];
  state.active = null;
  state.models = [];
  renderModels(modelSelect, [], '');
  render();
  openSettings('All local data deleted.');
}

// ---- export / import ----

async function exportChats() {
  const data = await store.exportAll();
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `chats-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setNotice(`Exported ${data.chats.length} chat(s).`);
}

async function importFile(file) {
  try {
    const { added, skipped } = await store.importData(JSON.parse(await file.text()));
    await reloadChatList();
    render();
    setNotice(`Imported ${added} chat(s)${skipped ? `, skipped ${skipped} already present or invalid` : ''}.`);
  } catch (e) {
    setNotice(`Import failed: ${e.message}`);
  }
}

// ---- events ----

function autosize() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight + 2, window.innerHeight * 0.4)}px`;
}

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send();
  }
});
input.addEventListener('input', autosize);
sendBtn.addEventListener('click', () => (state.streaming ? state.streaming.controller.abort() : send()));

pane.addEventListener('scroll', () => {
  stickToBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 40;
});
pane.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'retry') return retry();
  if (btn.dataset.action === 'copy') {
    const code = btn.parentElement.querySelector('code');
    try {
      await navigator.clipboard.writeText(code ? code.textContent : '');
      btn.textContent = 'Copied';
    } catch {
      btn.textContent = 'Failed';
    }
    setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
  }
});

$('chat-list').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  const id = btn?.closest('li')?.dataset.id;
  if (!id) return;
  if (btn.dataset.action === 'open') openChat(id);
  else if (btn.dataset.action === 'delete') removeChat(id);
});

modelSelect.addEventListener('change', () => {
  state.settings.model = modelSelect.value;
  store.saveSettings(state.settings);
});

$('new-chat').addEventListener('click', newChat);
$('menu-btn').addEventListener('click', () => $('app').classList.toggle('sidebar-open'));
$('settings-btn').addEventListener('click', () => openSettings());
$('close-settings').addEventListener('click', () => dialog.close());
$('save-settings').addEventListener('click', saveSettingsForm);
$('test-conn').addEventListener('click', testConnection);
$('forget-key').addEventListener('click', forgetKey);
$('delete-all').addEventListener('click', deleteAll);
$('export-btn').addEventListener('click', exportChats);
$('import-btn').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) importFile(file);
});

const overlay = $('drop-overlay');
const hasFiles = (e) => e.dataTransfer?.types?.includes('Files');
let dragDepth = 0;
document.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  dragDepth++;
  overlay.hidden = false;
});
document.addEventListener('dragleave', (e) => {
  if (!hasFiles(e) || --dragDepth > 0) return;
  dragDepth = 0;
  overlay.hidden = true;
});
document.addEventListener('dragover', (e) => {
  if (hasFiles(e)) e.preventDefault();
});
document.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  overlay.hidden = true;
  const file = e.dataTransfer.files[0];
  if (file) importFile(file);
});

async function init() {
  navigator.storage?.persist?.().catch(() => {});
  state.settings = await store.loadSettings();
  await reloadChatList();
  renderModels(modelSelect, [], state.settings.model);
  render();
  if (!state.settings.baseUrl) openSettings('Welcome! Enter your LiteLLM base URL and API key.');
  else refreshModels();
}

init();
