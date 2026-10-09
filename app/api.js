import { pasteNote } from './paste.js'; // smart paste

export class ApiError extends Error {
  constructor(message, kind, status) {
    super(message);
    this.kind = kind; // 'cors' | 'auth' | 'http'
    this.status = status;
  }
}

// Accept the base URL with or without a trailing slash or "/v1".
const endpoint = (baseUrl, path) => baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/, '') + path;

// sign-in: when signed in, the token comes from here instead of the pasted API key.
let signedInToken = null;
export const useSignIn = (getToken) => { signedInToken = getToken; };

async function request(settings, path, init = {}, retried = false) {
  const token = signedInToken && await signedInToken({ force: retried }); // sign-in
  let res;
  try {
    res = await fetch(endpoint(settings.baseUrl, path), {
      ...init,
      headers: { Authorization: `Bearer ${token || settings.apiKey}`, ...init.headers },
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(
      'The request failed before any response arrived. Most likely CORS (the LiteLLM host does not allow this origin), or the URL is wrong or unreachable.',
      'cors',
    );
  }
  // sign-in: a 401 while signed in gets one fresh token and one more try, then asks you to sign in again.
  if (res.status === 401 && token) {
    if (!retried) return request(settings, path, init, true);
    throw new ApiError('Your sign-in has expired. Sign in again in Settings.', 'auth', 401);
  }
  if (!res.ok) {
    let msg = res.statusText || 'Request failed';
    try {
      const body = await res.json();
      const m = body?.error?.message ?? body?.message ?? body?.detail;
      if (m) msg = typeof m === 'string' ? m : JSON.stringify(m);
    } catch {}
    const kind = res.status === 401 || res.status === 403 ? 'auth' : 'http';
    throw new ApiError(`HTTP ${res.status}: ${msg}`, kind, res.status);
  }
  return res;
}

// A stored message becomes API content: text files are inlined, images become image parts.
export function toApiContent(msg) {
  const files = msg.files ?? [];
  let text = msg.content;
  for (const f of files) {
    if (f.kind === 'text') text += `\n\n<file name="${f.name.replace(/"/g, '')}">\n${f.text}\n</file>`;
    if (f.kind === 'paste') text += `\n\n${pasteNote(f)}`; // smart paste
  }
  const images = files.filter((f) => f.kind === 'image');
  if (!images.length) return text;
  return [{ type: 'text', text }, ...images.map((f) => ({ type: 'image_url', image_url: { url: f.dataUrl } }))];
}

export async function listModels(settings) {
  const res = await request(settings, '/v1/models');
  const body = await res.json();
  return [...new Set((body.data ?? []).map((m) => m.id).filter(Boolean))].sort();
}

// Context limits and prices per model from LiteLLM's /v2/model/info, or /model/info on proxies
// where that's the one with data. Optional: if the proxy allows neither, the meter just shows
// tokens without limits or costs.
export async function getModelInfo(settings) {
  for (const path of ['/v2/model/info', '/model/info']) {
    try {
      const body = await (await request(settings, path)).json();
      const info = {};
      for (const m of body.data ?? []) if (m.model_name && !info[m.model_name]) info[m.model_name] = m.model_info ?? {};
      if (Object.keys(info).length) return info;
    } catch {}
  }
  return {};
}

// Your key's budget from LiteLLM's /key/info: spend, max_budget and budget_reset_at.
// Optional: null when the proxy doesn't allow it or the key has no budget.
export async function getKeyInfo(settings) {
  try {
    const info = (await (await request(settings, '/key/info')).json())?.info;
    return info?.max_budget != null ? info : null;
  } catch {
    return null;
  }
}

// Streams a reply, calling onDelta with each piece of text. Resolves with any tool calls
// the model made (only possible when tools are sent), the token usage the server reports
// at the end, and why the reply finished ("stop", "length", "tool_calls"). `maxTokens` caps how
// much the model may write; without it the provider's own default applies.
export async function streamChat({ settings, messages, tools, maxTokens, signal, onDelta }) {
  const res = await request(settings, '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: settings.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      ...(tools && { tools }),
      ...(maxTokens && { max_tokens: maxTokens }),
    }),
    signal,
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const calls = [];
  let usage = null;
  let finish = null;
  let buffer = '';
  read: for (;;) {
    const { done, value } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = done ? '' : lines.pop(); // at the end, the last line counts even without a line break
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') break read;
      let chunk;
      try { chunk = JSON.parse(data); } catch { continue; }
      if (chunk.error) throw new ApiError(chunk.error.message || 'Stream error', 'http');
      if (chunk.usage) usage = readUsage(chunk.usage);
      finish = chunk.choices?.[0]?.finish_reason ?? finish;
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) onDelta(delta.content);
      // Tool calls arrive in pieces; join them up by index.
      for (const part of delta?.tool_calls ?? []) {
        const call = (calls[part.index ?? 0] ??= { id: '', type: 'function', function: { name: '', arguments: '' } });
        if (part.id) call.id = part.id;
        if (part.function?.name) call.function.name += part.function.name;
        if (part.function?.arguments) call.function.arguments += part.function.arguments;
      }
    }
    if (done) break;
  }
  return { toolCalls: calls.filter(Boolean).map((c, i) => ({ ...c, id: c.id || `call_${i}` })), usage, finish };
}

// Token counts, including how much input the provider served from its cache.
const readUsage = (u) => ({
  input: u.prompt_tokens ?? 0,
  output: u.completion_tokens ?? 0,
  cached: u.prompt_tokens_details?.cached_tokens ?? u.cache_read_input_tokens ?? 0,
});
