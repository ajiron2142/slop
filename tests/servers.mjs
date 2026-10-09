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
// Context limits and prices, as LiteLLM's /v2/model/info reports them. llama is free (prices of 0);
// models not listed here have no price, so their cost is unknown.
const INFO = [
  { model_name: 'claude-haiku', model_info: { max_input_tokens: 200000, max_output_tokens: 8192, input_cost_per_token: 0.8e-6, output_cost_per_token: 4e-6, cache_read_input_token_cost: 0.08e-6 } },
  { model_name: 'gpt-4o-mini', model_info: { max_input_tokens: 128000, input_cost_per_token: 0.15e-6, output_cost_per_token: 0.6e-6 } },
  { model_name: 'llama-3.1-70b', model_info: { max_input_tokens: 32768, input_cost_per_token: 0, output_cost_per_token: 0 } },
  { model_name: 'mistral-large', model_info: { max_input_tokens: 128000 } }, // known, but no price given
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
//   "cuttool …"  (with tools) starts a tool call and is cut off at the length limit
//   "paste …"    (with paste tools) searches the pasted text for ERROR, reads lines 600–602, reports both
//   "edit …"     (with write tools) edits src/app.js and creates notes/new.txt in one round, then
//                tries an edit that can't match, then reports the three results
//   "git …"      (with git tools) reads the log and the uncommitted changes, then reports both
//   "gitlab …"   (with GitLab tools) uses every GitLab tool once (and one path without the project), then reports
//   "slowgitlab …" (with GitLab tools) a GitLab search that never answers, to check Stop
//   anything else: the long reply
export async function startMock() {
  const requests = []; // every chat request received, newest last
  const auths = []; // the Authorization header of every request, newest last
  const rejected = new Set(); // bearer tokens answered with 401, like an expired one
  const titles = []; // the chat-title requests (kept apart from `requests`)
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
    auths.push(req.headers.authorization);
    if (rejected.has(req.headers.authorization?.slice(7))) return res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: 'token expired' } }));
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: Array.from({ length: 40 }, (_, i) => ({ id: MODELS[i % 8] + (i >= 8 ? `-v${Math.floor(i / 8)}` : '') })) }));
    // Like the deployments where only the v2 endpoint has the data.
    if (req.url === '/v2/model/info') return res.end(JSON.stringify({ data: INFO }));
    if (req.url === '/model/info') return res.end(JSON.stringify({ data: [] }));
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
      // A chat-title request: "Mock chat title", or an error / an answer too long to use, on request.
      if (String(body.messages[0]?.content).startsWith('Write a title')) {
        const about = body.messages[1].content;
        titles.push({ about, maxTokens: body.max_tokens });
        if (about.includes('notitle')) return res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: 'no' } }));
        const answer = about.includes('longtitle') ? 'Here is a title for you: a very long one that keeps going on' : '"Mock chat title."';
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        sse(res, { choices: [{ delta: { content: answer } }] });
        sse(res, { choices: [{ delta: {}, finish_reason: 'stop' }] });
        return res.end('data: [DONE]\n\n');
      }
      const last = body.messages.filter((m) => m.role === 'user').at(-1);
      const parts = Array.isArray(last.content) ? last.content : [{ type: 'text', text: last.content }];
      const text = parts[0].text;
      requests.push({
        model: body.model,
        text,
        hasTools: Boolean(body.tools),
        maxTokens: body.max_tokens,
        toolNames: (body.tools ?? []).map((t) => t.function.name),
        sent: JSON.stringify(body.messages),
        system: body.messages[0].role === 'system' ? body.messages[0].content : '',
        images: parts.filter((p) => p.type === 'image_url').length,
        hasFile: parts.some((p) => p.type === 'text' && p.text.includes('<file name=')),
      });

      if (body.tools && text.startsWith('notools')) {
        return res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: 'litellm.UnsupportedParamsError: tools is not supported' } }));
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });

      if (body.tools && text.startsWith('cuttool')) {
        sse(res, { choices: [{ delta: { content: 'I\'ll check the settings.', tool_calls: [{ index: 0, id: 'x1', type: 'function', function: { name: 'read_file', arguments: '{"path":"proj' } }] } }] });
        sse(res, { choices: [{ delta: {}, finish_reason: 'length' }] });
        if (body.stream_options?.include_usage) sse(res, usage(body, 'x'.repeat(100)));
        return res.end('data: [DONE]'); // no line break after the last line
      }

      if (body.tools && text.startsWith('paste')) {
        const results = body.messages.filter((m) => m.role === 'tool');
        const id = JSON.stringify(body.messages).match(/pasted id=\\"(\w+)\\"/)?.[1];
        const call = (name, args) => ({ index: 0, id: `c${results.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } });
        if (results.length === 0) sse(res, { choices: [{ delta: { tool_calls: [call('search_paste', { id, query: 'ERROR' })] } }] });
        else if (results.length === 1) sse(res, { choices: [{ delta: { tool_calls: [call('read_paste', { id, start_line: 600, end_line: 602 })] } }] });
        else sse(res, { choices: [{ delta: { content: `SEARCH[${results[0].content.split('\n').slice(0, 2).join(' | ')}] READ[${results[1].content.replace(/\n/g, ' | ')}]` } }] });
        sse(res, { choices: [{ delta: {}, finish_reason: results.length < 2 ? 'tool_calls' : 'stop' }] });
        if (body.stream_options?.include_usage) sse(res, usage(body, 'x'.repeat(100)));
        return res.end('data: [DONE]\n\n');
      }

      if (body.tools && text.startsWith('edit')) {
        const results = body.messages.filter((m) => m.role === 'tool');
        const call = (id, name, args) => ({ index: Number(id.slice(1)), id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
        if (results.length === 0) {
          sse(res, { choices: [{ delta: { content: 'Making two changes.', tool_calls: [
            call('e0', 'edit_file', { path: 'wproject/src/app.js', old_text: '"hi"', new_text: '"hello"' }),
            call('e1', 'write_file', { path: 'wproject/notes/new.txt', content: 'fresh\n' }),
          ] } }] });
        } else if (results.length === 2) {
          sse(res, { choices: [{ delta: { tool_calls: [call('e0', 'edit_file', { path: 'wproject/src/app.js', old_text: 'nope', new_text: 'x' })] } }] });
        } else {
          sse(res, { choices: [{ delta: { content: `EDIT[${results[0].content}] CREATE[${results[1].content}] BAD[${results[2].content}]` } }] });
        }
        sse(res, { choices: [{ delta: {}, finish_reason: results.length < 3 ? 'tool_calls' : 'stop' }] });
        if (body.stream_options?.include_usage) sse(res, usage(body, 'x'.repeat(100)));
        return res.end('data: [DONE]\n\n');
      }

      if (body.tools && text.startsWith('slowgitlab')) { // a GitLab search that never answers, to check Stop
        sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'gs', type: 'function', function: { name: 'gitlab_search', arguments: '{"query":"hang"}' } }] } }] });
        sse(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
        return res.end('data: [DONE]\n\n');
      }

      if (body.tools && text.startsWith('gitlab')) {
        const results = body.messages.filter((m) => m.role === 'tool');
        const call = (i, name, args) => ({ index: i, id: `gl${i}`, type: 'function', function: { name, arguments: JSON.stringify(args) } });
        if (results.length === 0) {
          sse(res, { choices: [{ delta: { tool_calls: [
            call(0, 'gitlab_api', { path: 'pipelines?ref=main&per_page=1' }),
            call(1, 'gitlab_api', { path: 'jobs/502/trace', start_line: 240 }),
            call(2, 'gitlab_read', { path: 'platform/route-service/src/handler.js' }),
            call(3, 'gitlab_search', { query: 'timeout' }),
            call(4, 'gitlab_list', { path: 'platform/route-service/src' }),
            call(5, 'gitlab_read', { path: 'src/handler.js' }),
            call(6, 'gitlab_api', { path: '../../users' }),
            call(7, 'gitlab_api', { path: 'jobs/%2E%2e/%2e%2e/users' }),
          ] } }] });
        } else {
          sse(res, { choices: [{ delta: { content: results.map((r) => r.content).join(' || ') } }] });
        }
        sse(res, { choices: [{ delta: {}, finish_reason: results.length ? 'stop' : 'tool_calls' }] });
        if (body.stream_options?.include_usage) sse(res, usage(body, 'x'.repeat(100)));
        return res.end('data: [DONE]\n\n');
      }

      if (body.tools && text.startsWith('git')) {
        const results = body.messages.filter((m) => m.role === 'tool');
        if (results.length === 0) {
          sse(res, { choices: [{ delta: { tool_calls: [
            { index: 0, id: 'g1', type: 'function', function: { name: 'git_log', arguments: '{}' } },
            { index: 1, id: 'g2', type: 'function', function: { name: 'git_diff', arguments: '{}' } },
          ] } }] });
        } else {
          sse(res, { choices: [{ delta: { content: `LOG[${results[0].content.split('\n')[0]}] DIFF[${results[1].content.split('\n')[0]}]` } }] });
        }
        sse(res, { choices: [{ delta: {}, finish_reason: results.length ? 'stop' : 'tool_calls' }] });
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
            { index: 0, id: 'c2', type: 'function', function: { name: 'read_file', arguments: '{"path":"project/src/app.js"}' } },
            { index: 1, id: 'c3', type: 'function', function: { name: 'read_file', arguments: '{"path":"project/../secret.txt"}' } },
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
  return { url: await listen(server), requests, auths, rejected, titles, close: () => server.close() };
}

// A fake OpenID Connect provider for the sign-in tests: discovery, an authorize page that signs
// "alice" in straight away, and a token endpoint that checks PKCE and rotates refresh tokens.
// Access tokens are at-1, at-2, …; `expiresIn` sets how long the next ones last (seconds).
// `scope` is what token responses say they grant; `api(req, res, url)` can answer other paths.
export async function startIdp({ scope, api } = {}) {
  const crypto = await import('node:crypto');
  const codes = new Map(); // code -> { challenge, nonce, redirect }
  let n = 0;
  let refresh = null; // the only refresh token that still works
  const idp = { url: '', expiresIn: 3600, grants: [], scope };
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const tokens = (nonce) => {
    n++;
    refresh = `rt-${n}`;
    const idToken = `${b64({ alg: 'none' })}.${b64({ iss: idp.url, sub: 'u1', preferred_username: 'alice', nonce, exp: Math.floor(Date.now() / 1000) + idp.expiresIn })}.`;
    return { access_token: `at-${n}`, id_token: idToken, refresh_token: refresh, expires_in: idp.expiresIn, token_type: 'Bearer', ...(idp.scope && { scope: idp.scope }) };
  };
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.end();
    const url = new URL(req.url, idp.url);
    if (url.pathname === '/.well-known/openid-configuration') {
      return res.end(JSON.stringify({ issuer: idp.url, authorization_endpoint: `${idp.url}/authorize`, token_endpoint: `${idp.url}/token` }));
    }
    if (url.pathname === '/authorize') {
      const p = url.searchParams;
      if (p.get('code_challenge_method') !== 'S256' || p.get('response_type') !== 'code') return res.writeHead(400).end('bad request');
      const code = `code-${codes.size + 1}`;
      codes.set(code, { challenge: p.get('code_challenge'), nonce: p.get('nonce'), redirect: p.get('redirect_uri') });
      const back = new URL(p.get('redirect_uri'));
      back.searchParams.set('code', code);
      back.searchParams.set('state', p.get('state'));
      return res.writeHead(302, { Location: back.href }).end();
    }
    if (url.pathname === '/token' && req.method === 'POST') {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const p = new URLSearchParams(raw);
        idp.grants.push(p.get('grant_type'));
        const fail = (error) => res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error }));
        if (p.get('grant_type') === 'authorization_code') {
          const c = codes.get(p.get('code'));
          codes.delete(p.get('code'));
          const hash = c && crypto.createHash('sha256').update(p.get('code_verifier') ?? '').digest('base64url');
          if (!c || hash !== c.challenge || p.get('redirect_uri') !== c.redirect) return fail('invalid_grant');
          return res.end(JSON.stringify(tokens(c.nonce)));
        }
        if (p.get('grant_type') === 'refresh_token') {
          if (p.get('refresh_token') !== refresh) return fail('invalid_grant');
          return res.end(JSON.stringify(tokens(undefined)));
        }
        fail('unsupported_grant_type');
      });
      return;
    }
    if (api?.(req, res, url)) return;
    res.writeHead(404).end();
  });
  idp.url = await listen(server);
  idp.close = () => server.close();
  return idp;
}

// A fake GitLab: sign-in (startIdp, granting "openid read_api") plus a small read-only API with one
// project. `gitlab.methods` lists the HTTP method of every API request, to check they're all reads.
export async function startGitlab() {
  const projects = [
    { id: 7, path_with_namespace: 'platform/route-service', default_branch: 'main', last_activity_at: '2026-10-09T10:00:00Z' },
    { id: 8, path_with_namespace: 'alice/notes', default_branch: 'master', last_activity_at: '2026-10-01T10:00:00Z' },
    { id: 9, path_with_namespace: 'alice/empty', last_activity_at: '2026-09-01T10:00:00Z' }, // no branches yet
  ];
  const hoursAgo = (h) => ({ committed_date: new Date(Date.now() - h * 3600_000).toISOString() });
  const branches = [ // by name, as GitLab gives them unless asked to sort
    { name: 'feat/sso', commit: hoursAgo(50) }, { name: 'main', default: true, commit: hoursAgo(2) }, { name: 'release/2.4', commit: hoursAgo(5) },
  ];
  const tree = [
    { type: 'blob', path: 'README.md' }, { type: 'tree', path: 'src' }, { type: 'blob', path: 'src/handler.js' },
    { type: 'tree', path: 'deploy' }, { type: 'blob', path: 'deploy/route.yaml' },
  ];
  const files = { 'src/handler.js': 'export function handle() {\n  const timeout = 30_000;\n  return timeout;\n}\n', 'README.md': '# Route service\n' };
  const log = Array.from({ length: 250 }, (_, i) => (i === 249 ? '\x1b[31mFAIL handler.test.js: expected 30000, got 120000\x1b[0m' : `\x1b[32mstep ${i + 1}\x1b[0m`)).join('\n');
  const gitlab = { methods: [], refs: [] };
  const json = (res, body) => res.setHeader('Content-Type', 'application/json').end(JSON.stringify(body));
  const api = (req, res, url) => {
    if (!url.pathname.startsWith('/api/v4/')) return false;
    gitlab.methods.push(req.method);
    if (!/^Bearer at-\d+$/.test(req.headers.authorization ?? '')) { res.writeHead(401).end(JSON.stringify({ message: '401 Unauthorized' })); return true; }
    const p = url.pathname.slice(7);
    const q = url.searchParams;
    if (p === '/user') return json(res, { username: 'alice' }), true;
    if (p === '/projects') return json(res, projects.filter((x) => x.path_with_namespace.includes(q.get('search') ?? ''))), true;
    if (p.startsWith('/projects/7/repository/') && q.get('ref')) gitlab.refs.push(q.get('ref')); // the files' branch
    if (p === '/projects/7/repository/branches') {
      const found = branches.filter((b) => b.name.includes(q.get('search') ?? ''));
      if (q.get('sort') === 'updated_desc') found.sort((x, y) => y.commit.committed_date.localeCompare(x.commit.committed_date));
      return json(res, found), true;
    }
    if (p === '/projects/7/search' && q.get('search') === 'hang') return (gitlab.searches = 1), true; // never answers
    if (p === '/projects/7/repository/tree') {
      const under = q.get('path');
      return json(res, q.get('page') > 1 ? [] : tree.filter((t) => !under || t.path.startsWith(`${under}/`))), true;
    }
    const file = p.match(/^\/projects\/7\/repository\/files\/(.+)\/raw$/);
    if (file) {
      const text = files[decodeURIComponent(file[1])];
      if (text == null) { res.writeHead(404).end(JSON.stringify({ message: '404 File Not Found' })); return true; }
      return res.end(text), true;
    }
    if (p === '/projects/7/search') return json(res, q.get('search') === 'timeout' ? [{ path: 'src/handler.js', startline: 1, data: 'export function handle() {\n  const timeout = 30_000;\n' }] : []), true;
    if (p === '/projects/7/pipelines') return json(res, [{ id: 99, status: 'failed', sha: 'abcdef1234567', web_url: 'https://gitlab.example/platform/route-service/-/pipelines/99' }]), true;
    if (p === '/projects/7/pipelines/99/jobs') return json(res, [{ id: 501, name: 'build', stage: 'build', status: 'success' }, { id: 502, name: 'test-unit', stage: 'test', status: 'failed' }]), true;
    if (p === '/projects/7/jobs/502/trace') return res.end(log), true;
    res.writeHead(404).end(JSON.stringify({ message: '404 Not Found' }));
    return true;
  };
  const idp = await startIdp({ scope: 'openid read_api', api });
  return Object.assign(idp, gitlab);
}
