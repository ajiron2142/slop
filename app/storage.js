import { get, set, del, setMany, delMany, keys, getMany, clear } from '../vendor/idb-keyval.js';

const DEFAULT_SETTINGS = { baseUrl: '', apiKey: '', model: '', systemPrompt: '', theme: '', recentModels: [], sidebarCollapsed: false, showStats: false };

export async function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...(await get('settings')) };
}

export const saveSettings = (settings) => set('settings', settings);

async function metaKeys() {
  return (await keys()).filter((k) => typeof k === 'string' && k.startsWith('chatmeta:'));
}

export async function listChatMeta() {
  const metas = await getMany(await metaKeys());
  return metas.filter(Boolean).sort((a, b) => b.updated - a.updated);
}

export async function loadMessages(id) {
  return (await get(`chat:${id}`))?.messages ?? [];
}

// Lower-cased title and message text per chat, built on the first search and kept up to date,
// so typing in the search box doesn't reload every chat (attachments included) each time.
let searchIndex = null;
const searchText = (meta, messages) => [meta.title, ...messages.map((m) => m.content)].join('\n').toLowerCase();

export function saveChat(meta, messages) {
  searchIndex?.set(meta.id, searchText(meta, messages));
  return setMany([
    [`chatmeta:${meta.id}`, meta],
    [`chat:${meta.id}`, { id: meta.id, messages }],
  ]);
}

// Chats whose title or any message contains the query (case-insensitive).
export async function searchChats(query) {
  const q = query.toLowerCase();
  const metas = await listChatMeta();
  if (!searchIndex) {
    const bodies = await getMany(metas.map((m) => `chat:${m.id}`));
    searchIndex = new Map(metas.map((m, i) => [m.id, searchText(m, bodies[i]?.messages ?? [])]));
  }
  return metas.filter((m) => (searchIndex.get(m.id) ?? m.title.toLowerCase()).includes(q));
}

export function deleteChat(id) {
  searchIndex?.delete(id);
  return delMany([`chatmeta:${id}`, `chat:${id}`, `folder:${id}`]);
}

// A chat's connected folder is a browser file handle, which IndexedDB can store as is.
export const loadFolder = (id) => get(`folder:${id}`);
export const saveFolder = (id, handle) => (handle ? set(`folder:${id}`, handle) : del(`folder:${id}`));

export function clearAll() {
  searchIndex = null;
  return clear();
}

export async function exportAll() {
  const metas = await listChatMeta();
  const bodies = await getMany(metas.map((m) => `chat:${m.id}`));
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    chats: metas.map((meta, i) => ({ meta, messages: bodies[i]?.messages ?? [] })),
  };
}

const isMessage = (m) =>
  m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';

const isFile = (f) =>
  f && typeof f.name === 'string' &&
  ((f.kind === 'image' && typeof f.dataUrl === 'string' && f.dataUrl.startsWith('data:image/')) ||
   (f.kind === 'text' && typeof f.text === 'string'));

const cleanFiles = (files) =>
  files.filter(isFile).map(({ kind, name, dataUrl, text }) =>
    kind === 'image' ? { kind, name, dataUrl } : { kind, name, text });

export async function importData(data) {
  if (data?.version !== 1 || !Array.isArray(data.chats)) {
    throw new Error('Not a version 1 chat export.');
  }
  const existing = new Set((await metaKeys()).map((k) => k.slice('chatmeta:'.length)));
  let added = 0;
  let skipped = 0;
  for (const chat of data.chats) {
    const m = chat?.meta;
    if (typeof m?.id !== 'string' || !m.id || !Array.isArray(chat.messages) || existing.has(m.id)) {
      skipped++;
      continue;
    }
    const messages = chat.messages.filter(isMessage).map(({ role, content, ts, files }) => ({
      role,
      content,
      ts: Number(ts) || 0,
      ...(Array.isArray(files) && { files: cleanFiles(files) }),
    }));
    const meta = {
      id: m.id,
      title: String(m.title ?? 'Imported chat').slice(0, 200),
      created: Number(m.created) || Date.now(),
      updated: Number(m.updated) || Date.now(),
    };
    await saveChat(meta, messages);
    existing.add(m.id);
    added++;
  }
  return { added, skipped };
}
