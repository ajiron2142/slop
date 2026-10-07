export class ApiError extends Error {
  constructor(message, kind, status) {
    super(message);
    this.kind = kind; // 'cors' | 'auth' | 'http'
    this.status = status;
  }
}

// Accept the base URL with or without a trailing slash or "/v1".
const endpoint = (baseUrl, path) => baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/, '') + path;

async function request(settings, path, init = {}) {
  let res;
  try {
    res = await fetch(endpoint(settings.baseUrl, path), {
      ...init,
      headers: { Authorization: `Bearer ${settings.apiKey}`, ...init.headers },
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(
      'The request failed before any response arrived. Most likely CORS (the LiteLLM host does not allow this origin), or the URL is wrong or unreachable.',
      'cors',
    );
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

// Streams a reply, calling onDelta with each piece of text.
// Resolves with any tool calls the model made (only possible when tools are sent).
export async function streamChat({ settings, messages, tools, signal, onDelta }) {
  const res = await request(settings, '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: settings.model, messages, stream: true, ...(tools && { tools }) }),
    signal,
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const calls = [];
  let buffer = '';
  read: for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') break read;
      let chunk;
      try { chunk = JSON.parse(data); } catch { continue; }
      if (chunk.error) throw new ApiError(chunk.error.message || 'Stream error', 'http');
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
  }
  return { toolCalls: calls.filter(Boolean).map((c, i) => ({ ...c, id: c.id || `call_${i}` })) };
}
