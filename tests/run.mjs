// Runs every test suite in a headless browser against a fake LiteLLM.
//   npm test                 (after: npm install, npx playwright install chromium)
//   or, with only Docker:    see tests/README.md
// Prints PASS/FAIL per check and exits with an error if anything failed.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { startSite, startMock } from './servers.mjs';
import app from './suites/app.mjs';
import folder from './suites/folder.mjs';
import stats from './suites/stats.mjs';
import speed from './suites/speed.mjs';
import paste from './suites/paste.mjs';
import mini from './suites/mini.mjs';
import viewer from './suites/viewer.mjs';
import signin from './suites/signin.mjs';
import titles from './suites/titles.mjs';
import gitlab from './suites/gitlab.mjs';
import git from './suites/git.mjs';
import activity from './suites/activity.mjs';
import patch from './suites/patch.mjs';
import flow from './suites/flow.mjs';
import sandbox from './suites/sandbox.mjs'; // sandbox

const SUITES = { app, folder, git, paste, patch, activity, flow, sandbox, mini, viewer, signin, titles, gitlab, stats, speed };
const args = process.argv.slice(2);
const all = args.includes('--all'); // print every check, not just the failures
const only = args.filter((a) => a !== '--all'); // e.g. `npm test -- stats` runs one suite

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const site = await startSite(root);
const mock = await startMock();
const browser = await chromium.launch();
let passed = 0;
let failed = 0;

for (const [name, suite] of Object.entries(SUITES)) {
  if (only.length && !only.includes(name)) continue;
  // One line per suite; each failing check (or, with --all, every check) under it.
  const lines = [];
  let ok = 0;
  let bad = 0;
  const check = (label, pass) => {
    pass ? ok++ : bad++;
    if (!pass || all) lines.push(`  ${pass ? 'PASS' : 'FAIL'}  ${label}`);
  };
  try {
    await suite({ browser, site: site.url, mock, check });
  } catch (e) {
    bad++;
    lines.push(`  FAIL  stopped early: ${e.message.split('\n')[0]}`);
  }
  console.log(`${bad ? 'FAIL' : 'ok  '}  ${name}: ${ok} passed${bad ? `, ${bad} failed` : ''}`);
  if (lines.length) console.log(lines.join('\n'));
  passed += ok;
  failed += bad;
}

await browser.close();
site.close();
mock.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
