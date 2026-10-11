// Entry point. Owns the app state and connects the components:
//   composer (you type) -> send() -> complete() streams the reply via api.js
//   -> messages (renders it) and storage.js (saves it) -> sidebar (lists chats).
// Components only handle their own piece of the page and call back here.

import { listModels, getModelInfo, getKeyInfo, streamChat, toApiContent, useSignIn } from './api.js';
import * as store from './storage.js';
import { $ } from './dom.js';
import { applyTheme, rememberForBoot } from './theme.js';
import { folderSupported, pickFolder, allowRead, folderPrompt, FOLDER_TOOLS, runTool } from './folder.js';
import { summarize, costOf, limitOf, maxOutputOf } from './stats.js';
import { createSidebar } from './components/sidebar.js';
import { createMessages } from './components/messages.js';
import { createComposer } from './components/composer.js';
import { createPicker } from './components/picker.js';
import { createSettings } from './components/settings.js';
import { createMeter } from './components/meter.js';
import { createPanel } from './components/panel.js';
import { PASTE_TOOLS, hasPastes, isPasteTool, runPasteTool, pasteText } from './paste.js'; // smart paste
import { miniSupported, createMini } from './mini.js'; // mini window
import { createViewer } from './viewer.js'; // image viewer
import { loadConfig, createAuth, renderSignIn } from './oidc.js'; // sign-in
import { autoTitle } from './autotitle.js'; // chat titles
import { createGitlab, GITLAB_TOOLS, gitlabPrompt, isGitlabTool } from './gitlab.js'; // gitlab
import { createActivity } from './activity.js'; // activity
import { createFlow } from './flow.js'; // flow
import { patchPrompt, patchBlock } from './patch.js'; // patch
import { GIT_TOOLS, gitPrompt, isGitTool, runGitTool, isRepo, refreshGit, gitStatusOf } from './folder-git.js'; // git
import { SANDBOX_TOOLS, isSandboxTool, runSandboxTool, picturesNode, replyMarkdown } from './sandbox.js'; // sandbox
import { editNode } from './edit.js'; // edit

const state = {
  settings: null,
  models: [],
  modelInfo: {}, // context limits and prices by model name, from LiteLLM
  keyInfo: null, // your key's budget and expiry, when LiteLLM reports them
  infoReady: Promise.resolve(), // settles once the model info asked for at the last refresh has arrived
  listReady: Promise.resolve(), // settles once the model list asked for at the last refresh has arrived
  chats: [], // chat metadata, newest first (filtered by search)
  active: null, // { meta, messages, folder }, or null for a new unsaved chat
  draftFolder: null, // folder connected before a new chat's first message
  draftGitlab: null, // gitlab: project connected before a new chat's first message
  draftSandbox: false, // sandbox: turned on before a new chat's first message
  sandboxRunning: null, // sandbox: the chat whose code is running now
  streaming: null, // { chat, msg, controller, toolsRunning, notes }
  auth: null, // sign-in, when config.json sets it up
};

let signInBox = null; // sign-in: the Sign in / Signed in as part of Settings
// Requests can go out with a pasted API key or, when sign-in is set up, while signed in.
const canAuth = () => Boolean(state.settings.apiKey || state.auth?.signedIn());
const openSettings = (message) => { signInBox?.draw(); gitlab.draw(); settings.open(message); }; // gitlab

const notice = $('notice');
const notify = (text = '') => { notice.textContent = text; notice.hidden = !text; };
const withoutErrors = (messages) => messages.filter((m) => m.role !== 'error');
const MAX_TOOL_ROUNDS = 20;

// Today's date and this computer's time zone, for the system prompt: "Today is Thursday, October 8,
// 2026. The user's time zone is America/Denver (UTC-06:00)." Models don't know the date otherwise.
// No time of day: the line then only changes once a day, so providers can keep caching the request.
function today(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const hhmm = `${String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')}:${String(Math.abs(off) % 60).padStart(2, '0')}`;
  return `Today is ${d.toLocaleDateString('en-US', { dateStyle: 'full' })}. The user's time zone is ${Intl.DateTimeFormat().resolvedOptions().timeZone} (UTC${off < 0 ? '-' : '+'}${hhmm}).`;
}

// ---- components ----

const sidebar = createSidebar({
  app: $('app'),
  list: $('chat-list'),
  search: $('search'),
  menuButton: $('menu-btn'),
  collapseButton: $('collapse-btn'),
  scrim: $('scrim'),
  onOpen: openChat,
  onRename: renameChat,
  onDelete: removeChat,
  onSearch: reloadChatList,
  onCollapse: (collapsed) => {
    state.settings.sidebarCollapsed = collapsed;
    store.saveSettings(state.settings);
    rememberForBoot({ collapsed });
  },
});

const panel = createPanel({ app: $('app'), root: $('panel') });

// gitlab: its part of Settings, the "Connect GitLab project" menu item and the project picker.
const gitlab = createGitlab({
  box: $('gitlab-settings'),
  menuItem: document.querySelector('#attach-menu [data-action="gitlab"]'),
  chat: $('chat'),
  getSettings: () => state.settings,
  saveSettings: (changes) => { Object.assign(state.settings, changes); return store.saveSettings(state.settings); },
  onChange: () => render(),
});

const activity = createActivity({ flow: createFlow() }); // activity, flow
const messages = createMessages($('messages'), {
  onRetry: retry,
  activity: (m) => activity.node(state.active?.meta.id, m), // activity
  codeBlock: patchBlock, // patch
  extra: picturesNode, // sandbox
  copyText: replyMarkdown, // sandbox
  mine: (m) => editNode(m, editMessage), // edit
});

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
  onConnectGitlab: async () => { const project = await gitlab.pick(); if (project) setGitlabProject(project); }, // gitlab
  onDisconnectGitlab: () => setGitlabProject(null), // gitlab
  onPickGitlabBranch: async (chipEl) => { // gitlab
    const current = state.active ? state.active.meta.gitlab : state.draftGitlab;
    const project = current && await gitlab.pickBranch(current, chipEl);
    if (project) setGitlabProject(project);
  },
  onToggleSandbox: () => setSandbox(!sandboxOn()), // sandbox
  onSend: send,
  onStop: stop,
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
    if (state.streaming) {
      state.streaming.chat.deleted = true;
      state.streaming.controller.abort();
    }
    await store.clearAll();
    for (const key of Object.keys(drafts)) delete drafts[key];
    saveDrafts();
    composer.setText('');
    state.auth?.signOut(); // sign-in
    signInBox?.draw();
    gitlab.disconnect(); // gitlab
    state.settings = await store.loadSettings();
    state.active = null;
    state.draftFolder = null;
    state.draftSandbox = false; // sandbox
    panel.close();
    applyTheme('');
    sidebar.setCollapsed(false);
    rememberForBoot({ collapsed: false });
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

createViewer($('chat')); // image viewer
if (miniSupported) createMini({ button: $('mini-btn'), chat: $('chat'), panel: $('panel'), sidebar: document.querySelector('.sidebar') }); // mini window

$('new-chat').addEventListener('click', newChat);
$('settings-btn').addEventListener('click', () => openSettings());

// ---- rendering ----

function render(options) {
  sidebar.render(state.chats, state.active?.meta.id);
  const streamingMsg = state.streaming?.chat === state.active ? state.streaming.msg : null;
  messages.render(state.active?.messages ?? [], streamingMsg, { ...options, showStats: state.settings.showStats });
  meter.render(summarize(state.active?.messages ?? [], state.modelInfo, state.settings.model), {
    detailed: state.settings.showStats,
    key: state.keyInfo,
    model: state.settings.model,
  });
  composer.setBusy(Boolean(state.streaming));
  composer.fit();
  const folder = state.active ? state.active.folder : state.draftFolder;
  composer.setFolder(folder?.name, folder && gitStatusOf(folder)); // git
  composer.setGitlab(gitlab.connected() ? (state.active ? state.active.meta.gitlab : state.draftGitlab) : null); // gitlab
  drawSandbox(); // sandbox
}

async function reloadChatList() {
  const q = sidebar.query();
  state.chats = q ? await store.searchChats(q) : await store.listChatMeta();
  sidebar.render(state.chats, state.active?.meta.id);
}

const originOf = (url) => { try { return new URL(url).origin; } catch { return ''; } };

// Typing a message re-warms the connection to an https proxy (name lookup, secure handshake), which the
// browser or the network may have closed while idle, so it's open by the time you press Enter. Nothing is
// sent to the proxy, and an open connection is simply kept. At most once every 30 seconds.
let warmedAt = 0;
$('input').addEventListener('input', () => {
  const origin = originOf(state.settings?.baseUrl ?? '');
  if (!origin.startsWith('https://') || Date.now() - warmedAt < 30_000) return;
  warmedAt = Date.now();
  document.querySelector('link[data-warm]')?.remove();
  const link = Object.assign(document.createElement('link'), { rel: 'preconnect', href: origin, crossOrigin: 'anonymous' });
  link.dataset.warm = '';
  document.head.append(link);
});

// The models listed last time (from this same base URL) show at once, and the proxy's list replaces
// them as soon as it answers. Context limits, prices and the key's budget come in their own requests and
// fill in when they arrive, so the slowest of them never holds up the list. A reply sent before the
// list or the model info has arrived waits for them (state.listReady, state.infoReady): the list may
// have dropped the chosen model, and the reply's output limit comes from the info.
let refreshing = 0; // a newer refresh wins over one still waiting
async function refreshModels() {
  const s = state.settings;
  const run = ++refreshing;
  const ready = Boolean(s.baseUrl && canAuth());
  rememberForBoot({ proxy: ready ? originOf(s.baseUrl) : '' }); // boot.js starts connecting to it on the next load
  state.models = ready && s.knownModelsFrom === s.baseUrl ? s.knownModels : [];
  showModels();
  render();
  if (!ready) return;
  state.infoReady = getModelInfo(s).then((info) => { if (run === refreshing) { state.modelInfo = info; render(); } });
  getKeyInfo(s).then((key) => { if (run === refreshing) { state.keyInfo = key; render(); } });
  state.listReady = (async () => {
    let models = [];
    try {
      models = await listModels(s);
      notify('');
    } catch (e) {
      if (run === refreshing) notify(`Could not load models: ${e.message}`);
    }
    if (run !== refreshing) return;
    state.models = models;
    Object.assign(s, { knownModels: models, knownModelsFrom: s.baseUrl });
    if (models.length && !models.includes(s.model)) s.model = models[0];
    showModels();
    render();
    await store.saveSettings(s);
  })();
  await state.listReady;
}

function showModels() {
  const s = state.settings;
  modelPicker.set(state.models.map((id) => ({ id, name: id })), s.model, s.recentModels);
}

// ---- chatting ----

function send({ text, files }) {
  if (state.streaming) return addNote(text, files);
  const s = state.settings;
  if (!s.baseUrl || !canAuth()) { openSettings(state.auth ? 'Sign in, or set a base URL and API key, first.' : 'Set a base URL and API key first.'); return false; }
  if (!s.model) { notify('Pick a model first.'); return false; }

  if (!state.active) {
    const now = Date.now();
    const title = (text || files[0].name).replace(/\s+/g, ' ').slice(0, 40);
    state.active = { meta: { id: crypto.randomUUID(), title, created: now, updated: now, ...(state.draftGitlab && { gitlab: state.draftGitlab }), ...(state.draftSandbox && { sandbox: true }) }, messages: [], folder: state.draftFolder }; // gitlab, sandbox
    if (state.draftFolder) store.saveFolder(state.active.meta.id, state.draftFolder);
    state.draftFolder = null;
    state.draftGitlab = null; // gitlab
    state.draftSandbox = false; // sandbox
  }
  notify('');
  const chat = state.active;
  chat.messages = withoutErrors(chat.messages);
  chat.messages.push({ role: 'user', content: text, ts: Date.now(), ...(files.length && { files }) });
  store.saveChat(chat.meta, chat.messages).then(reloadChatList);
  complete(chat);
  sent(chat);
  return true;
}

// Sent: the box empties right after this, so there's no draft left to keep.
function sent(chat) {
  delete drafts.new;
  delete drafts[chat.meta.id];
  saveDrafts();
}

// A message sent while a reply is being written goes in at the reply's next break, and the model
// carries on with it. While the model is writing (or about to), the break is now: the reply stops,
// what it wrote so far stays, marked "Interrupted". While its tools run, the break is when they've
// finished, so their work isn't lost; until then the message shows as waiting.
function addNote(text, files) {
  const s = state.streaming;
  if (s.chat !== state.active) { notify('A reply is being written in another chat. Wait for it to finish, or stop it there.'); return false; }
  const note = { role: 'user', content: text, ts: Date.now(), ...(files.length && { files }), ...(s.toolsRunning && { waiting: true }) };
  s.chat.messages.push(note);
  s.notes.push(note);
  if (!s.toolsRunning) s.controller.abort();
  render({ toBottom: true });
  sent(s.chat);
  return true;
}

// Stop ends the reply; a message waiting for its next break stays in the chat, unanswered.
function stop() {
  const s = state.streaming;
  if (!s) return;
  for (const note of s.notes) delete note.waiting;
  s.notes = [];
  s.controller.abort();
}

// A tool call whose arguments aren't valid JSON isn't run. The model is told what it sent, and the
// call goes back to the provider with {} as its arguments, since some providers refuse a request
// that carries broken JSON. Returns null for a call that's fine.
function unreadable(call) {
  const sent = call.function.arguments || '{}';
  try { JSON.parse(sent); return null; } catch (e) {
    call.function.arguments = '{}';
    return {
      label: `Couldn't read the call to ${call.function.name}`,
      result: `Error: the arguments weren't valid JSON (${e.message}), so the call wasn't run. You sent: ${sent.slice(0, 500)}\nSend the call again with complete JSON.`,
    };
  }
}

// `carried`: when the reply goes on from one that was interrupted, everything that one sent and got
// back (its tool calls and their results too), up to and including the messages that interrupted it.
async function complete(chat, carried = null) {
  const s = state.settings;
  const folder = chat.folder;
  let tools;
  // A reply with no text (it only ran tools, or the model finished empty) has nothing to send back; some providers refuse one.
  const history = carried ?? withoutErrors(chat.messages).filter((m) => m.role !== 'assistant' || m.content).map((m) => ({ role: m.role, content: toApiContent(m) }));

  const msg = { role: 'assistant', content: '', ts: Date.now() };
  chat.messages.push(msg);
  const controller = new AbortController();
  state.streaming = { chat, msg, controller, toolsRunning: false, notes: [] };
  const act = activity.start(chat.meta.id, msg, s.model); // activity
  render({ toBottom: true });

  // What this reply used: summed over every round, with timing from the first visible word.
  let model = s.model;
  const used = { input: 0, output: 0, cached: 0, context: 0, files: 0, rounds: 0 };
  const started = performance.now();
  let firstAt = null;
  let finish = null;
  let reasoned = false; // in the last round
  let frame = 0;
  let text = ''; // what the model has written in this round
  try {
    await Promise.all([state.listReady, state.infoReady]); // only waits right after the page loads: the chosen model still listed, its output limit known
    model = s.model;
    if (folder && !(await allowRead(folder))) {
      throw new Error(`Access to the folder "${folder.name}" wasn't allowed. Retry and allow it, or disconnect the folder.`);
    }
    const repo = Boolean(folder) && await isRepo(folder); // git
    const project = gitlab.connected() ? chat.meta.gitlab : null; // gitlab
    const sandbox = Boolean(chat.meta.sandbox); // sandbox
    // Tools only for what this chat has: a folder, a git repo, a GitLab project, a paste still in memory, the sandbox.
    const offered = [...(folder ? FOLDER_TOOLS : []), ...(repo ? GIT_TOOLS : []), ...(project ? GITLAB_TOOLS : []), ...(hasPastes(chat.messages) ? PASTE_TOOLS : []), ...(sandbox ? SANDBOX_TOOLS : [])]; // git, gitlab, smart paste, sandbox
    tools = offered.length ? offered : undefined;
    const names = (list) => list.map((t) => t.function.name); // flow: which place each tool reaches
    act.places([folder && { id: 'folder', kind: 'Folder', name: folder.name, tools: names([...FOLDER_TOOLS, ...(repo ? GIT_TOOLS : [])]) }, project && { id: 'gitlab', kind: 'GitLab project', name: project.path, sub: `branch ${project.ref}`, tools: names(GITLAB_TOOLS) }, hasPastes(chat.messages) && { id: 'paste', kind: 'Pasted text', name: 'Pastes in this chat', tools: names(PASTE_TOOLS) }, sandbox && { id: 'sandbox', kind: 'Sandbox', name: 'JavaScript, offline', tools: names(SANDBOX_TOOLS) }].filter(Boolean)); // flow, git, gitlab, smart paste, sandbox
    const system = [today(), s.systemPrompt.trim(), folder && folderPrompt(folder), repo && gitPrompt, project && gitlabPrompt(project), (folder || project) && patchPrompt([folder?.name, project?.path].filter(Boolean))].filter(Boolean).join('\n\n'); // git, gitlab, patch
    history.unshift({ role: 'system', content: system });
    const reads = []; // sandbox: what the other tools returned in this reply, for the code to use as is
    // With a folder connected the model may ask to read files first: run those and ask again.
    for (let round = 1; ; round++) {
      text = '';
      act.asking(); // activity
      const { toolCalls, usage, finish: why, reasoned: thought } = await streamChat({
        settings: s,
        messages: history,
        tools,
        maxTokens: maxOutputOf(state.modelInfo[model]),
        signal: controller.signal,
        onReasoning: act.thinking, // activity
        onRetry: (e, wait) => notify(e ? `The model is busy (${e.message}). Trying again in ${Math.round(wait / 1000)} s…` : ''),
        onDelta: (delta) => {
          act.writing(); // activity
          firstAt ??= performance.now();
          text += delta;
          msg.content += delta;
          if (frame) return;
          // Repaint once per frame; very long replies repaint less often, since each repaint
          // re-renders the whole reply's markdown (up to 150 ms apart at ~30,000 characters).
          const paint = () => { frame = 0; if (state.active === chat) messages.update(msg); };
          const wait = Math.min(150, msg.content.length / 200);
          frame = wait < 16 ? requestAnimationFrame(paint) : setTimeout(paint, wait);
        },
      });
      finish = why ?? 'stop';
      reasoned = thought;
      if (usage) {
        used.input += usage.input;
        used.output += usage.output;
        used.cached += usage.cached;
        used.context = usage.input + usage.output;
      }
      // A cut-off reply may end in a half-written tool call, so nothing more runs after one.
      if (!toolCalls.length || finish === 'length') { if (text) history.push({ role: 'assistant', content: text }); break; }
      if (round > MAX_TOOL_ROUNDS) throw new Error(`Stopped after ${MAX_TOOL_ROUNDS} rounds of tool calls.`);
      history.push({ role: 'assistant', content: text || null, tool_calls: toolCalls });
      // The round's calls all start at once (they only read, so none waits on another); their results
      // go back in the order the model asked for them.
      state.streaming.toolsRunning = true;
      const done = await Promise.all(toolCalls.map(async (call) => {
        const name = call.function.name;
        const stepDone = act.tool(call); // activity
        const run = unreadable(call) ?? (isPasteTool(name) ? runPasteTool(name, call.function.arguments) // smart paste
          : isSandboxTool(name) ? await runCode(chat, call.function.arguments, reads) // sandbox
          : isGitTool(name) ? await runGitTool(folder, name, call.function.arguments) // git
          : isGitlabTool(name) ? await gitlab.run(project, name, call.function.arguments, controller.signal) // gitlab
          : await runTool(folder, name, call.function.arguments));
        stepDone(run.label, run.result); // activity
        return run;
      }));
      state.streaming.toolsRunning = false;
      toolCalls.forEach((call, i) => {
        const name = call.function.name;
        const { label, result, pictures } = done[i];
        if (name === 'read_file' && !result.startsWith('Error:')) used.files++;
        if (pictures?.length) (msg.pictures ??= []).push(...pictures); // sandbox
        if (!isSandboxTool(name)) reads.push({ tool: name, args: call.function.arguments, text: result }); // sandbox: for later rounds
        (msg.tools ??= []).push(label);
        history.push({ role: 'tool', tool_call_id: call.id, content: result });
      });
      used.rounds++;
      if (state.streaming.notes.length) { finish = 'interrupted'; break; } // the next break: these tools are done
      if (msg.content) msg.content += '\n\n';
      if (state.active === chat) render();
    }
  } catch (e) {
    notify(''); // a "trying again" notice from a retry that came to nothing
    if (e.name === 'AbortError') {
      finish = state.streaming.notes.length ? 'interrupted' : 'stopped';
      if (text) history.push({ role: 'assistant', content: text }); // what it wrote before the interruption
    }
    else {
      finish = null;
      // A fact, not a guess about the cause: the server's own message comes first.
      const hint = tools && e.kind === 'http' ? `\n\nThis request included tools (${tools.map((t) => t.function.name).join(', ')}). If this model doesn't support tools, pick another model or disconnect the folder.` : '';
      chat.messages.push({ role: 'error', content: e.message + hint });
    }
  }
  act.end(finish); // activity
  cancelAnimationFrame(frame);
  clearTimeout(frame);
  if (folder) refreshGit(folder).then(() => render()); // git: commits or a fetch may have happened meanwhile

  msg.content = msg.content.trimEnd();
  // An empty reply goes away only when you stopped or interrupted it or it failed; one the model finished empty stays, and says so.
  if (!msg.content && !msg.tools && (!finish || finish === 'stopped' || finish === 'interrupted')) chat.messages.splice(chat.messages.indexOf(msg), 1);
  else if (finish) {
    const info = state.modelInfo[model];
    const counted = used.context > 0; // a stopped reply never gets the usage report
    msg.stats = {
      model,
      finish,
      ...(!msg.content && reasoned && { reasoned }),
      ms: Math.round(performance.now() - started),
      firstMs: firstAt && Math.round(firstAt - started),
      ...(counted && { input: used.input, output: used.output, cached: used.cached, context: used.context, cost: costOf(info, used) }),
      limit: limitOf(info),
      ...(used.files && { files: used.files, rounds: used.rounds }),
    };
  }
  const { notes } = state.streaming;
  state.streaming = null;
  for (const note of notes) delete note.waiting;
  // Messages sent meanwhile: the reply goes on at once, before anything else can start, with them added.
  // (After a failure they stay unanswered, under the error.)
  if (notes.length && finish && !chat.deleted) {
    complete(chat, [...history.filter((m) => m.role !== 'system'), ...notes.map((m) => ({ role: 'user', content: toApiContent(m) }))]);
  }
  // Spend changed, so refresh the budget in the background.
  getKeyInfo(s).then((key) => { state.keyInfo = key; render(); });
  if (!chat.deleted) {
    chat.meta.updated = Date.now();
    await store.saveChat(chat.meta, withoutErrors(chat.messages).filter((m) => m !== state.streaming?.msg)); // not the reply that just started
    await reloadChatList();
    if (finish && msg.content && !chat.meta.titled) nameChat(chat); // chat titles
  }
  render();
}

// chat titles: once per chat, after its first finished reply; the first-message title stays if it fails.
async function nameChat(chat) {
  chat.meta.titled = true;
  const before = chat.meta.title;
  const title = await autoTitle(state.settings, withoutErrors(chat.messages));
  if (!title || chat.deleted || chat.meta.title !== before) return; // renamed meanwhile: yours stays
  chat.meta.title = title;
  await store.saveMeta(chat.meta);
  await reloadChatList();
}

// sandbox: runs the model's code; the chip's box peeks out meanwhile.
async function runCode(chat, args, reads) {
  state.sandboxRunning = chat;
  state.sandboxRuns = (state.sandboxRuns ?? 0) + 1; // runs in one round go at once; it's still until the last ends
  drawSandbox();
  try {
    return await runSandboxTool(args, { reads, files: attachedTexts(chat.messages) });
  } finally {
    if (--state.sandboxRuns === 0) state.sandboxRunning = null;
    drawSandbox();
  }
}

// sandbox: the text files and pastes attached in this chat, oldest first, for the code to use as is.
// A paste is named "paste <id>", the id the model sees; one gone after a reload is left out.
const attachedTexts = (messages) => messages.flatMap((m) => m.files ?? []).flatMap((f) => {
  if (f.kind === 'text') return [{ name: f.name, text: f.text }];
  if (f.kind === 'paste' && pasteText(f.id) != null) return [{ name: `paste ${f.id}`, text: pasteText(f.id) }]; // smart paste
  return [];
});

function retry() {
  const chat = state.active;
  if (!chat || state.streaming) return;
  chat.messages = withoutErrors(chat.messages);
  if (chat.messages.at(-1)?.role === 'assistant') chat.messages.pop();
  if (chat.messages.length) complete(chat);
  else render();
}

// edit: your message in its new wording, in its old place; everything after it goes, and the model answers again.
function editMessage(msg, text) {
  const chat = state.active;
  const i = chat?.messages.indexOf(msg) ?? -1;
  if (i < 0) return false;
  if (state.streaming) { notify('Wait for the reply being written to finish, or stop it, then save.'); return false; }
  notify('');
  chat.messages = withoutErrors(chat.messages.slice(0, i));
  chat.messages.push({ ...msg, content: text, ts: Date.now() });
  store.saveChat(chat.meta, chat.messages).then(reloadChatList);
  complete(chat);
  return true;
}

// ---- chat list ----

function newChat() {
  state.active = null;
  state.draftFolder = null;
  state.draftGitlab = null; // gitlab
  state.draftSandbox = false; // sandbox
  panel.close();
  sidebar.close();
  render();
  showDraft();
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
  panel.close();
  render({ toBottom: true });
  showDraft();
  if (!sidebar.renaming()) composer.focus(); // a double-click opens the chat, then renames it: keep the name box focused
  if (state.active.folder) refreshGit(state.active.folder).then(() => render()); // git
}

// A name you give a chat is kept, and the chat is never titled automatically after that.
async function renameChat(id, title) {
  const metas = [state.active?.meta, state.streaming?.chat.meta, state.chats.find((c) => c.id === id)].filter((m) => m?.id === id);
  if (!metas.length) return;
  for (const meta of metas) Object.assign(meta, { title, titled: true });
  await store.saveMeta(metas[0]);
  await reloadChatList();
}

async function removeChat(id) {
  const meta = state.chats.find((c) => c.id === id);
  if (!meta || !confirm(`Delete "${meta.title}"?`)) return;
  if (state.streaming?.chat.meta.id === id) {
    state.streaming.chat.deleted = true;
    state.streaming.controller.abort();
  }
  await store.deleteChat(id);
  delete drafts[id];
  saveDrafts();
  if (state.active?.meta.id === id) { state.active = null; showDraft(); }
  await reloadChatList();
  render();
}

// ---- connected folder (per chat; read-only) ----

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
  if (handle) refreshGit(handle).then(() => render()); // git
}

// gitlab: the project for this chat (or the next new one), saved with the chat.
async function setGitlabProject(project) {
  if (state.active) {
    if (project) state.active.meta.gitlab = project;
    else delete state.active.meta.gitlab;
    await store.saveMeta(state.active.meta);
  } else state.draftGitlab = project;
  render();
  composer.focus();
}

// sandbox: on per chat (or for the next new one), saved with the chat.
const sandboxOn = () => Boolean(state.active ? state.active.meta.sandbox : state.draftSandbox);
const drawSandbox = () => composer.setSandbox(sandboxOn() && (state.sandboxRunning && state.sandboxRunning === state.active ? 'running' : 'on'));

async function setSandbox(on) {
  if (!state.active) state.draftSandbox = on;
  else if (on) state.active.meta.sandbox = true;
  else delete state.active.meta.sandbox;
  drawSandbox();
  if (state.active) await store.saveMeta(state.active.meta);
}

// ---- unsent drafts ----

// What you've typed but not sent is kept per chat (and for the next new one) while this tab is open,
// through switching chats and reloads. Only the text, not attachments; gone when the tab closes.
const DRAFTS = 'chat-drafts';
const drafts = (() => { try { return JSON.parse(sessionStorage.getItem(DRAFTS)) || {}; } catch { return {}; } })();
const draftKey = () => state.active?.meta.id ?? 'new';
function saveDrafts() { try { sessionStorage.setItem(DRAFTS, JSON.stringify(drafts)); } catch {} }
function keepDraft() {
  const text = composer.text();
  if (text.trim()) drafts[draftKey()] = text;
  else delete drafts[draftKey()];
  saveDrafts();
}
const showDraft = () => composer.setText(drafts[draftKey()] ?? '');
$('input').addEventListener('input', keepDraft);

// ---- start ----

async function init() {
  navigator.storage?.persist?.().catch(() => {});
  state.settings = await store.loadSettings();
  applyTheme(state.settings.theme);
  sidebar.setCollapsed(state.settings.sidebarCollapsed);
  rememberForBoot({ collapsed: state.settings.sidebarCollapsed });
  await reloadChatList();
  modelPicker.set([], state.settings.model);
  render();
  showDraft(); // a draft for a new chat, after a reload
  const note = await setUpSignIn(); // sign-in
  // gitlab: also finishes a connect coming back from GitLab. Models don't wait for it.
  gitlab.start().then((gitlabNote) => { if (gitlabNote) openSettings(gitlabNote); });
  if (!state.settings.baseUrl) openSettings(note || 'Welcome! Enter your LiteLLM base URL and API key.');
  else if (!canAuth()) openSettings(note || (state.auth ? `Welcome! ${state.auth.label} to start, or enter an API key.` : 'Enter your API key to start.'));
  else {
    if (note) notify(note);
    refreshModels();
  }
}

// sign-in: config.json (optional) can pre-fill the base URL and turn on signing in. Returns a message
// to show when something went wrong, '' otherwise.
async function setUpSignIn() {
  try {
    const config = await loadConfig();
    if (config?.baseUrl && !state.settings.baseUrl) {
      state.settings.baseUrl = config.baseUrl;
      await store.saveSettings(state.settings);
    }
    if (!config?.oidc) return '';
    state.auth = createAuth(config.oidc);
    useSignIn((options) => state.auth.getToken(options));
    signInBox = renderSignIn($('signin'), state.auth, { onSignOut: refreshModels });
    return await state.auth.handleCallback();
  } catch (e) {
    return e.message;
  }
}

init();
