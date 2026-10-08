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

const SUITES = { app, folder, stats, speed };
const only = process.argv.slice(2); // e.g. `npm test -- stats` runs one suite

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const site = await startSite(root);
const mock = await startMock();
const browser = await chromium.launch();
let passed = 0;
let failed = 0;

for (const [name, suite] of Object.entries(SUITES)) {
  if (only.length && !only.includes(name)) continue;
  console.log(`\n${name}`);
  const check = (label, ok) => {
    ok ? passed++ : failed++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  };
  try {
    await suite({ browser, site: site.url, mock, check });
  } catch (e) {
    failed++;
    console.log(`  FAIL  stopped early: ${e.message.split('\n')[0]}`);
  }
}

await browser.close();
site.close();
mock.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
