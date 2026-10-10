// GitLab, read-only (optional add-on). Each person connects their own GitLab in Settings, using their
// own GitLab app (the steps are shown right there), then connects one project to a chat. That chat
// gets four tools: list, search and read files, and gitlab_api for the rest of the project's API
// (pipelines, jobs and their logs, merge requests, commits…), where the model finds its own way.
// Every request is a read (GET); nothing in here can change anything in GitLab.
//
// Rules, all fixed: the token must not grant more than the scopes in ALLOWED, or it's refused and
// never kept; file paths start with the project's path ("team/app/src/main.js"); gitlab_api paths
// are relative to the project ("pipelines?ref=main") and can't leave it; the branch is the
// project's default branch unless you pick another on the chip; GitLab gets 30 seconds per
// request, then the tool says it didn't answer. Settings (address and Application ID) are stored with
// the other settings; the token lives in this tab only, like sign-in's.
//
// To remove it: delete this file, styles/components/gitlab.css and tests/suites/gitlab.mjs, their
// lines in index.html and tests/run.mjs (including the "gitlab" menu item and the Settings slot),
// and the lines marked "gitlab" in main.js and composer.js.

import { el } from './dom.js';
import { createAuth } from './oidc.js';
import { globTest } from './folder.js';
import { MAX_LINES, MAX_CHARS, splitLines, numberedRange } from './lines.js';

const ALLOWED = ['openid', 'profile', 'email', 'read_user', 'read_api', 'read_repository'];
const SCOPE = 'openid read_api';
const MAX_FILES = 500; // per listing
const MAX_MATCHES = 100; // lines per search
const MAX_BYTES = 4 * 1024 * 1024;
const WAIT = 30; // seconds GitLab gets to answer one request

// How long ago, in the largest whole unit: "now", "5m", "3h", "2d", "3w", "4mo", "2y". Unknown: "".
export function ago(date, now = Date.now()) {
  const s = (now - Date.parse(date)) / 1000;
  if (!(s >= 0)) return '';
  for (const [unit, size] of [['y', 31_536_000], ['mo', 2_592_000], ['w', 604_800], ['d', 86_400], ['h', 3600], ['m', 60]]) {
    if (s >= size) return `${Math.floor(s / size)}${unit}`;
  }
  return 'now';
}

const str = (description) => ({ type: 'string', description });
const int = (description) => ({ type: 'integer', description });
const tool = (name, description, properties, required = []) =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

export const GITLAB_TOOLS = [
  tool('gitlab_list', 'List file paths in the connected GitLab project, or in one of its folders, on the connected branch.', {
    path: str('Folder, starting with the project path like every path. Empty for the whole project.'),
    pattern: str('Only names matching this glob, e.g. "*.yaml".'),
  }),
  tool('gitlab_search', "Search the connected GitLab project's files for text. Returns matching lines with line numbers, grouped by file.", {
    query: str('Text to find.'),
  }, ['query']),
  tool('gitlab_read', `Read a file from the connected GitLab project. Long files come back ${MAX_LINES} lines at a time; ask for the next part with start_line.`, {
    path: str('File path, starting with the project path.'),
    start_line: int('First line to read (from 1).'),
    end_line: int('Last line to read.'),
  }, ['path']),
  tool('gitlab_api', `A read-only GitLab API request (GET) for the connected project: anything GitLab's REST API has under /projects/:id/, such as pipelines, jobs and their logs, merge requests, commits and issues. JSON comes back indented; long answers come back ${MAX_LINES} lines at a time, and the note says how many there are, so ask for any part (like the end of a job log) with start_line.`, {
    path: str('The API path after /projects/:id/, with any query, e.g. "pipelines?ref=main&per_page=5", "pipelines/123/jobs", "jobs/456/trace", "merge_requests?state=opened".'),
    start_line: int('First line to read (from 1).'),
    end_line: int('Last line to read.'),
  }, ['path']),
];

export const isGitlabTool = (name) => name.startsWith('gitlab_');

export const gitlabPrompt = (project) =>
  `The user connected the GitLab project "${project.path}" (branch ${project.ref}) to this chat, read-only. ` +
  `Every path starts with "${project.path}/". Use gitlab_search to find things before reading files. ` +
  'gitlab_api reads the rest of the project from GitLab\'s API (pipelines, jobs and their logs, merge requests, commits, issues). ' +
  'When you mention something GitLab gave a web_url for, link to it with that URL.';

export function createGitlab({ box, menuItem, chat, getSettings, saveSettings, onChange }) {
  let auth = null;
  let user = '';
  let found = null; // the address last checked, and whether it's a GitLab: { url, ok }

  const address = () => String(getSettings().gitlabUrl ?? '').trim().replace(/\/+$/, '');
  const clientId = () => String(getSettings().gitlabClientId ?? '').trim();

  function makeAuth() {
    auth = address() && clientId()
      ? createAuth({ issuer: address(), clientId: clientId(), scope: SCOPE }, { name: 'gitlab', allowedScopes: ALLOWED })
      : null;
    return auth;
  }

  // ---- reading GitLab: only ever GET ----

  // Each request (with its body) gets WAIT seconds; Stop (`signal`) ends it at once.
  async function get(path, { text = false, raw = false, signal } = {}) {
    for (let force = false; ; force = true) {
      const token = await auth?.getToken({ force });
      if (!token) throw new Error('GitLab is not connected. Connect it again in Settings.');
      const limit = AbortSignal.any([AbortSignal.timeout(WAIT * 1000), ...(signal ? [signal] : [])]);
      const res = await fetch(`${address()}/api/v4${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: limit });
      if (res.status === 401 && !force) continue; // one fresh token, then give up
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(`GitLab answered HTTP ${res.status}${body.message ? `: ${typeof body.message === 'string' ? body.message : JSON.stringify(body.message)}` : ''}`);
      }
      return raw ? res : text ? res.text() : res.json();
    }
  }

  // ---- Settings ----

  async function check(url) {
    if (found?.url === url) return found.ok;
    found = { url, ok: false };
    try {
      const res = await fetch(`${url}/.well-known/openid-configuration`);
      const info = res.ok ? await res.json() : null;
      found.ok = String(info?.issuer ?? '').replace(/\/+$/, '') === url;
    } catch {}
    return found.ok;
  }

  function copyRow(label, value) {
    const copy = el('button', 'btn gitlab-copy', 'Copy');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(value); copy.textContent = 'Copied'; } catch { copy.textContent = 'Select it'; }
      setTimeout(() => { copy.textContent = 'Copy'; }, 1200);
    });
    return [el('span', 'k', label), el('span', 'v', value), copy];
  }

  function steps(url) {
    const list = el('ol', 'gitlab-steps');
    const open = el('a', 'btn primary', 'Open GitLab applications');
    open.href = `${url}/-/user_settings/applications`;
    open.target = '_blank';
    open.rel = 'noopener';
    const values = el('div', 'gitlab-values');
    values.append(...copyRow('Name', 'slop'), ...copyRow('Redirect URI', location.origin + location.pathname));
    const ticks = el('div', 'gitlab-ticks');
    ticks.append(el('span', 'tick', 'openid'), el('span', 'tick', 'read_api'), el('span', 'tick no', 'Confidential'));
    const item = (...parts) => { const li = el('li'); const d = el('div'); d.append(...parts); li.append(d); return li; };
    list.append(
      item('Open your GitLab\'s applications page', open),
      item('Add a new application with these values', values, el('span', '', 'Tick only these, and untick Confidential:'), ticks),
      item('Save, then copy the Application ID it shows into the box below.'),
    );
    return list;
  }

  function draw(message = '') {
    if (!box) return;
    const head = el('div', 'gitlab-head', 'GitLab (optional)');
    const urlInput = el('input');
    Object.assign(urlInput, { id: 'gitlab-url', type: 'url', placeholder: 'https://gitlab.example.com', value: getSettings().gitlabUrl ?? '', spellcheck: false, autocomplete: 'off' });
    const urlLabel = el('label', '', 'GitLab address');
    const status = el('span', 'gitlab-found');
    urlLabel.append(urlInput, status);
    const nodes = [head, urlLabel];

    if (auth?.signedIn()) {
      const out = el('button', 'btn', 'Disconnect');
      out.type = 'button';
      out.addEventListener('click', disconnect);
      const who = el('div', 'gitlab-who');
      who.append(el('span', '', user ? `Connected as ${user}` : 'Connected'), el('small', '', auth.scopes() || SCOPE));
      const row = el('div', 'gitlab-row');
      row.append(who, out);
      nodes.push(row);
      urlInput.disabled = true;
    } else {
      const idInput = el('input');
      Object.assign(idInput, { id: 'gitlab-client-id', placeholder: 'paste it here after step 3', value: getSettings().gitlabClientId ?? '', spellcheck: false, autocomplete: 'off' });
      const idLabel = el('label', '', "Your app's Application ID");
      idLabel.append(idInput);
      const go = el('button', 'btn primary', 'Connect GitLab');
      go.type = 'button';
      const note = el('span', 'gitlab-note', message);
      const row = el('div', 'gitlab-row');
      row.append(go, note);
      const stepsSlot = el('div');
      nodes.push(stepsSlot, idLabel, row);

      const refresh = async () => {
        const url = urlInput.value.trim().replace(/\/+$/, '');
        stepsSlot.replaceChildren();
        status.textContent = '';
        go.disabled = !url || !idInput.value.trim();
        if (!/^https?:\/\/\S+$/.test(url)) return;
        const ok = await check(url);
        if (urlInput.value.trim().replace(/\/+$/, '') !== url) return; // typed on meanwhile
        status.textContent = ok ? 'GitLab found' : 'No GitLab sign-in at this address';
        status.className = `gitlab-found${ok ? ' ok' : ' bad'}`;
        if (ok) stepsSlot.replaceChildren(steps(url));
      };
      urlInput.addEventListener('change', () => { saveSettings({ gitlabUrl: urlInput.value.trim() }); refresh(); });
      urlInput.addEventListener('input', refresh);
      idInput.addEventListener('input', () => { go.disabled = !urlInput.value.trim() || !idInput.value.trim(); });
      idInput.addEventListener('change', () => saveSettings({ gitlabClientId: idInput.value.trim() }));
      go.addEventListener('click', async () => {
        await saveSettings({ gitlabUrl: urlInput.value.trim(), gitlabClientId: idInput.value.trim() });
        try { await makeAuth().signIn(); } catch (e) { note.textContent = `Couldn't connect: ${e.message}`; }
      });
      refresh();
    }
    box.replaceChildren(...nodes);
  }

  function disconnect() {
    auth?.signOut();
    user = '';
    if (menuItem) menuItem.hidden = true;
    draw();
    onChange();
  }

  async function whoAmI() {
    try { user = (await get('/user')).username ?? ''; } catch { user = ''; }
  }

  // ---- picking a project for a chat, and its branch ----

  // A searchable list in a dialog: `load(query)` gives the items, `row(item)` its [name, note, disabled], and
  // picking one closes the dialog with it (Esc or a click outside closes it with null). With `chip`, the
  // list grows up out of that chip: a copy of it is the dialog's bottom edge, right where it was.
  function choose({ className, placeholder, load, row, chip: from = null }) {
    return new Promise((resolve) => {
      const dialog = el('dialog', `gitlab-picker ${className}`);
      const q = el('input');
      Object.assign(q, { placeholder, spellcheck: false, autocomplete: 'off' });
      const list = el('div', 'gitlab-projects');
      dialog.append(q, list);
      let timer = 0;
      let asked = 0;

      const show = async () => {
        const n = ++asked;
        let items = [];
        try {
          items = await load(q.value.trim());
        } catch (e) {
          if (n === asked) list.replaceChildren(el('div', 'gitlab-note', e.message));
          return;
        }
        if (n !== asked) return;
        list.replaceChildren(...(items.length ? items.map((item) => {
          const [name, note, off = false] = row(item);
          const button = el('button', 'gitlab-project');
          button.type = 'button';
          button.disabled = off;
          button.append(...(typeof name === 'string' ? [el('span', '', name)] : name), ...(note ? [note] : []));
          button.addEventListener('click', () => done(item));
          return button;
        }) : [el('div', 'gitlab-note', 'Nothing matches.')]));
      };
      const done = (item) => { dialog.close(); dialog.remove(); resolve(item); };
      q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(show, 250); });
      dialog.addEventListener('cancel', () => done(null));
      dialog.addEventListener('click', (e) => { if (e.target === dialog) done(null); }); // outside it
      chat.append(dialog); // inside the chat, so it has the chat's theme
      if (from) {
        const head = from.cloneNode(true);
        head.querySelector('.tray-remove')?.remove();
        const caret = head.querySelector('.gitlab-caret');
        if (caret) caret.textContent = '▴';
        head.classList.add('gitlab-head-chip');
        head.addEventListener('click', () => done(null));
        dialog.append(head);
        const r = from.getBoundingClientRect();
        const view = from.ownerDocument.defaultView; // the tab, or the mini window when the chat is there
        Object.assign(dialog.style, { left: `${r.left}px`, bottom: `${view.innerHeight - r.bottom}px`, minWidth: `${r.width}px` });
      }
      dialog.showModal();
      q.focus();
      show();
    });
  }

  // Picking a project connects it straight away, on its default branch.
  async function pick() {
    const p = await choose({
      className: 'projects',
      placeholder: 'Search your projects',
      load: (query) => get(`/projects?membership=true&simple=true&order_by=last_activity_at&per_page=20${query ? `&search=${encodeURIComponent(query)}` : ''}`),
      // The project's name, and its group underneath: "route-service" over "platform/backend".
      row: (p) => {
        const at = p.path_with_namespace.lastIndexOf('/');
        const group = p.path_with_namespace.slice(0, at) + (p.default_branch ? '' : ' · no branches yet');
        return [[el('span', 'gitlab-project-name', p.path_with_namespace.slice(at + 1)), el('span', 'gitlab-project-group', group)], null, !p.default_branch];
      },
    });
    return p ? { id: p.id, path: p.path_with_namespace, ref: p.default_branch } : null;
  }

  // The branch list, grown out of the chip: the default branch first, then the most recently pushed,
  // each with how long ago its last commit was. The one in use is ticked.
  async function pickBranch(project, chipEl) {
    const b = await choose({
      className: 'branches',
      placeholder: 'Find a branch',
      chip: chipEl,
      load: async (query) => {
        const all = await get(`/projects/${project.id}/repository/branches?per_page=20&sort=updated_desc${query ? `&search=${encodeURIComponent(query)}` : ''}`);
        return [...all.filter((x) => x.default), ...all.filter((x) => !x.default)];
      },
      row: (b) => {
        const name = el('span', 'gitlab-branch-name', b.name);
        if (b.default) name.append(el('small', '', 'default'));
        return [[el('span', 'gitlab-tick', b.name === project.ref ? '✓' : ''), name], el('small', 'gitlab-ago', ago(b.commit?.committed_date))];
      },
    });
    return b ? { ...project, ref: b.name } : null;
  }

  // ---- the tools ----

  // A path from the model: it must start with the project path, which is then removed.
  function inside(project, path) {
    const parts = String(path ?? '').split('/').filter((p) => p && p !== '.');
    if (parts.includes('..')) throw new Error('paths must stay inside the project');
    const top = project.path.split('/');
    if (top.some((p, i) => parts[i] !== p)) throw new Error(`paths start with the project path, like "${project.path}/${parts.join('/') || '…'}"`);
    return parts.slice(top.length).join('/');
  }
  const shown = (project, path) => (path ? `${project.path}/${path}` : project.path);

  async function run(project, name, argsJson, signal) {
    let args = {};
    try {
      args = JSON.parse(argsJson || '{}');
      const p = `/projects/${project.id}`;
      const ref = encodeURIComponent(project.ref);

      if (name === 'gitlab_list') {
        const path = args.path ? inside(project, args.path) : '';
        const test = globTest(args.pattern);
        const files = [];
        for (let page = 1; page <= 5 && files.length < MAX_FILES; page++) {
          const items = await get(`${p}/repository/tree?recursive=true&per_page=100&page=${page}&ref=${ref}${path ? `&path=${encodeURIComponent(path)}` : ''}`, { signal });
          files.push(...items.filter((i) => i.type === 'blob').map((i) => shown(project, i.path)).filter(test));
          if (items.length < 100) break;
        }
        const result = files.length ? files.slice(0, MAX_FILES).join('\n') + (files.length >= MAX_FILES ? '\n…and maybe more. Narrow it with path or pattern.' : '') : (args.pattern ? `No files match ${args.pattern}.` : '(no files)');
        return { label: `Listed ${shown(project, path)}`, result };
      }

      if (name === 'gitlab_search') {
        if (!args.query) throw new Error('no query given');
        const hits = await get(`${p}/search?scope=blobs&ref=${ref}&search=${encodeURIComponent(args.query)}&per_page=50`, { signal });
        const needle = String(args.query).toLowerCase();
        const out = [];
        let total = 0;
        for (const hit of hits) {
          const lines = splitLines(hit.data ?? '');
          const matching = lines.map((l, i) => [hit.startline + i, l]).filter(([, l]) => l.toLowerCase().includes(needle));
          if (!matching.length || total >= MAX_MATCHES) continue;
          out.push(shown(project, hit.path), ...matching.slice(0, MAX_MATCHES - total).map(([n, l]) => `  ${n}: ${l.trim().slice(0, 200)}`));
          total += Math.min(matching.length, MAX_MATCHES - total);
        }
        return { label: `Searched GitLab for "${args.query}"`, result: out.length ? `${total} matching lines\n${out.join('\n')}` : `No matches for "${args.query}".` };
      }

      if (name === 'gitlab_read') {
        const path = inside(project, args.path);
        if (!path) throw new Error('give a file path, not the project itself');
        const text = await get(`${p}/repository/files/${encodeURIComponent(path)}/raw?ref=${ref}`, { text: true, signal });
        if (text.length > MAX_BYTES) throw new Error('file is larger than 4 MB');
        if (text.includes('\0')) throw new Error('not a text file');
        const lines = splitLines(text);
        const ranged = args.start_line != null || args.end_line != null;
        if (!ranged && lines.length <= MAX_LINES && text.length <= MAX_CHARS) return { label: `Read ${shown(project, path)}`, result: text || '(empty file)' };
        const { from, last, text: result } = numberedRange(lines, args.start_line, args.end_line);
        return { label: `Read ${shown(project, path)}${ranged ? `:${from}–${last}` : ''}`, result };
      }

      if (name === 'gitlab_api') {
        const path = String(args.path ?? '');
        // Browsers also read "%2e%2e" as ".." and a backslash as "/", so neither can leave the project.
        const parts = path.split(/[?#]/)[0].split(/[/\\]/).map((x) => x.toLowerCase().replace(/%2e/g, '.'));
        if (!path || /^[/\\]/.test(path) || path.includes('://') || parts.some((x) => x === '..' || x === '.')) {
          throw new Error('give the path after /projects/:id/, like "pipelines?ref=main"');
        }
        const res = await get(`${p}/${path}`, { raw: true, signal });
        let text = await res.text();
        if (text.length > MAX_BYTES) throw new Error('the answer is larger than 4 MB; ask for less (per_page, filters)');
        // JSON indented so it reads in lines; colour codes (as in job logs) removed.
        if ((res.headers.get('content-type') ?? '').includes('json')) text = JSON.stringify(JSON.parse(text), null, 1);
        text = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '');
        const lines = splitLines(text);
        const ranged = args.start_line != null || args.end_line != null;
        if (!ranged && lines.length <= MAX_LINES && text.length <= MAX_CHARS) return { label: `Read GitLab ${path}`, result: text || '(empty)' };
        const { from, last, text: result } = numberedRange(lines, args.start_line, args.end_line);
        return { label: `Read GitLab ${path}${ranged ? `:${from}–${last}` : ''}`, result };
      }
      throw new Error(`unknown tool ${name}`);
    } catch (e) {
      if (e.name === 'AbortError') throw e; // Stop
      if (e.name === 'TimeoutError') e = new Error(`GitLab didn't answer within ${WAIT} seconds`);
      return { label: `Couldn't ${name.replace('gitlab_', '')} in GitLab`, result: `Error: ${e.message}` };
    }
  }

  return {
    connected: () => Boolean(auth?.signedIn()),
    // At start: set up from Settings, finish a connect that's coming back from GitLab, learn who you are.
    async start() {
      makeAuth();
      const message = auth ? await auth.handleCallback() : '';
      if (menuItem) menuItem.hidden = !auth?.signedIn();
      draw(message);
      if (auth?.signedIn()) whoAmI().then(() => draw(message)); // "Connected as …" fills in when GitLab answers
      return message;
    },
    draw: (message) => { if (menuItem) menuItem.hidden = !auth?.signedIn(); draw(message); },
    disconnect,
    pick,
    pickBranch,
    run,
  };
}
