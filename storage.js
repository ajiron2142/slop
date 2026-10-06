import { get, set, setMany, delMany, keys, getMany, clear } from './vendor/idb-keyval.js';

const DEFAULT_SETTINGS = { baseUrl: '', apiKey: '', model: '', systemPrompt: '' };

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

export function saveChat(meta, messages) {
  return setMany([
    [`chatmeta:${meta.id}`, meta],
    [`chat:${meta.id}`, { id: meta.id, messages }],
  ]);
}

export const deleteChat = (id) => delMany([`chatmeta:${id}`, `chat:${id}`]);

export const clearAll = () => clear();

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
    const messages = chat.messages.filter(isMessage).map(({ role, content, ts }) => ({
      role,
      content,
      ts: Number(ts) || 0,
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
