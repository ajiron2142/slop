// Entry point. Owns the app state and connects the components:
//   composer (you type) -> send() -> complete() streams the reply via api.js
//   -> messages (renders it) and storage.js (saves it) -> sidebar (lists chats).
// Components only handle their own piece of the page and call back here.

import { listModels, getModelInfo, streamChat, toApiContent } from './api.js';
import * as store from './storage.js';
import { $ } from './dom.js';
import { applyTheme, warmFonts } from './theme.js';
import { folderSupported, pickFolder, allowRead, folderPrompt, FOLDER_TOOLS, runTool } from './folder.js';
import { summarize, costOf, limitOf } from './stats.js';
import { createSidebar } from './components/sidebar.js';
import { createMessages } from './components/messages.js';
import { createComposer } from './components/composer.js';
import { createPicker } from './components/picker.js';
import { createSettings } from './components/settings.js';
import { createMeter } from './components/meter.js';

const state = {
  settings: null,
  models: [],
  modelInfo: {}, // context limits and prices by model name, from LiteLLM
  chats: [], // chat metadata, newest first (filtered by search)
  active: null, // { meta, messages, folder }, or null for a new unsaved chat
  draftFolder: null, // folder connected before a new chat's first message
  streaming: null, // { chat, msg, controller }
};

const notice = $('notice');
const notify = (text = '') => { notice.textContent = text; notice.hidden = !text; };
const withoutErrors = (messages) => messages.filter((m) => m.role !== 'error');
const MAX_TOOL_ROUNDS = 10;

// ---- components ----

const sidebar = createSidebar({
  app: $('app'),
  list: $('chat-list'),
  search: $('search'),
  menuButton: $('menu-btn'),
  collapseButton: $('collapse-btn'),
  scrim: $('scrim'),
  onOpen: openChat,
  onDelete: removeChat,
  onSearch: reloadChatList,
  onCollapse: (collapsed) => { state.settings.sidebarCollapsed = collapsed; store.saveSettings(state.settings); },
});

const messages = createMessages($('messages'), { onRetry: retry });

const meter = createMeter({ row: $('meter-row'), button: $('meter-btn'), pop: $('meter-pop') });

const composer = createComposer({
  form: $('composer'),
  input: $('input'),
  send: $('send-btn'),
  attach: $('attach-btn'),
  fileInput: $('file-input'),
  tray: $('tray'),
  dropZone: $('chat'),
  overlay: $('drop'),
  menu: $('attach-menu'),
  onConnectFolder: folderSupported ? connectFolder : null,
  onDisconnectFolder: () => setFolder(null),
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
    render();
  },
});

const settings = createSettings({
  getSettings: () => state.settings,
  async onSave(changes, { quiet } = {}) {
    Object.assign(state.settings, changes);
    await store.saveSettings(state.settings);
    if (quiet) { render(); return ['', '']; }
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
    state.draftFolder = null;
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
  messages.render(state.active?.messages ?? [], streamingMsg, { ...options, showStats: state.settings.showStats });
  meter.render(summarize(state.active?.messages ?? [], state.modelInfo, state.settings.model), state.settings.showStats);
  composer.setBusy(Boolean(state.streaming));
  composer.setFolder((state.active ? state.active.folder : state.draftFolder)?.name);
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
      [state.models, state.modelInfo] = await Promise.all([listModels(s), getModelInfo(s)]);
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
  render();
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
    state.active = { meta: { id: crypto.randomUUID(), title, created: now, updated: now }, messages: [], folder: state.draftFolder };
    if (state.draftFolder) store.saveFolder(state.active.meta.id, state.draftFolder);
    state.draftFolder = null;
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
  const folder = chat.folder;
  const tools = folder ? FOLDER_TOOLS : undefined;
  const history = withoutErrors(chat.messages).map((m) => ({ role: m.role, content: toApiContent(m) }));
  const system = [s.systemPrompt.trim(), folder && folderPrompt(folder)].filter(Boolean).join('\n\n');
  if (system) history.unshift({ role: 'system', content: system });

  const msg = { role: 'assistant', content: '', ts: Date.now() };
  chat.messages.push(msg);
  const controller = new AbortController();
  state.streaming = { chat, msg, controller };
  render({ toBottom: true });

  // What this reply used: summed over every round, with timing from the first visible word.
  const model = s.model;
  const used = { input: 0, output: 0, cached: 0, context: 0, files: 0, rounds: 0 };
  const started = performance.now();
  let firstAt = null;
  let finish = null;
  let frame = 0;
  try {
    if (folder && !(await allowRead(folder))) {
      throw new Error(`Access to the folder "${folder.name}" wasn't allowed. Retry and allow it, or disconnect the folder.`);
    }
    // With a folder connected the model may ask to read files first: run those and ask again.
    for (let round = 1; ; round++) {
      let text = '';
      const { toolCalls, usage, finish: why } = await streamChat({
        settings: s,
        messages: history,
        tools,
        signal: controller.signal,
        onDelta: (delta) => {
          firstAt ??= performance.now();
          text += delta;
          msg.content += delta;
          if (!frame) frame = requestAnimationFrame(() => {
            frame = 0;
            if (state.active === chat) messages.update(msg);
          });
        },
      });
      finish = why ?? 'stop';
      if (usage) {
        used.input += usage.input;
        used.output += usage.output;
        used.cached += usage.cached;
        used.context = usage.input + usage.output;
      }
      if (!toolCalls.length) break;
      if (round > MAX_TOOL_ROUNDS) throw new Error(`Stopped after ${MAX_TOOL_ROUNDS} rounds of reading files.`);
      history.push({ role: 'assistant', content: text || null, tool_calls: toolCalls });
      for (const call of toolCalls) {
        const { label, result } = await runTool(folder, call.function.name, call.function.arguments);
        if (call.function.name === 'read_file' && !result.startsWith('Error:')) used.files++;
        (msg.tools ??= []).push(label);
        history.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
      used.rounds++;
      if (msg.content) msg.content += '\n\n';
      if (state.active === chat) render();
    }
  } catch (e) {
    if (e.name === 'AbortError') finish = 'stopped';
    else {
      finish = null;
      const hint = tools && e.kind === 'http' ? '\n\nIf this model doesn\'t support tools, disconnect the folder or pick another model.' : '';
      chat.messages.push({ role: 'error', content: e.message + hint });
    }
  }
  cancelAnimationFrame(frame);

  msg.content = msg.content.trimEnd();
  if (!msg.content && !msg.tools) chat.messages.splice(chat.messages.indexOf(msg), 1);
  else if (finish) {
    const info = state.modelInfo[model];
    const counted = used.context > 0; // a stopped reply never gets the usage report
    msg.stats = {
      model,
      finish,
      ms: Math.round(performance.now() - started),
      firstMs: firstAt && Math.round(firstAt - started),
      ...(counted && { input: used.input, output: used.output, cached: used.cached, context: used.context, cost: costOf(info, used) }),
      limit: limitOf(info),
      ...(used.files && { files: used.files, rounds: used.rounds }),
    };
  }
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
  state.draftFolder = null;
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
    state.active = { meta, messages: await store.loadMessages(id), folder: folderSupported ? await store.loadFolder(id) : null };
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

// ---- connected folder (per chat, read-only) ----

async function connectFolder() {
  try {
    await setFolder(await pickFolder());
  } catch (e) {
    if (e.name !== 'AbortError') notify(`Couldn't open the folder: ${e.message}`);
  }
}

async function setFolder(handle) {
  if (state.active) {
    state.active.folder = handle;
    await store.saveFolder(state.active.meta.id, handle);
  } else {
    state.draftFolder = handle;
  }
  composer.setFolder(handle?.name);
  composer.focus();
}

// ---- start ----

async function init() {
  navigator.storage?.persist?.().catch(() => {});
  state.settings = await store.loadSettings();
  applyTheme(state.settings.theme);
  sidebar.setCollapsed(state.settings.sidebarCollapsed);
  await reloadChatList();
  modelPicker.set([], state.settings.model);
  render();
  warmFonts();
  if (!state.settings.baseUrl) settings.open('Welcome! Enter your LiteLLM base URL and API key.');
  else refreshModels();
}

init();
