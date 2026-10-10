// Git (optional add-on): a real repository made with the git command (packed and loose objects,
// deltas, an annotated tag, a remote that is ahead and behind), copied into the browser's
// private storage, then read by the app. Answers are checked against git's own output.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { openApp, send, stepsLine } from '../helpers.mjs';

// Builds the sample repo and returns { files: [[path, base64]], git: (...args) => output }.
function makeRepo() {
  const base = mkdtempSync(join(tmpdir(), 'slop-git-'));
  let clock = 1_760_000_000; // one commit per minute, so the order is certain
  const env = () => {
    clock += 60;
    const when = `${clock} -0600`;
    return { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Ann Lee', GIT_AUTHOR_EMAIL: 'ann@example.com', GIT_COMMITTER_NAME: 'Ann Lee', GIT_COMMITTER_EMAIL: 'ann@example.com', GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when };
  };
  const run = (cwd, ...args) => execFileSync('git', ['-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { cwd, env: env(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const put = (dir, path, text) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };
  const work = join(base, 'work');
  const other = join(base, 'other');
  run(base, 'init', '--bare', 'origin.git');
  run(base, 'clone', 'origin.git', 'work');
  // A long file changed a little each time, so packing stores it as deltas.
  const long = (n) => Array.from({ length: 300 }, (_, i) => (i === 150 ? `changed ${n}` : `line ${i + 1} of a long file`)).join('\n') + '\n';
  put(work, 'README.md', '# Work\n');
  put(work, 'src/app.js', 'console.log("hi")\n');
  put(work, 'src/long.txt', long(0));
  put(work, '.gitignore', 'build/\n*.log\n');
  run(work, 'add', '.');
  run(work, 'commit', '-m', 'First commit');
  for (let n = 1; n <= 3; n++) {
    put(work, 'src/long.txt', long(n));
    run(work, 'commit', '-am', `Tweak the long file ${n}`);
  }
  put(work, 'src/app.js', 'console.log("hello")\n');
  run(work, 'commit', '-am', 'Say hello\n\nA longer explanation of the change.');
  run(work, 'tag', '-a', 'v1.0', '-m', 'Version 1.0');
  put(work, 'deploy/route.yaml', 'kind: Route\ntimeout: 30s\n');
  run(work, 'add', '.');
  run(work, 'commit', '-m', 'Add the route');
  run(work, 'push', '-u', 'origin', 'main');
  run(work, 'gc', '--aggressive', '--quiet'); // everything packed, with deltas and packed-refs
  // Someone else pushes one commit; fetching it adds loose objects. Then two local commits.
  run(base, 'clone', 'origin.git', 'other');
  put(other, 'CHANGELOG.md', 'Upstream change\n');
  run(other, 'add', '.');
  run(other, 'commit', '-m', 'Upstream change');
  run(other, 'push');
  run(work, 'fetch');
  put(work, 'src/app.js', 'console.log("hello again")\n');
  run(work, 'commit', '-am', 'Local change one');
  put(work, 'notes.txt', 'notes\n');
  run(work, 'add', '.');
  run(work, 'commit', '-m', 'Local change two');
  // Uncommitted work: an edit, a deletion, a staged new file, an untracked file and ignored ones.
  put(work, 'README.md', '# Work\n\nMore words.\n');
  rmSync(join(work, 'deploy/route.yaml'));
  put(work, 'staged.txt', 'staged\n');
  run(work, 'add', 'staged.txt');
  put(work, 'new.txt', 'brand new\n');
  put(work, 'build/out.js', 'ignored\n');
  put(work, 'debug.log', 'ignored\n');

  const files = [];
  const walk = (dir, prefix) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const path = prefix ? `${prefix}/${name}` : name;
      if (statSync(full).isDirectory()) walk(full, path);
      else files.push([path, readFileSync(full).toString('base64')]);
    }
  };
  walk(work, '');
  const git = (...args) => run(work, ...args).trim();
  return { files, git, done: () => rmSync(base, { recursive: true, force: true }) };
}

// Copies the files into a folder in the browser's private storage, standing in for the picker.
const pickerFor = (files) => `window.showDirectoryPicker = async () => {
  const files = ${JSON.stringify(files)};
  const root = await navigator.storage.getDirectory();
  await root.removeEntry('work', { recursive: true }).catch(() => {});
  const top = await root.getDirectoryHandle('work', { create: true });
  for (const [path, b64] of files) {
    const parts = path.split('/');
    const name = parts.pop();
    let dir = top;
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    await w.close();
  }
  return top;
};`;

export default async function ({ browser, site, mock, check }) {
  try { execFileSync('git', ['--version']); } catch { check('git is installed (needed to build the sample repo)', false); return; }
  const repo = makeRepo();
  const { page: p, context, errors } = await openApp({ browser, site, mock }, { init: pickerFor(repo.files) });
  const tool = (name, args = {}) => p.evaluate(async ([name, args]) => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('work');
    return (await import('./app/folder-git.js')).runGitTool(root, name, JSON.stringify(args));
  }, [name, args]);
  const hashes = (result) => result.split('\n').filter((l) => /^[0-9a-f]{7} /.test(l)).map((l) => l.slice(0, 7));

  await p.click('#attach-btn');
  await p.click('#attach-menu [data-action="folder"]');
  await p.waitForSelector('.tray-chip.git');
  const chip = await p.textContent('.tray-chip.folder');
  check('a repo shows as "name · branch" with what to push and pull', chip.startsWith('work·main⇡2⇣1'));
  check('the chip has the branch icon and explains the arrows', (await p.$$('.tray-chip.git svg circle')).length === 3 && (await p.getAttribute('.tray-chip.git', 'title')).includes('main: 2 to push, 1 to pull'));

  // The log, in git's order, with branch and tag names.
  const log = (await tool('git_log')).result;
  check('git_log lists the same commits as git log', hashes(log).join() === repo.git('log', '--format=%h', '-n', '20').split('\n').join());
  check('git_log shows date, author and subject', log.includes(`${repo.git('log', '-1', '--format=%h')} 2025-10-09 Ann Lee: Local change two (HEAD -> main)`));
  check('git_log follows a range', hashes((await tool('git_log', { range: 'origin/main..main' })).result).join() === repo.git('log', '--format=%h', 'origin/main..main').split('\n').join());
  const upstream = (await tool('git_log', { range: 'main..origin/main' })).result;
  check('git_log can show the upstream side', hashes(upstream).join() === repo.git('log', '--format=%h', 'main..origin/main'));
  check('git_log names tags and remote branches', log.includes('Say hello (tag: v1.0)') && upstream.includes('Upstream change (origin/main)'));
  check('git_log filters by path', hashes((await tool('git_log', { path: 'work/src/long.txt' })).result).join() === repo.git('log', '--format=%h', '--', 'src/long.txt').split('\n').join());
  check('git_log filters by text', hashes((await tool('git_log', { search: 'tweak' })).result).length === 3);
  check('git_log takes a tag and a limit', hashes((await tool('git_log', { range: 'v1.0', limit: 2 })).result).join() === repo.git('log', '--format=%h', '-n', '2', 'v1.0').split('\n').join());

  // Diffs: one commit, two commits, and the uncommitted work.
  const hello = repo.git('log', '-1', '--format=%h', 'v1.0');
  const shown = (await tool('git_diff', { from: hello })).result;
  check('git_diff shows a commit with its message', shown.includes('Say hello\n    \n    A longer explanation') && shown.includes('-console.log("hi")\n+console.log("hello")'));
  const deltas = (await tool('git_diff', { from: 'HEAD~6', to: 'HEAD~5' })).result;
  check('packed objects stored as deltas read correctly', deltas.includes('-changed 1\n+changed 2') && deltas.includes('@@ -148 +148 @@'));
  const between = (await tool('git_diff', { from: 'v1.0', to: 'main' })).result;
  const expected = repo.git('diff', '--name-only', 'v1.0', 'main').split('\n');
  check('git_diff compares two revisions like git', expected.every((f) => between.includes(`+++ b/work/${f}`)) && between.startsWith(`${expected.length} files changed`));
  const work = (await tool('git_diff')).result;
  check('uncommitted changes include edits, deletions, staged and new files', work.includes('+More words.') && work.includes('--- a/work/deploy/route.yaml\n+++ /dev/null') && work.includes('+++ b/work/staged.txt') && work.includes('+++ b/work/new.txt'));
  check('ignored files are left out', !work.includes('out.js') && !work.includes('debug.log'));
  check('a path narrows the diff', (await tool('git_diff', { path: 'work/README.md' })).result.startsWith('1 file changed, +2 −0'));
  check('short ids, ~ and ^ work', (await tool('git_diff', { from: repo.git('rev-parse', '--short=5', 'HEAD^') })).result.includes('Local change one'));
  check('unknown revisions are an error, not a crash', (await tool('git_log', { range: 'nope' })).result === 'Error: unknown revision "nope"');
  check('other .git files are never read as refs', (await tool('git_log', { range: 'config' })).result.startsWith('Error: unknown revision'));

  // Through the chat: the tools are offered and run.
  await send(p, 'git: what changed?');
  const sent = mock.requests.at(-1);
  check('a repo gets the git tools and a line about them', sent.toolNames.includes('git_log') && sent.toolNames.includes('git_diff') && sent.system.includes('git repository'));
  check('the reply shows what it looked at', (await stepsLine(p)) === 'Read git log · Diffed uncommitted changes');

  // A folder that isn't a repo: plain chip, no git tools.
  await p.evaluate(() => {
    window.showDirectoryPicker = async () => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('plain', { create: true });
      await dir.getFileHandle('notes.txt', { create: true });
      return dir;
    };
  });
  await p.click('#new-chat');
  await p.click('#attach-btn');
  await p.click('#attach-menu [data-action="folder"]');
  await p.waitForTimeout(300);
  check('a plain folder keeps the folder chip', !(await p.$('.tray-chip.git')) && (await p.textContent('.tray-chip.folder')).startsWith('plain'));
  await send(p, 'echo hi');
  check('and gets no git tools', !mock.requests.at(-1).toolNames.includes('git_log') && mock.requests.at(-1).toolNames.includes('read_file'));
  check('no errors in the page', errors.length === 0);
  if (errors.length) console.log(errors);
  await context.close();
  repo.done();
}
