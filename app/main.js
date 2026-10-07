import { listModels, streamChat, toApiContent } from './api.js';
import * as store from './storage.js';
import { $ } from './dom.js';
import { applyTheme, warmFonts } from './theme.js';
import { createSidebar } from './components/sidebar.js';
import { createMessages } from './components/messages.js';
import { createComposer } from './components/composer.js';
import { createPicker } from './components/picker.js';
import { createSettings } from './components/settings.js';

const state = {
  settings: null,
  models: [],
  chats: [], // chat metadata, newest first (filtered by search)
  active: null, // { meta, messages }, or null for a new unsaved chat
  streaming: null, // { chat, msg, controller }
};

const notice = $('notice');
const notify = (text = '') => { notice.textContent = text; notice.hidden = !text; };
const withoutErrors = (messages) => messages.filter((m) => m.role !== 'error');

// ---- components ----

const sidebar = createSidebar({
  app: $('app'),
  list: $('chat-list'),
  search: $('search'),
  menuButton: $('menu-btn'),
  scrim: $('scrim'),
  onOpen: openChat,
  onDelete: removeChat,
  onSearch: reloadChatList,
});

const messages = createMessages($('messages'), { onRetry: retry });

const composer = createComposer({
  form: $('composer'),
  input: $('input'),
  send: $('send-btn'),
  attach: $('attach-btn'),
  fileInput: $('file-input'),
  tray: $('tray'),
  dropZone: $('chat'),
  overlay: $('drop'),
  onSend: send,
  onStop: () => state.streaming?.controller.abort(),
  notify,
});

const modelPicker = createPicker($('model-picker'), {
  label: 'Model',
  empty: 'No models',
  onSelect: (id) => {
    const s = state.settings;
    s.model = id;
    s.recentModels = [id, ...s.recentModels.filter((m) => m !== id)].slice(0, 5);
    store.saveSettings(s);
    showModels();
  },
});

const settings = createSettings({
  getSettings: () => state.settings,
  async onSave(changes, { quiet } = {}) {
    Object.assign(state.settings, changes);
    await store.saveSettings(state.settings);
    if (quiet) return ['', ''];
    await refreshModels();
    return ['Saved.', 'ok'];
  },
  async onTest(form) {
    const models = await listModels({ ...state.settings, ...form });
    return [`Connected. ${models.length} model(s) available.`, 'ok'];
  },
  async onForgetKey() {
    state.settings.apiKey = '';
    await store.saveSettings(state.settings);
    await refreshModels();
    return ['API key removed from this browser.', 'ok'];
  },
  async onDeleteAll() {
    if (!confirm('Delete all chats, settings and your API key from this browser?')) return ['', ''];
    state.streaming?.controller.abort();
    await store.clearAll();
    state.settings = await store.loadSettings();
    state.active = null;
    applyTheme('');
    await reloadChatList();
    await refreshModels();
    render();
    return ['All local data deleted.', 'ok'];
  },
  async onExport() {
    const data = await store.exportAll();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `chats-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return [`Exported ${data.chats.length} chat(s).`, 'ok'];
  },
  async onImport(file) {
    const { added, skipped } = await store.importData(JSON.parse(await file.text()));
    await reloadChatList();
    return [`Imported ${added} chat(s)${skipped ? `, skipped ${skipped}` : ''}.`, 'ok'];
  },
});

$('new-chat').addEventListener('click', newChat);
$('settings-btn').addEventListener('click', () => settings.open());

// ---- rendering ----

function render(options) {
  sidebar.render(state.chats, state.active?.meta.id);
  const streamingMsg = state.streaming?.chat === state.active ? state.streaming.msg : null;
  messages.render(state.active?.messages ?? [], streamingMsg, options);
  composer.setBusy(Boolean(state.streaming));
}

async function reloadChatList() {
  const q = sidebar.query();
  state.chats = q ? await store.searchChats(q) : await store.listChatMeta();
  sidebar.render(state.chats, state.active?.meta.id);
}

async function refreshModels() {
  const s = state.settings;
  state.models = [];
  if (s.baseUrl && s.apiKey) {
    try {
      state.models = await listModels(s);
      notify('');
    } catch (e) {
      notify(`Could not load models: ${e.message}`);
    }
  }
  if (state.models.length && !state.models.includes(s.model)) {
    s.model = state.models[0];
    await store.saveSettings(s);
  }
  showModels();
}

function showModels() {
  const s = state.settings;
  modelPicker.set(state.models.map((id) => ({ id, name: id })), s.model, s.recentModels);
}

// ---- chatting ----

function send({ text, files }) {
  if (state.streaming) return false;
  const s = state.settings;
  if (!s.baseUrl || !s.apiKey) { settings.open('Set a base URL and API key first.'); return false; }
  if (!s.model) { notify('Pick a model first.'); return false; }

  if (!state.active) {
    const now = Date.now();
    const title = (text || files[0].name).replace(/\s+/g, ' ').slice(0, 40);
    state.active = { meta: { id: crypto.randomUUID(), title, created: now, updated: now }, messages: [] };
  }
  notify('');
  const chat = state.active;
  chat.messages = withoutErrors(chat.messages);
  chat.messages.push({ role: 'user', content: text, ts: Date.now(), ...(files.length && { files }) });
  store.saveChat(chat.meta, chat.messages).then(reloadChatList);
  complete(chat);
  return true;
}

async function complete(chat) {
  const s = state.settings;
  const history = withoutErrors(chat.messages).map((m) => ({ role: m.role, content: toApiContent(m) }));
  if (s.systemPrompt.trim()) history.unshift({ role: 'system', content: s.systemPrompt });

  const msg = { role: 'assistant', content: '', ts: Date.now() };
  chat.messages.push(msg);
  const controller = new AbortController();
  state.streaming = { chat, msg, controller };
  render({ toBottom: true });

  let frame = 0;
  try {
    await streamChat({
      settings: s,
      messages: history,
      signal: controller.signal,
      onDelta: (text) => {
        msg.content += text;
        if (!frame) frame = requestAnimationFrame(() => {
          frame = 0;
          if (state.active === chat) messages.update(msg);
        });
      },
    });
  } catch (e) {
    if (e.name !== 'AbortError') chat.messages.push({ role: 'error', content: e.message });
  }
  cancelAnimationFrame(frame);

  if (!msg.content) chat.messages.splice(chat.messages.indexOf(msg), 1);
  state.streaming = null;
  if (!chat.deleted) {
    chat.meta.updated = Date.now();
    await store.saveChat(chat.meta, withoutErrors(chat.messages));
    await reloadChatList();
  }
  render();
}

function retry() {
  const chat = state.active;
  if (!chat || state.streaming) return;
  chat.messages = withoutErrors(chat.messages);
  if (chat.messages.at(-1)?.role === 'assistant') chat.messages.pop();
  if (chat.messages.length) complete(chat);
  else render();
}

// ---- chat list ----

function newChat() {
  state.active = null;
  sidebar.close();
  render();
  composer.focus();
}

async function openChat(id) {
  if (state.streaming?.chat.meta.id === id) {
    state.active = state.streaming.chat;
  } else {
    const meta = state.chats.find((c) => c.id === id);
    if (!meta) return;
    state.active = { meta, messages: await store.loadMessages(id) };
  }
  render({ toBottom: true });
  composer.focus();
}

async function removeChat(id) {
  const meta = state.chats.find((c) => c.id === id);
  if (!meta || !confirm(`Delete "${meta.title}"?`)) return;
  if (state.streaming?.chat.meta.id === id) {
    state.streaming.chat.deleted = true;
    state.streaming.controller.abort();
  }
  await store.deleteChat(id);
  if (state.active?.meta.id === id) state.active = null;
  await reloadChatList();
  render();
}

// ---- start ----

async function init() {
  navigator.storage?.persist?.().catch(() => {});
  state.settings = await store.loadSettings();
  applyTheme(state.settings.theme);
  await reloadChatList();
  modelPicker.set([], state.settings.model);
  render();
  warmFonts();
  if (!state.settings.baseUrl) settings.open('Welcome! Enter your LiteLLM base URL and API key.');
  else refreshModels();
}

init();
