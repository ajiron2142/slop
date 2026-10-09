// GitLab (optional add-on): self-service setup in Settings (address check, the exact link and values
// to use), connecting with a token that may only read, a project per chat, the four read-only
// tools, and refusing a token that could write. Runs against a fake GitLab (startGitlab).
import { startGitlab } from '../servers.mjs';
import { openApp, send } from '../helpers.mjs';

export default async function ({ browser, site, mock, check }) {
  const gitlab = await startGitlab();
  const { page: p, context, errors } = await openApp({ browser, site, mock });
  const box = () => p.textContent('#gitlab-settings');

  // Nothing about GitLab until it's set up.
  check('no GitLab item in the attach menu until connected', await p.isHidden('#attach-menu [data-action="gitlab"]'));

  await p.click('#settings-btn');
  check('Settings has an optional GitLab part', (await box()).includes('GitLab (optional)'));
  await p.fill('#gitlab-url', 'https://example.invalid');
  await p.waitForSelector('#gitlab-settings .gitlab-found.bad');
  check('an address that isn\'t a GitLab says so, and shows no steps', (await box()).includes('No GitLab sign-in at this address') && !(await p.$('.gitlab-steps')));
  const expected = errors.length; // the browser logs that failed request; it's what the check is for
  await p.fill('#gitlab-url', gitlab.url);
  await p.waitForSelector('#gitlab-settings .gitlab-found.ok');
  check('a real GitLab is recognised', (await box()).includes('GitLab found'));
  check('the steps link straight to that GitLab\'s applications page', (await p.getAttribute('.gitlab-steps a', 'href')) === `${gitlab.url}/-/user_settings/applications`);
  check('and show the exact redirect URI and which boxes to tick', (await p.textContent('.gitlab-values')).includes(`${site}/`) && (await p.textContent('.gitlab-ticks')) === 'openidread_apiConfidential');
  await p.fill('#gitlab-client-id', 'my-app');
  await p.click('#gitlab-settings button:text-is("Connect GitLab")');
  await p.waitForFunction(() => document.querySelector('#gitlab-settings')?.textContent.includes('Connected as'));
  await p.click('#settings-btn');
  check('connecting comes back connected, with who and which scopes', (await box()).includes('Connected as alice') && (await box()).includes('openid read_api'));
  await p.click('#close-settings');

  // A project for this chat.
  await p.click('#attach-btn');
  check('the attach menu offers a GitLab project once connected', await p.isVisible('#attach-menu [data-action="gitlab"]'));
  await p.click('#attach-menu [data-action="gitlab"]');
  await p.waitForSelector('dialog.gitlab-picker[open] .gitlab-project');
  await p.fill('dialog.gitlab-picker input >> nth=0', 'route');
  await p.waitForFunction(() => document.querySelectorAll('dialog.gitlab-picker .gitlab-project').length === 1);
  await p.click('dialog.gitlab-picker .gitlab-project');
  check('picking a project fills in its default branch', (await p.inputValue('dialog.gitlab-picker .gitlab-row input')) === 'main');
  await p.click('dialog.gitlab-picker button:text-is("Connect")');
  await p.waitForSelector('.tray-chip.gitlab');
  check('the chip shows the project and branch', (await p.textContent('.tray-chip.gitlab')).startsWith('platform/route-service·main'));

  const methodsBefore = gitlab.methods.length;
  await send(p, 'gitlab: why did the pipeline fail?');
  const sent = mock.requests.at(-1);
  check('the chat gets the four GitLab tools and a line about the project', ['gitlab_list', 'gitlab_search', 'gitlab_read', 'gitlab_pipeline'].every((t) => sent.toolNames.includes(t)) && sent.system.includes('"platform/route-service" (branch main)'));
  const reply = await p.textContent('.msg.assistant:last-of-type .body');
  const [pipeline, job, file, found, listed, refused] = reply.split(/\s*\|\|\s*/); // shown as rendered text, so line breaks are folded
  check('the pipeline shows each job and whether it passed', pipeline.includes('Pipeline #99 on main: failed') && pipeline.includes('test / test-unit: failed') && pipeline.includes('build / build: success'));
  check('a job\'s log comes back as its last 200 lines, without colour codes', job.includes('last 200 of 250 lines') && job.endsWith('FAIL handler.test.js: expected 30000, got 120000') && !job.includes('\x1b') && !/step 50(?!\d)/.test(job) && job.includes('step 51'));
  check('files can be read', file.includes('const timeout = 30_000;'));
  check('search finds lines with their numbers', found.startsWith('1 matching lines') && found.includes('platform/route-service/src/handler.js') && found.includes('2: const timeout = 30_000;'));
  check('files can be listed, with the project path', listed.trim() === 'platform/route-service/src/handler.js');
  check('a path without the project path is refused with the rule', refused.startsWith('Error: paths start with the project path, like "platform/route-service/src/handler.js"'));
  check('the reply shows what was read', (await p.textContent('.msg.assistant:last-of-type .tool-log')).startsWith('Read pipeline main · Read job log test-unit · Read platform/route-service/src/handler.js'));
  check('every request to GitLab was a read', gitlab.methods.slice(methodsBefore).length >= 6 && gitlab.methods.every((m) => m === 'GET'));

  await p.click('#new-chat');
  await send(p, 'echo no project here');
  check('a chat without a project gets no GitLab tools', !mock.requests.at(-1).toolNames.includes('gitlab_read'));

  // A token that could write is refused and never kept.
  await p.click('#settings-btn');
  await p.click('#gitlab-settings button:text-is("Disconnect")');
  check('Disconnect forgets the token and hides the menu item', (await box()).includes('Connect GitLab') && await p.isHidden('#attach-menu [data-action="gitlab"]'));
  gitlab.scope = 'openid read_api api';
  await p.click('#gitlab-settings button:text-is("Connect GitLab")');
  await p.waitForSelector('#settings[open]');
  await p.waitForFunction(() => document.getElementById('settings-status').textContent.includes('more than read'));
  check('a token that can write is refused, saying what to change', (await p.textContent('#settings-status')).includes('the token can do more than read (api)') && !(await box()).includes('Connected as'));
  check('and it isn\'t kept', !(await p.evaluate(() => sessionStorage.getItem('gitlab-tokens'))));

  check('no other errors in the browser console', errors.length === expected);
  if (errors.length > expected) console.log('    ', errors.slice(expected).join('\n     '));
  await context.close();
  gitlab.close();
}
