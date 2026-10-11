// Patches (optional add-on): with a folder connected the model is asked for git patches; a valid one
// shows as a block to review with "Copy for terminal", whose command really applies it; anything
// that breaks the rules stays a plain code block with a note. Nothing in slop writes files.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { openApp, send } from '../helpers.mjs';
import { PATCH, PATCH_BASE } from '../servers.mjs';

const fakePicker = async () => {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('proj', { create: true });
  const w = await (await dir.getFileHandle('README.md', { create: true })).createWritable();
  await w.write('# Proj');
  await w.close();
  return dir;
};

export default async function ({ browser, site, mock, check }) {
  const { page: p, context, errors } = await openApp({ browser, site, mock }, { init: `window.showDirectoryPicker = ${fakePicker};` });
  const reply = '.msg.assistant:last-of-type';

  await send(p, 'echo no folder yet');
  check('a chat with nothing connected isn\'t told about patches', !mock.requests.at(-1).system.includes('git patch'));

  // With a folder connected, the model is asked for patches, with paths from the repo's root.
  await p.click('#attach-btn');
  await p.click('#attach-menu [data-action="folder"]');
  await p.waitForSelector('.tray-chip.folder');
  await send(p, 'patch: raise the timeout and add a retry');
  const system = mock.requests.at(-1).system;
  check('with a folder connected, the model is asked for one git patch', system.includes('reply with one git patch in a ```diff block') && system.includes('without "proj/"'));

  // The patch block: totals, one row per file, the first one open.
  await p.waitForSelector(`${reply} .patch`);
  check('the patch shows its totals', (await p.textContent(`${reply} .patch-head`)) === 'Patch4 files · +5 −4Copy for terminal');
  const rows = await p.$$eval(`${reply} .patch-row`, (rs) => rs.map((r) => r.textContent));
  check('each file is a row with its changes, new and deleted files marked', rows.join('|') === '▾config/route.yaml+1 −1|▸src/client.js+2 −1|▸src/retry.jsnew+2|▸docs/old.mddeleted−2');
  const open = await p.$$eval(`${reply} .patch-diff`, (ds) => ds.map((d) => !d.hidden));
  check('the first file starts open, the rest closed', open.join() === 'true,false,false,false');
  check('the diff is coloured by line', (await p.textContent(`${reply} .patch-diff .add`)) === '+  timeout: 60s' && (await p.textContent(`${reply} .patch-diff .del`)) === '-  timeout: 30s');
  await p.click(`${reply} .patch-row >> nth=1`);
  check('clicking a row opens that file', await p.isVisible(`${reply} .patch-file:nth-of-type(2) .patch-diff`));

  // Copy for terminal: one readable command that really applies the patch.
  check('the button says what it does, with the same copy icon as a code block', (await p.textContent(`${reply} .patch-copy`)) === 'Copy for terminal' && Boolean(await p.$(`${reply} .patch-copy svg.icon`)));
  await p.click(`${reply} .patch-copy`);
  await p.waitForFunction((sel) => document.querySelector(sel)?.textContent === 'Copied', `${reply} .patch-copy`);
  check('and says when it worked', true);
  const copied = await p.evaluate(() => navigator.clipboard.readText());
  check('it copies one readable git apply command around the patch', copied === `git apply --recount --stat --summary --apply <<'END_OF_PATCH'\n${PATCH}END_OF_PATCH`);

  const repo = mkdtempSync(join(tmpdir(), 'slop-patch-'));
  for (const [path, text] of Object.entries(PATCH_BASE)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  let output = '';
  try { output = execFileSync('bash', ['-c', copied], { cwd: repo, encoding: 'utf8' }); } catch (e) { output = `failed: ${e.stderr || e.message}`; }
  const read = (path) => (existsSync(join(repo, path)) ? readFileSync(join(repo, path), 'utf8') : null);
  check('pasted in a terminal, it applies every file exactly', read('config/route.yaml').includes('timeout: 60s')
    && read('src/client.js') === 'import { withRetry } from "./retry.js";\nexport const TIMEOUT_MS = 60_000;\nexport function post(url) {\n  if (!url) throw new Error("no url!");\n\treturn fetch(url);\n}\n'
    && read('src/retry.js') === '// Tries again once; it\'s `$HOME`-safe and !important.\nexport const withRetry = (fn) => fn().catch(() => fn());\n'
    && read('docs/old.md') === null);
  check('and prints what changed, new and deleted files included', output.includes('4 files changed, 5 insertions(+), 4 deletions(-)') && output.includes('create mode 100644 src/retry.js') && output.includes('delete mode 100644 docs/old.md'));
  rmSync(repo, { recursive: true, force: true });

  // Anything that breaks the rules stays a plain code block, with a note saying which line.
  await send(p, 'patchbad: try it');
  check('a diff block that isn\'t a valid patch stays a code block, with no copy command', !(await p.$(`${reply} .patch`)) && Boolean(await p.$(`${reply} .code`)));
  check('and says which line broke the rules', (await p.textContent(`${reply} .patch-note`)).startsWith('Not a patch slop can apply: line 4 isn\'t part of a git patch: "this line is not part of a patch"'));
  await send(p, 'patchmarker: try it');
  check('a patch containing the end marker is refused, so it can never end the command early', !(await p.$(`${reply} .patch`)) && (await p.textContent(`${reply} .patch-note`)).includes('is the end marker the command uses'));

  check('no errors in the browser console', errors.length === 0);
  if (errors.length) console.log('    ', errors.join('\n     '));
  await context.close();
}
