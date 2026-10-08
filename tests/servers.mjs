// Two small servers for the tests, using only Node's built-ins:
// the app's files, and a fake LiteLLM that streams canned replies.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png',
};

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));

// Serves the repository folder, like nginx does in production.
export async function startSite(root) {
  const server = http.createServer(async (req, res) => {
    const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    const file = path.endsWith(sep) ? join(path, 'index.html') : path;
    if (!file.startsWith(root)) return res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return { url: await listen(server), close: () => server.close() };
}

const MODELS = ['claude-sonnet-4', 'claude-haiku', 'gpt-4o', 'gpt-4o-mini', 'llama-3.1-70b', 'mistral-large', 'gemini-pro', 'deepseek-v3'];
// Context limits and prices, as LiteLLM's /model/info reports them. llama has no price (free).
const INFO = [
  { model_name: 'claude-haiku', model_info: { max_input_tokens: 200000, input_cost_per_token: 0.8e-6, output_cost_per_token: 4e-6, cache_read_input_token_cost: 0.08e-6 } },
  { model_name: 'gpt-4o-mini', model_info: { max_input_tokens: 128000, input_cost_per_token: 0.15e-6, output_cost_per_token: 0.6e-6 } },
  { model_name: 'llama-3.1-70b', model_info: { max_input_tokens: 32768 } },
];

// A reply with the awkward markdown: nested code in a list, a table, a long line, a long block.
const LONG_REPLY = `Here's a tricky reply.

## A heading

1. First item with \`inline code\`
2. Second item with a nested block:

   \`\`\`python
   def hello(name):
       return f"Hello, {name}! This line is deliberately long so it has to scroll sideways inside the code block instead of wrapping."
   \`\`\`

3. Third item

| Model | Context | Notes |
|---|---|---|
| sonnet | 200k | good |
| gpt-4o | 128k | fine |

> A quote with a [link](https://example.com).

\`\`\`js
${Array.from({ length: 60 }, (_, i) => `const line${i} = ${i};`).join('\n')}
\`\`\`

Done.`;

// What the fake LiteLLM answers, by how the last user message starts:
//   "echo …"     a one-line summary of what it received (images, inlined files)
//   "cut …"      the long reply, marked as cut off at the length limit
//   "huge …"     reports 40,000 input tokens, more than some models can take
//   "folder …"   (with tools) lists the folder, reads two files, then reports what it saw
//   "notools …"  (with tools) the error LiteLLM gives for a model without tool support
//   "edit …"     (with write tools) edits src/app.js and creates notes/new.txt in one round, then
//                tries an edit that can't match, then reports the three results
//   anything else: the long reply
export async function startMock() {
  const requests = []; // every chat request received, newest last
  const sse = (res, data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const usage = (body, text) => {
    const huge = String(body.messages.at(-1).content).startsWith('huge');
    const prompt = huge ? 40000 : Math.ceil(JSON.stringify(body.messages).length / 4);
    return { choices: [], usage: { prompt_tokens: prompt, completion_tokens: Math.ceil(text.length / 4), prompt_tokens_details: { cached_tokens: body.messages.length > 2 ? Math.floor(prompt / 2) : 0 } } };
  };

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.end();
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: Array.from({ length: 40 }, (_, i) => ({ id: MODELS[i % 8] + (i >= 8 ? `-v${Math.floor(i / 8)}` : '') })) }));
    if (req.url === '/model/info') return res.end(JSON.stringify({ data: INFO }));
    // A key with a $50 monthly budget, $12.40 spent.
    if (req.url === '/key/info') {
      const day = 86400000;
      return res.end(JSON.stringify({ info: { spend: 12.4, max_budget: 50, budget_reset_at: new Date(Date.now() + 20 * day).toISOString() } }));
    }
    if (req.url !== '/v1/chat/completions') return res.writeHead(404).end();

    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      const body = JSON.parse(raw);
      const last = body.messages.filter((m) => m.role === 'user').at(-1);
      const parts = Array.isArray(last.content) ? last.content : [{ type: 'text', text: last.content }];
      const text = parts[0].text;
      requests.push({
        model: body.model,
        text,
        hasTools: Boolean(body.tools),
        toolNames: (body.tools ?? []).map((t) => t.function.name),
        system: body.messages[0].role === 'system' ? body.messages[0].content : '',
        images: parts.filter((p) => p.type === 'image_url').length,
        hasFile: parts.some((p) => p.type === 'text' && p.text.includes('<file name=')),
      });

      if (body.tools && text.startsWith('notools')) {
        return res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: 'litellm.UnsupportedParamsError: tools is not supported' } }));
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });

      if (body.tools && text.startsWith('edit')) {
        const results = body.messages.filter((m) => m.role === 'tool');
        const call = (id, name, args) => ({ index: Number(id.slice(1)), id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
        if (results.length === 0) {
          sse(res, { choices: [{ delta: { content: 'Making two changes.', tool_calls: [
            call('e0', 'edit_file', { path: 'src/app.js', old_text: '"hi"', new_text: '"hello"' }),
            call('e1', 'write_file', { path: 'notes/new.txt', content: 'fresh\n' }),
          ] } }] });
        } else if (results.length === 2) {
          sse(res, { choices: [{ delta: { tool_calls: [call('e0', 'edit_file', { path: 'src/app.js', old_text: 'nope', new_text: 'x' })] } }] });
        } else {
          sse(res, { choices: [{ delta: { content: `EDIT[${results[0].content}] CREATE[${results[1].content}] BAD[${results[2].content}]` } }] });
        }
        sse(res, { choices: [{ delta: {}, finish_reason: results.length < 3 ? 'tool_calls' : 'stop' }] });
        if (body.stream_options?.include_usage) sse(res, usage(body, 'x'.repeat(100)));
        return res.end('data: [DONE]\n\n');
      }

      if (body.tools && text.startsWith('folder')) {
        const results = body.messages.filter((m) => m.role === 'tool');
        if (results.length === 0) {
          sse(res, { choices: [{ delta: { content: 'Let me look.' } }] });
          // Tool calls arrive in pieces, like real providers send them.
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'list_files', arguments: '' } }] } }] });
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"pa' } }] } }] });
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'th":""}' } }] } }] });
        } else if (results.length === 1) {
          sse(res, { choices: [{ delta: { tool_calls: [
            { index: 0, id: 'c2', type: 'function', function: { name: 'read_file', arguments: '{"path":"src/app.js"}' } },
            { index: 1, id: 'c3', type: 'function', function: { name: 'read_file', arguments: '{"path":"../secret.txt"}' } },
          ] } }] });
        } else {
          sse(res, { choices: [{ delta: { content: `FILES[${results[0].content.replace(/\n/g, ',')}] APP[${results[1].content}] ESCAPE[${results[2].content.slice(0, 60)}]` } }] });
        }
        sse(res, { choices: [{ delta: {}, finish_reason: results.length < 2 ? 'tool_calls' : 'stop' }] });
        if (body.stream_options?.include_usage) sse(res, usage(body, 'x'.repeat(200)));
        return res.end('data: [DONE]\n\n');
      }

      const { images, hasFile } = requests.at(-1);
      const reply = text.startsWith('echo') ? `Got ${images} image(s), file: ${hasFile}` : LONG_REPLY;
      for (let i = 0; i < reply.length; i += 7) {
        if (res.destroyed) return;
        sse(res, { choices: [{ delta: { content: reply.slice(i, i + 7) } }] });
        await new Promise((r) => setTimeout(r, 4));
      }
      sse(res, { choices: [{ delta: {}, finish_reason: text.startsWith('cut') ? 'length' : 'stop' }] });
      if (body.stream_options?.include_usage) sse(res, usage(body, reply));
      res.end('data: [DONE]\n\n');
    });
  });
  return { url: await listen(server), requests, close: () => server.close() };
}
