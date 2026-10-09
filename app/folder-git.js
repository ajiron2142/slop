// Git, read-only (optional add-on). When the connected folder is a git repository, the model gets
// git_log and git_diff, and the folder chip shows the branch and how many commits it is ahead of
// or behind its upstream (as of your last fetch). It reads .git directly with the browser's own
// zlib and SHA-1: no library, no network, and nothing is ever written.
//
// To remove it: delete this file, styles/components/folder-git.css and tests/suites/git.mjs,
// their lines in index.html and tests/run.mjs, and the lines marked "git" in main.js and
// composer.js. (diff.js stays: write mode uses it too.)

import { cleanPath } from './folder.js';
import { diffLines, unifiedText } from './diff.js';

export const gitPrompt =
  'The folder is a git repository. Use git_log for its history and git_diff to see what changed, ' +
  'in a commit or in the uncommitted work. They only read: nothing can be committed, fetched or pushed.';

const str = (description) => ({ type: 'string', description });
const tool = (name, description, properties) =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required: [] } } });

export const GIT_TOOLS = [
  tool('git_log', 'List commits, newest first: short hash, date, author, subject, and the branches and tags that point at them.', {
    range: str('A branch, tag or commit like "main", "v1.2" or "HEAD~5", or a range "main..feature" (commits in feature that main lacks). Default: the current branch.'),
    path: str('Only commits that changed this file or folder.'),
    search: str('Only commits whose message or author contains this text.'),
    limit: { type: 'integer', description: 'How many commits (default 20, at most 100).' },
  }),
  tool('git_diff', "Show changes as a unified diff. Without from: the uncommitted changes (staged or not, and new files) compared with the last commit. With only from: that commit's message and changes. With from and to: the changes between them.", {
    from: str('A commit, branch or tag, e.g. "a1b2c3d", "HEAD~1" or "main".'),
    to: str('A second commit, branch or tag to compare with from.'),
    path: str('Only this file or folder.'),
  }),
];

export const isGitTool = (name) => name === 'git_log' || name === 'git_diff';

const MAX_WALK = 3000; // commits looked at per question
const MAX_OUT = 40_000; // characters of diff per answer (~10k tokens)
const MAX_BLOB = 1024 * 1024; // larger files are listed, not diffed
const MAX_UNTRACKED = 20_000; // files looked at for new, untracked ones

// ---- the folder chip ----

const repos = new WeakMap(); // folder handle -> repo (objects stay cached while the page is open)
const statuses = new WeakMap(); // folder handle -> { branch, ahead, behind }, null when not a repo

// The last known status, for drawing the chip.
export const gitStatusOf = (root) => statuses.get(root) ?? null;

// Reads the branch and ahead/behind again. Quietly does nothing without permission to read.
export async function refreshGit(root) {
  try {
    if (!root || (await root.queryPermission({ mode: 'read' })) !== 'granted') return null;
    const repo = await openRepo(root);
    const status = repo && await branchStatus(repo);
    statuses.set(root, status);
    return status;
  } catch {
    return statuses.get(root) ?? null;
  }
}

async function openRepo(root) {
  if (repos.has(root)) return repos.get(root);
  let git;
  try { git = await root.getDirectoryHandle('.git'); } catch { return null; } // also when .git is a file (a worktree)
  const repo = { root, git, objects: new Map(), packs: null };
  // A shallow clone lacks history before these commits; treat them as the first ones.
  repo.shallow = new Set(((await readText(git, 'shallow')) ?? '').split('\n').filter(Boolean));
  repos.set(root, repo);
  return repo;
}

export const isRepo = async (root) => Boolean(await openRepo(root));

async function branchStatus(repo) {
  const head = (await readText(repo.git, 'HEAD'))?.trim() ?? '';
  const branch = head.startsWith('ref: refs/heads/') ? head.slice(16) : null;
  const status = { branch: branch ?? head.slice(0, 7), ahead: null, behind: null };
  const local = await resolveRef(repo, 'HEAD');
  const upstream = branch && await upstreamOf(repo, branch);
  const remote = upstream && await resolveRef(repo, upstream);
  if (local && remote) {
    const ahead = await revWalk(repo, [local], [remote], { count: true });
    const behind = await revWalk(repo, [remote], [local], { count: true });
    if (!ahead.capped && !behind.capped) Object.assign(status, { ahead: ahead.total, behind: behind.total });
  }
  return status;
}

// "refs/remotes/origin/main" for a branch that tracks origin/main, from .git/config.
async function upstreamOf(repo, branch) {
  const config = (await readText(repo.git, 'config')) ?? '';
  let inSection = false;
  let remote = null;
  let merge = null;
  for (const raw of config.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) { inSection = line === `[branch "${branch}"]`; continue; }
    if (!inSection) continue;
    const [, key, value] = line.match(/^(\w+)\s*=\s*(.*)$/) ?? [];
    if (key === 'remote') remote = value;
    if (key === 'merge') merge = value;
  }
  if (!remote || !merge?.startsWith('refs/heads/')) return null;
  return remote === '.' ? merge : `refs/remotes/${remote}/${merge.slice(11)}`;
}

// ---- the tools ----

export async function runGitTool(root, name, argsJson) {
  let args = {};
  try {
    args = JSON.parse(argsJson || '{}');
    const repo = await openRepo(root);
    if (!repo) throw new Error('the connected folder is not a git repository');
    return name === 'git_log' ? await log(repo, args) : await diff(repo, args);
  } catch (e) {
    return { label: `Couldn't ${name === 'git_log' ? 'read the git log' : 'diff'}${args.range || args.from ? ` ${args.range || args.from}` : ''}`, result: `Error: ${e.message}` };
  }
}

async function log(repo, { range, path, search, limit }) {
  path = cleanPath(path);
  limit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  if (!range && !(await resolveRef(repo, 'HEAD'))) return { label: 'Read git log', result: 'No commits yet.' };
  const [a, b] = String(range || 'HEAD').split('..');
  const include = [await revision(repo, b === undefined ? a : b || 'HEAD')];
  const exclude = b === undefined ? [] : [await revision(repo, a || 'HEAD')];
  const needle = search?.toLowerCase();
  const names = await refNames(repo);
  const lines = [];
  const { capped } = await revWalk(repo, include, exclude, {
    async take(c) {
      if (needle && !`${c.message}\n${c.author}`.toLowerCase().includes(needle)) return true;
      if (path && !(await touches(repo, c, path))) return true;
      const refs = names.get(c.sha);
      lines.push(`${c.sha.slice(0, 7)} ${date(c, false)} ${c.author.replace(/\s*<.*$/, '')}: ${c.message.split('\n')[0]}${refs ? ` (${refs.join(', ')})` : ''}`);
      return lines.length < limit;
    },
  });
  const label = `Read git log${range ? ` ${range}` : ''}${path ? ` for ${path}` : ''}`;
  if (!lines.length) return { label, result: capped ? `No matching commits in the newest ${MAX_WALK}.` : 'No matching commits.' };
  const more = lines.length === limit ? `\n(showing ${limit}; ask for more with limit, or narrow it with path, search or range)` : '';
  return { label, result: lines.join('\n') + more };
}

async function diff(repo, { from, to, path }) {
  path = cleanPath(path);
  const where = path ? ` in ${path}` : '';
  if (!from && !to) {
    const head = await resolveRef(repo, 'HEAD');
    const changes = await workingChanges(repo, head && (await readCommit(repo, head)).tree, path);
    const result = await describe(repo, changes, `uncommitted changes${where}, compared with the last commit${head ? ` (${head.slice(0, 7)})` : ''}`);
    return { label: `Diffed uncommitted changes${where}`, result };
  }
  if (!from) throw new Error('give from as well as to');
  const a = await readCommit(repo, await revision(repo, from));
  if (!to) {
    const parent = a.parents[0] && await readCommit(repo, a.parents[0]);
    const changes = await treeChanges(repo, parent?.tree, a.tree, path);
    const message = a.message.trimEnd().split('\n').map((l) => `    ${l}`).join('\n');
    const head = `commit ${a.sha}\nAuthor: ${a.author}\nDate:   ${date(a, true)}\n\n${message}\n\n`;
    return { label: `Diffed ${from}${where}`, result: head + await describe(repo, changes, `changes in this commit${where}`) };
  }
  const b = await readCommit(repo, await revision(repo, to));
  const changes = await treeChanges(repo, a.tree, b.tree, path);
  return { label: `Diffed ${from}..${to}${where}`, result: await describe(repo, changes, `changes from ${from} to ${to}${where}`) };
}

// Changes as text: a summary, then a unified diff per file until the size limit.
// Each change is { path, before, after } with blob ids or, for working files, { text }.
async function describe(repo, changes, what) {
  if (!changes.length) return `No ${what}.`;
  const parts = [];
  const listed = [];
  let size = 0;
  let add = 0;
  let del = 0;
  for (const c of changes.sort((x, y) => (x.path < y.path ? -1 : 1))) {
    const before = await content(repo, c.before);
    const after = await content(repo, c.after);
    if (before === undefined || after === undefined) {
      listed.push(`${c.path} (binary or larger than 1 MB, not shown)`);
      continue;
    }
    if (before !== null && after !== null && before.replace(/\r\n/g, '\n') === after.replace(/\r\n/g, '\n')) continue; // only line endings differ
    const lines = diffLines(before ?? '', after ?? '', before === null);
    add += lines.stats.add;
    del += lines.stats.del;
    const text = `--- ${before === null ? '/dev/null' : `a/${c.path}`}\n+++ ${after === null ? '/dev/null' : `b/${c.path}`}\n${after === null ? '(deleted)' : unifiedText(lines)}`;
    if (size + text.length > MAX_OUT) { listed.push(`${c.path} (+${lines.stats.add} −${lines.stats.del}, not shown: ask with path)`); continue; }
    size += text.length;
    parts.push(text);
  }
  const count = parts.length + listed.length;
  if (!count) return `No ${what}.`;
  const summary = `${count} file${count === 1 ? '' : 's'} changed, +${add} −${del}: ${what}`;
  return [summary, ...parts, ...(listed.length ? [`Not shown:\n${listed.join('\n')}`] : [])].join('\n\n');
}

// Text of a blob or working file; null when it doesn't exist; undefined when binary or too big.
async function content(repo, side) {
  if (!side) return null;
  const bytes = side.bytes ?? (await readObject(repo, side)).data;
  if (bytes.length > MAX_BLOB || bytes.includes(0)) return undefined;
  return new TextDecoder().decode(bytes);
}

// ---- comparing trees and the working folder ----

// Blobs that differ between two trees (either may be missing), as { path, before, after }.
async function treeChanges(repo, a, b, path) {
  if (path) [a, b] = await Promise.all([entryAt(repo, a, path), entryAt(repo, b, path)]);
  else [a, b] = [a && { mode: '40000', sha: a }, b && { mode: '40000', sha: b }];
  const out = [];
  await compare(repo, a, b, path, out);
  return out;
}

async function compare(repo, a, b, path, out) {
  if (a?.sha === b?.sha) return;
  const isDir = (e) => e?.mode === '40000';
  if (!isDir(a) && !isDir(b)) {
    if (a?.mode !== '160000' && b?.mode !== '160000') out.push({ path, before: a?.sha, after: b?.sha });
    return;
  }
  const ta = isDir(a) ? await readTree(repo, a.sha) : new Map();
  const tb = isDir(b) ? await readTree(repo, b.sha) : new Map();
  if (a && !isDir(a)) await compare(repo, a, null, path, out); // a file became a folder, or the reverse
  if (b && !isDir(b)) await compare(repo, null, b, path, out);
  for (const name of new Set([...ta.keys(), ...tb.keys()])) {
    await compare(repo, ta.get(name), tb.get(name), path ? `${path}/${name}` : name, out);
  }
}

async function entryAt(repo, tree, path) {
  let entry = tree && { mode: '40000', sha: tree };
  for (const part of path.split('/')) {
    if (entry?.mode !== '40000') return null;
    entry = (await readTree(repo, entry.sha)).get(part) ?? null;
  }
  return entry;
}

// Every file in a tree (or in one path of it), as path -> blob id.
async function flatten(repo, tree, path) {
  const out = new Map();
  const entry = path ? await entryAt(repo, tree, path) : tree && { mode: '40000', sha: tree };
  if (entry) await addEntry(repo, entry, path, out);
  return out;
}

async function addEntry(repo, e, path, out) {
  if (e.mode === '160000') return; // a submodule
  if (e.mode !== '40000') { out.set(path, e.sha); return; }
  for (const [name, sub] of await readTree(repo, e.sha)) await addEntry(repo, sub, path ? `${path}/${name}` : name, out);
}

// The working folder compared with the last commit: what `git diff HEAD` shows, plus new files.
// Files git's index says are unchanged (same size and time) aren't read, as in git itself.
async function workingChanges(repo, tree, path) {
  const committed = tree ? await flatten(repo, tree, path) : new Map();
  const index = await readIndex(repo).catch(() => new Map());
  const inPath = (p) => !path || p === path || p.startsWith(`${path}/`);
  const tracked = new Set([...committed.keys(), ...[...index.keys()].filter(inPath)]);
  const out = [];
  for (const p of tracked) {
    const file = await fileAt(repo.root, p);
    const before = committed.get(p);
    if (!file) { if (before) out.push({ path: p, before, after: null }); continue; }
    const known = index.get(p);
    const same = known && known.size === file.size && known.mtime === Math.floor(file.lastModified / 1000);
    const bytes = same ? null : new Uint8Array(await file.arrayBuffer());
    const sha = same ? known.sha : await hashBlob(bytes);
    if (sha !== before) out.push({ path: p, before, after: bytes ? { bytes } : sha });
  }
  // New files git doesn't track yet, minus ignored ones.
  const ignored = await ignoreRules(repo);
  const start = path ? await dirAt(repo.root, path) : repo.root;
  if (start) {
    for (const [p, handle] of await walkFiles(start, path, ignored)) {
      if (tracked.has(p)) continue;
      const file = await handle.getFile();
      out.push({ path: p, before: null, after: { bytes: file.size > MAX_BLOB ? new Uint8Array([0]) : new Uint8Array(await file.arrayBuffer()) } });
    }
  }
  return out;
}

async function walkFiles(dir, prefix, ignored, out = []) {
  for await (const entry of dir.values()) {
    if (out.length >= MAX_UNTRACKED) break;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.name === '.git' || ignored(path, entry.kind === 'directory')) continue;
    if (entry.kind === 'file') out.push([path, entry]);
    else await walkFiles(entry, path, ignored, out);
  }
  return out;
}

// The top-level .gitignore and .git/info/exclude (nested .gitignore files aren't read).
async function ignoreRules(repo) {
  const text = `${(await readText(repo.root, '.gitignore')) ?? ''}\n${(await readText(repo.git, 'info/exclude')) ?? ''}`;
  const rules = [];
  for (let line of text.split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const negate = line.startsWith('!');
    if (negate) line = line.slice(1);
    const dirOnly = line.endsWith('/');
    line = line.replace(/\/+$/, '');
    const anchored = line.includes('/');
    line = line.replace(/^\//, '');
    const body = line.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/|\/\*\*|\*\*|\*|\?/g, (m) => (m === '**/' ? '(.*/)?' : m === '/**' ? '/.*' : m === '**' ? '.*' : m === '*' ? '[^/]*' : '[^/]'));
    rules.push({ negate, dirOnly, re: new RegExp(anchored ? `^${body}$` : `(^|/)${body}$`) });
  }
  return (path, isDir) => {
    let hit = false;
    for (const r of rules) if ((!r.dirOnly || isDir) && r.re.test(path)) hit = !r.negate;
    return hit;
  };
}

// .git/index: path -> { sha, size, mtime } for the files git tracks (versions 2 to 4).
async function readIndex(repo) {
  const file = await fileAt(repo.git, 'index');
  const out = new Map();
  if (!file) return out;
  const buf = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buf.buffer);
  if (view.getUint32(0) !== 0x44495243) throw new Error('not an index file'); // "DIRC"
  const version = view.getUint32(4);
  const count = view.getUint32(8);
  let i = 12;
  let name = '';
  for (let n = 0; n < count; n++) {
    const start = i;
    const mtime = view.getUint32(i + 8);
    const size = view.getUint32(i + 36);
    const sha = hex(buf.subarray(i + 40, i + 60));
    const flags = view.getUint16(i + 60);
    i += 62 + (version >= 3 && flags & 0x4000 ? 2 : 0);
    if (version === 4) {
      let c = buf[i++];
      let strip = c & 127;
      while (c & 128) { c = buf[i++]; strip = ((strip + 1) << 7) | (c & 127); }
      const end = buf.indexOf(0, i);
      name = name.slice(0, name.length - strip) + utf8(buf.subarray(i, end));
      i = end + 1;
    } else {
      const end = buf.indexOf(0, i);
      name = utf8(buf.subarray(i, end));
      i = start + ((end - start + 8) & ~7);
    }
    if ((flags >> 12 & 3) === 0) out.set(name, { sha, size, mtime });
  }
  return out;
}

async function hashBlob(bytes) {
  const head = new TextEncoder().encode(`blob ${bytes.length}\0`);
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-1', await new Blob([head, bytes]).arrayBuffer())));
}

// ---- history ----

// Walks commits newest first from `include`, leaving out everything reachable from `exclude`.
// `take(commit)` returns false to stop; with `count`, commits are only counted.
async function revWalk(repo, include, exclude, { take, count } = {}) {
  const flags = new Map(); // sha -> 1 wanted, 2 left out
  const queue = [];
  const push = async (sha, flag) => {
    const had = flags.get(sha);
    if (had === 2 || had === flag) return;
    flags.set(sha, flag);
    if (had) return; // already queued; now left out
    const c = await readCommit(repo, sha);
    let i = queue.length;
    while (i > 0 && queue[i - 1].time > c.time) i--;
    queue.splice(i, 0, c);
  };
  for (const sha of exclude) await push(sha, 2);
  for (const sha of include) await push(sha, 1);
  let seen = 0;
  let total = 0;
  while (queue.length && queue.some((c) => flags.get(c.sha) === 1)) {
    if (++seen > MAX_WALK) return { total, capped: true };
    const c = queue.pop();
    const flag = flags.get(c.sha);
    for (const p of c.parents) await push(p, flag);
    if (flag !== 1) continue;
    total++;
    if (!count && !(await take(c))) break;
  }
  return { total, capped: false };
}

// Whether a commit changed `path` compared with its first parent.
async function touches(repo, c, path) {
  const mine = await entryAt(repo, c.tree, path);
  const parent = c.parents[0] && await entryAt(repo, (await readCommit(repo, c.parents[0])).tree, path);
  return mine?.sha !== parent?.sha;
}

function date(c, withTime) {
  const [, sign, h, m] = c.tz.match(/([+-])(\d\d)(\d\d)/) ?? [, '+', '00', '00'];
  const local = new Date((c.authored + (sign === '-' ? -1 : 1) * (h * 3600 + m * 60)) * 1000).toISOString();
  return withTime ? `${local.slice(0, 10)} ${local.slice(11, 16)} ${c.tz}` : local.slice(0, 10);
}

// ---- refs and revisions ----

// A revision like "main", "v1.2", "a1b2c3d", "HEAD~2" or "main^2", as a commit id.
async function revision(repo, rev) {
  const [, base, steps] = String(rev).trim().match(/^(.*?)((?:[~^]\d*)*)$/);
  let sha = await resolveRef(repo, base || 'HEAD') ?? await expand(repo, base);
  if (!sha) throw new Error(`unknown revision "${rev}"`);
  sha = await peel(repo, sha);
  for (const [, op, num] of steps.matchAll(/([~^])(\d*)/g)) {
    const n = num === '' ? 1 : Number(num);
    for (let k = 0; k < (op === '~' ? n : 1); k++) {
      const parent = (await readCommit(repo, sha)).parents[op === '~' ? 0 : n - 1];
      if (!parent) throw new Error(`"${rev}" goes past the first commit`);
      sha = parent;
    }
  }
  return sha;
}

// An annotated tag points at a tag object; follow it to the commit.
async function peel(repo, sha) {
  for (let obj = await readObject(repo, sha); obj.type === 'tag'; obj = await readObject(repo, sha)) {
    sha = utf8(obj.data).match(/^object ([0-9a-f]{40})/)[1];
  }
  return sha;
}

async function resolveRef(repo, name) {
  if (/^[0-9a-f]{40}$/.test(name)) return name;
  const packed = await packedRefs(repo);
  for (const ref of [name, `refs/${name}`, `refs/tags/${name}`, `refs/heads/${name}`, `refs/remotes/${name}`, `refs/remotes/${name}/HEAD`]) {
    for (let r = ref, depth = 0; depth < 5; depth++) {
      const loose = (await readText(repo.git, r))?.trim();
      const text = /^([0-9a-f]{40}|ref: refs\/\S+|ref: HEAD)$/.test(loose) ? loose : packed.get(r)?.sha; // never another .git file
      if (!text) break;
      if (!text.startsWith('ref: ')) return text;
      r = text.slice(5);
    }
  }
  return null;
}

async function packedRefs(repo) {
  const out = new Map();
  let last = null;
  for (const line of ((await readText(repo.git, 'packed-refs')) ?? '').split('\n')) {
    if (line.startsWith('^') && last) last.peeled = line.slice(1, 41);
    else if (/^[0-9a-f]{40} /.test(line)) out.set(line.slice(41).trim(), (last = { sha: line.slice(0, 40) }));
  }
  return out;
}

// Commit id -> the names that point at it, like git log --decorate: "HEAD -> main", "tag: v1.2".
async function refNames(repo) {
  const refs = new Map([...(await packedRefs(repo))].map(([name, r]) => [name, r.peeled ?? r.sha]));
  const loose = async (dir, prefix) => {
    for await (const entry of dir.values()) {
      const name = `${prefix}/${entry.name}`;
      if (entry.kind === 'directory') await loose(entry, name);
      else refs.set(name, (await (await entry.getFile()).text()).trim());
    }
  };
  const top = await repo.git.getDirectoryHandle('refs').catch(() => null);
  if (top) await loose(top, 'refs');
  const head = (await readText(repo.git, 'HEAD'))?.trim() ?? '';
  const out = new Map();
  const add = (sha, name) => (out.get(sha) ?? out.set(sha, []).get(sha)).push(name);
  if (!head.startsWith('ref: ')) add(head, 'HEAD');
  for (const [name, value] of refs) {
    if (value.startsWith('ref: ')) continue; // like origin/HEAD
    const sha = name.startsWith('refs/tags/') ? await peel(repo, value).catch(() => value) : value;
    if (name === head.slice(5)) add(sha, `HEAD -> ${name.slice(11)}`);
    else if (name.startsWith('refs/heads/')) add(sha, name.slice(11));
    else if (name.startsWith('refs/remotes/')) add(sha, name.slice(13));
    else if (name.startsWith('refs/tags/')) add(sha, `tag: ${name.slice(10)}`);
  }
  return out;
}

// A short commit id, like "a1b2c3d", to the full one.
async function expand(repo, prefix) {
  if (!/^[0-9a-f]{4,39}$/.test(prefix)) return null;
  const found = new Set();
  const dir = await dirAt(repo.git, `objects/${prefix.slice(0, 2)}`);
  if (dir) for await (const name of dir.keys()) if (name.startsWith(prefix.slice(2))) found.add(prefix.slice(0, 2) + name);
  for (const pack of await packs(repo)) {
    for (let i = lowerBound(pack, prefix); i < pack.count; i++) {
      const sha = hex(pack.shas.subarray(i * 20, i * 20 + 20));
      if (!sha.startsWith(prefix)) break;
      found.add(sha);
    }
  }
  if (found.size > 1) throw new Error(`"${prefix}" matches more than one object; use more characters`);
  return [...found][0] ?? null;
}

// ---- objects ----

const commits = new WeakMap(); // repo -> sha -> parsed commit
async function readCommit(repo, sha) {
  const cache = commits.get(repo) ?? commits.set(repo, new Map()).get(repo);
  if (cache.has(sha)) return cache.get(sha);
  const obj = await readObject(repo, sha);
  if (obj.type !== 'commit') throw new Error(`${sha.slice(0, 7)} is not a commit`);
  const text = utf8(obj.data);
  const split = text.indexOf('\n\n');
  const head = text.slice(0, split === -1 ? text.length : split);
  const field = (key) => head.match(new RegExp(`^${key} (.*)$`, 'm'))?.[1];
  const person = (key) => (field(key) ?? '').match(/^(.*) (\d+) ([+-]\d{4})$/) ?? [, field(key) ?? '', '0', '+0000'];
  const [, author, authored, tz] = person('author');
  const c = {
    sha,
    tree: field('tree'),
    parents: repo.shallow.has(sha) ? [] : [...head.matchAll(/^parent (\w+)$/gm)].map((m) => m[1]),
    author,
    authored: Number(authored),
    tz,
    time: Number(person('committer')[2]), // history is ordered by when commits were made, as in git
    message: split === -1 ? '' : text.slice(split + 2),
  };
  cache.set(sha, c);
  return c;
}

// Tree entries in order, as name -> { mode, sha }.
async function readTree(repo, sha) {
  const { data } = await readObject(repo, sha);
  const out = new Map();
  for (let i = 0; i < data.length;) {
    const space = data.indexOf(32, i);
    const nul = data.indexOf(0, space);
    out.set(utf8(data.subarray(space + 1, nul)), { mode: utf8(data.subarray(i, space)), sha: hex(data.subarray(nul + 1, nul + 21)) });
    i = nul + 21;
  }
  return out;
}

const TYPES = [null, 'commit', 'tree', 'blob', 'tag'];

async function readObject(repo, sha) {
  if (repo.objects.has(sha)) return repo.objects.get(sha);
  let obj = await looseObject(repo, sha) ?? await packedObject(repo, sha).catch(() => null);
  if (!obj) { repo.packs = null; obj = await packedObject(repo, sha); } // a fetch or gc may have changed the packs
  if (!obj) throw new Error(`object ${sha.slice(0, 7)} not found`);
  if (repo.objects.size > 2000) repo.objects.clear();
  repo.objects.set(sha, obj);
  return obj;
}

async function looseObject(repo, sha) {
  const file = await fileAt(repo.git, `objects/${sha.slice(0, 2)}/${sha.slice(2)}`);
  if (!file) return null;
  const raw = await inflate(new Uint8Array(await file.arrayBuffer()));
  const nul = raw.indexOf(0);
  return { type: utf8(raw.subarray(0, raw.indexOf(32))), data: raw.subarray(nul + 1) };
}

async function packedObject(repo, sha) {
  for (const pack of await packs(repo)) {
    const i = lowerBound(pack, sha);
    if (i < pack.count && hex(pack.shas.subarray(i * 20, i * 20 + 20)) === sha) return packEntry(repo, pack, pack.offsetOf(i));
  }
  return null;
}

// The .idx files in objects/pack (version 2), with their .pack files.
async function packs(repo) {
  if (repo.packs) return repo.packs;
  const list = [];
  const dir = await dirAt(repo.git, 'objects/pack');
  if (dir) {
    for await (const entry of dir.values()) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.idx')) continue;
      const pack = await fileAt(dir, entry.name.replace(/\.idx$/, '.pack'));
      if (pack) list.push(readIdx(new Uint8Array(await (await entry.getFile()).arrayBuffer()), pack));
    }
  }
  return (repo.packs = list);
}

function readIdx(idx, file) {
  const view = new DataView(idx.buffer);
  if (view.getUint32(0) !== 0xff744f63 || view.getUint32(4) !== 2) throw new Error('unsupported pack index');
  const count = view.getUint32(8 + 255 * 4);
  const shas = idx.subarray(1032, 1032 + count * 20);
  const small = 1032 + count * 24;
  const large = small + count * 4;
  const offsetOf = (i) => {
    const v = view.getUint32(small + i * 4);
    return v & 0x80000000 ? Number(view.getBigUint64(large + (v & 0x7fffffff) * 8)) : v;
  };
  // Each object ends where the next one starts; the pack ends with a 20-byte checksum.
  const ends = Float64Array.from({ length: count }, (_, i) => offsetOf(i)).sort();
  const endOf = (offset) => {
    let lo = 0;
    let hi = count;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ends[mid] <= offset) lo = mid + 1; else hi = mid; }
    return lo < count ? ends[lo] : file.size - 20;
  };
  return { file, count, shas, offsetOf, endOf, cache: new Map() };
}

// The first index entry whose id is not below `prefix` (ids are sorted).
function lowerBound(pack, prefix) {
  let lo = 0;
  let hi = pack.count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (hex(pack.shas.subarray(mid * 20, mid * 20 + 20)) < prefix) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

async function packEntry(repo, pack, offset) {
  if (pack.cache.has(offset)) return pack.cache.get(offset);
  const buf = new Uint8Array(await pack.file.slice(offset, pack.endOf(offset)).arrayBuffer());
  let i = 0;
  let c = buf[i++];
  const type = (c >> 4) & 7;
  while (c & 0x80) c = buf[i++]; // the size; the data says it again
  let obj;
  if (type === 6) { // a change against an earlier object in this pack
    c = buf[i++];
    let back = c & 0x7f;
    while (c & 0x80) { c = buf[i++]; back = (back + 1) * 128 + (c & 0x7f); }
    const base = await packEntry(repo, pack, offset - back);
    obj = { type: base.type, data: applyDelta(base.data, await inflate(buf.subarray(i))) };
  } else if (type === 7) { // a change against an object named by id
    const base = await readObject(repo, hex(buf.subarray(i, i + 20)));
    obj = { type: base.type, data: applyDelta(base.data, await inflate(buf.subarray(i + 20))) };
  } else {
    obj = { type: TYPES[type], data: await inflate(buf.subarray(i)) };
  }
  if (pack.cache.size > 500) pack.cache.clear();
  pack.cache.set(offset, obj);
  return obj;
}

function applyDelta(base, delta) {
  let i = 0;
  const size = () => {
    let n = 0;
    let shift = 1;
    let c;
    do { c = delta[i++]; n += (c & 0x7f) * shift; shift *= 128; } while (c & 0x80);
    return n;
  };
  size(); // the base's size
  const out = new Uint8Array(size());
  let o = 0;
  while (i < delta.length) {
    const op = delta[i++];
    if (op & 0x80) { // copy from the base
      let from = 0;
      let len = 0;
      for (let b = 0; b < 4; b++) if (op & (1 << b)) from += delta[i++] * 2 ** (8 * b);
      for (let b = 0; b < 3; b++) if (op & (16 << b)) len += delta[i++] * 2 ** (8 * b);
      out.set(base.subarray(from, from + (len || 0x10000)), o);
      o += len || 0x10000;
    } else { // new bytes
      out.set(delta.subarray(i, i + op), o);
      o += op;
      i += op;
    }
  }
  return out;
}

// ---- small helpers ----

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const utf8 = (bytes) => new TextDecoder().decode(bytes);
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

async function dirAt(dir, path) {
  try {
    for (const part of path.split('/')) dir = await dir.getDirectoryHandle(part);
    return dir;
  } catch { return null; }
}

async function fileAt(dir, path) {
  const parts = path.split('/');
  const name = parts.pop();
  dir = parts.length ? await dirAt(dir, parts.join('/')) : dir;
  try { return dir && await (await dir.getFileHandle(name)).getFile(); } catch { return null; }
}

const readText = async (dir, path) => (await fileAt(dir, path))?.text() ?? null;
