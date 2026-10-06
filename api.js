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

export async function listModels(settings) {
  const res = await request(settings, '/v1/models');
  const body = await res.json();
  return [...new Set((body.data ?? []).map((m) => m.id).filter(Boolean))].sort();
}

export async function streamChat({ settings, messages, signal, onDelta }) {
  const res = await request(settings, '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: settings.model, messages, stream: true }),
    signal,
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      let chunk;
      try { chunk = JSON.parse(data); } catch { continue; }
      if (chunk.error) throw new ApiError(chunk.error.message || 'Stream error', 'http');
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) onDelta(text);
    }
  }
}
