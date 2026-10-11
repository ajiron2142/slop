// GitLab (optional add-on): self-service setup in Settings (address check, the exact link and values
// to use), connecting with a token that may only read, a project per chat, the four read-only
// tools, and refusing a token that could write. Runs against a fake GitLab (startGitlab).
import { startGitlab } from '../servers.mjs';
import { openApp, send, idle, stepsLine } from '../helpers.mjs';

export default async function ({ browser, site, mock, check }) {
  const gitlab = await startGitlab();
  const { page: p, context, errors } = await openApp({ browser, site, mock });
  const box = () => p.textContent('#gitlab-settings');

  // Nothing about GitLab until it's set up.
  check('no GitLab item in the attach menu until connected', await p.isHidden('#attach-menu [data-action="gitlab"]'));

  await p.click('#settings-btn');
  check('Settings has an optional GitLab part', (await box()).includes('GitLab (optional)'));
  const connectShown = async () => await p.isVisible('#gitlab-client-id') && await p.isVisible('#gitlab-settings button:text-is("Connect GitLab")');
  check('with no address, there\'s no Application ID box or Connect yet', !(await p.isVisible('#gitlab-client-id')) && !(await p.isVisible('#gitlab-settings button:text-is("Connect GitLab")')));
  await p.fill('#gitlab-url', 'https://example.invalid');
  await p.waitForSelector('#gitlab-settings .gitlab-found.bad');
  check('an address that isn\'t a GitLab says so, and shows no steps', (await box()).includes('No GitLab sign-in at this address') && !(await p.$('.gitlab-steps')));
  check('nor the Application ID box or Connect', !(await p.isVisible('#gitlab-client-id')));
  const expected = errors.length; // the browser logs that failed request; it's what the check is for
  await p.fill('#gitlab-url', gitlab.url);
  await p.waitForSelector('#gitlab-settings .gitlab-found.ok');
  check('a real GitLab is recognised', (await box()).includes('GitLab found'));
  check('the Application ID box and Connect appear with the steps', await connectShown());
  check('the steps link straight to that GitLab\'s applications page', (await p.getAttribute('.gitlab-steps a', 'href')) === `${gitlab.url}/-/user_settings/applications`);
  check('and show the exact redirect URI and which boxes to tick', (await p.textContent('.gitlab-values')).includes(`${site}/`) && (await p.textContent('.gitlab-ticks')) === 'openidread_apiConfidential');
  await p.fill('#gitlab-client-id', 'my-app');
  await p.waitForTimeout(300); // leaving the address box checks it again
  check('typing the Application ID leaves the address as it was, still found', (await p.inputValue('#gitlab-url')) === gitlab.url && (await p.inputValue('#gitlab-client-id')) === 'my-app' && (await box()).includes('GitLab found') && await connectShown());
  await p.click('#gitlab-settings button:text-is("Connect GitLab")');
  await p.waitForFunction(() => document.querySelector('#gitlab-settings')?.textContent.includes('Connected as'));
  await p.click('#settings-btn');
  check('connecting comes back connected, with who and which scopes', (await box()).includes('Connected as alice') && (await box()).includes('openid read_api'));
  await p.click('#close-settings');

  // GitLab answering slowly never holds up the model list.
  gitlab.slowUser = true;
  await p.reload();
  const started = Date.now();
  await p.waitForFunction(() => document.querySelector('#model-picker .model')?.textContent !== 'No models', null, { timeout: 10000 });
  check('the model list doesn\'t wait for GitLab when the page loads', Date.now() - started < 3000);
  gitlab.slowUser = false;

  // A project for this chat.
  await p.click('#attach-btn');
  check('the attach menu offers a GitLab project once connected', await p.isVisible('#attach-menu [data-action="gitlab"]'));
  await p.click('#attach-menu [data-action="gitlab"]');
  await p.waitForSelector('dialog.gitlab-picker[open] .gitlab-project');
  check('a project with no branches yet can\'t be picked', await p.isDisabled('dialog.gitlab-picker .gitlab-project:has-text("no branches yet")'));
  check('each project shows its name, then its group', (await p.textContent('dialog.gitlab-picker .gitlab-project .gitlab-project-name')) === 'route-service' && (await p.textContent('dialog.gitlab-picker .gitlab-project .gitlab-project-group')) === 'platform');
  await p.fill('dialog.gitlab-picker input', 'route');
  await p.waitForFunction(() => document.querySelectorAll('dialog.gitlab-picker .gitlab-project').length === 1);
  await p.click('dialog.gitlab-picker .gitlab-project');
  await p.waitForSelector('.tray-chip.gitlab');
  check('picking a project connects it at once, on its default branch', !(await p.$('dialog.gitlab-picker')) && (await p.textContent('.tray-chip.gitlab')).startsWith('platform/route-service·main'));

  // Another branch, from the chip.
  await p.click('.tray-chip.gitlab .gitlab-branch');
  await p.waitForSelector('dialog.gitlab-picker.branches[open] .gitlab-project');
  const names = await p.$$eval('dialog.gitlab-picker.branches .gitlab-project', (rows) => rows.map((r) => r.textContent));
  check('the branch list comes from GitLab: default first, then the latest pushed, with how long ago', names.join(',') === 'maindefault2h,release/2.45h,feat/sso2d');
  const marked = await p.$$eval('dialog.gitlab-picker.branches .mark', (ms) => ms.map((m) => `${getComputedStyle(m).fontWeight}|${getComputedStyle(m, '::after').transform}`));
  check('the branch in use is marked like any choice: semibold, with a line under it', marked[0] === '600|matrix(1, 0, 0, 1, 0, 0)' && marked.slice(1).every((x) => x === '400|matrix(0, 0, 0, 1, 0, 0)'));
  const [chipBox, listBox] = await Promise.all([p.locator('.tray-chip.gitlab:not(.gitlab-head-chip)').boundingBox(), p.locator('dialog.gitlab-picker.branches').boundingBox()]);
  check('and grows up out of the chip, flush with it', Math.abs(listBox.y + listBox.height - (chipBox.y + chipBox.height)) < 2 && Math.abs(listBox.x - chipBox.x) < 2 && listBox.width >= chipBox.width - 1);
  await p.keyboard.press('Escape');
  check('Esc closes it without changing the branch', !(await p.$('dialog.gitlab-picker')) && (await p.textContent('.tray-chip.gitlab')).includes('·main'));
  await p.click('.tray-chip.gitlab .gitlab-branch');
  await p.click('dialog.gitlab-picker.branches .gitlab-head-chip');
  check('clicking the chip again closes it', !(await p.$('dialog.gitlab-picker')));
  await p.click('.tray-chip.gitlab .gitlab-branch');
  await p.fill('dialog.gitlab-picker.branches input', 'rel');
  await p.waitForFunction(() => document.querySelectorAll('dialog.gitlab-picker.branches .gitlab-project').length === 1);
  await p.click('dialog.gitlab-picker.branches .gitlab-project');
  await p.waitForFunction(() => document.querySelector('.tray-chip.gitlab')?.textContent.includes('release/2.4'));
  const refsBefore = gitlab.refs.length;
  await send(p, 'gitlab: on another branch');
  check('the chat then reads that branch', mock.requests.at(-1).system.includes('(branch release/2.4)') && gitlab.refs.slice(refsBefore).every((r) => r === 'release/2.4') && gitlab.refs.length > refsBefore);
  await p.click('.tray-chip.gitlab .gitlab-branch');
  await p.click('dialog.gitlab-picker.branches .gitlab-project:has-text("main") >> nth=0');
  await p.waitForFunction(() => document.querySelector('.tray-chip.gitlab')?.textContent.includes('·main'));

  // The same in the mini window, which is a smaller window of its own.
  await p.click('#mini-btn');
  await p.waitForFunction(() => documentPictureInPicture.window?.document.getElementById('chat'));
  await p.setViewportSize({ width: 1280, height: 500 }); // headless opens it at the tab's size; make them differ
  await p.evaluate(() => documentPictureInPicture.window.document.querySelector('.tray-chip.gitlab .gitlab-branch').click());
  await p.waitForFunction(() => documentPictureInPicture.window.document.querySelector('dialog.gitlab-picker.branches[open] .gitlab-project'));
  const gap = await p.evaluate(() => {
    const doc = documentPictureInPicture.window.document;
    const chip = doc.querySelector('.tray-chip.gitlab:not(.gitlab-head-chip)').getBoundingClientRect();
    const list = doc.querySelector('dialog.gitlab-picker.branches').getBoundingClientRect();
    return Math.abs(list.bottom - chip.bottom) + Math.abs(list.left - chip.left);
  });
  check('in the mini window the branch list also grows out of the chip', gap < 2);
  await p.evaluate(() => documentPictureInPicture.window.close());
  await p.waitForSelector('#chat');
  await p.setViewportSize({ width: 1280, height: 800 });


  await p.fill('#input', 'slowgitlab: search');
  await p.press('#input', 'Enter');
  for (let i = 0; i < 100 && !gitlab.searches; i++) await p.waitForTimeout(50); // until GitLab has the search
  await p.click('#send-btn');
  await idle(p);
  check('Stop ends a GitLab request that never answers', !(await p.evaluate(() => document.getElementById('send-btn').classList.contains('stop'))));

  const methodsBefore = gitlab.methods.length;
  // GitLab answers each request in 300 ms: the round's calls run at once, so it takes about one answer, not ten.
  await p.route(`${gitlab.url}/api/v4/**`, async (route) => { await new Promise((r) => setTimeout(r, 300)); await route.continue(); });
  const roundStart = Date.now();
  await send(p, 'gitlab: why did the pipeline fail?');
  check('a round\'s tool calls run at the same time', Date.now() - roundStart < 1500);
  await p.unroute(`${gitlab.url}/api/v4/**`);
  const sent = mock.requests.at(-1);
  check('the chat gets the four GitLab tools and a line about the project', ['gitlab_list', 'gitlab_search', 'gitlab_read', 'gitlab_api'].every((t) => sent.toolNames.includes(t)) && sent.system.includes('"platform/route-service" (branch main)'));
  const reply = await p.textContent('.msg.assistant:last-of-type .body');
  const [pipeline, job, file, found, listed, refused, outside, encoded, project, stats] = reply.split(/\s*\|\|\s*/); // shown as rendered text, so line breaks are folded
  check('gitlab_api reads the project\'s API, JSON indented, with GitLab\'s links', pipeline.includes('"status": "failed"') && pipeline.includes('"web_url": "https://gitlab.example/platform/route-service/-/pipelines/99"'));
  check('any part of a long answer can be read, without colour codes', job.startsWith('240\tstep 240') && job.includes('250\tFAIL handler.test.js: expected 30000, got 120000') && job.endsWith('(lines 240–250 of 250)') && !job.includes('\x1b'));
  check('an empty gitlab_api path reads the project itself, and a bare query adds to it', project.includes('"created_at": "2024-03-01T09:00:00Z"') && !project.includes('commit_count') && stats.includes('"commit_count": 412'));
  check('a gitlab_api path can\'t leave the project', outside.startsWith('Error: give the path after /projects/:id/') && encoded.startsWith('Error: give the path after'));
  check('files can be read', file.includes('const timeout = 30_000;'));
  check('search finds lines with their numbers', found.startsWith('1 matching lines') && found.includes('platform/route-service/src/handler.js') && found.includes('2: const timeout = 30_000;'));
  check('files can be listed, with the project path', listed.trim() === 'platform/route-service/src/handler.js');
  check('a path without the project path is refused with the rule', refused.startsWith('Error: paths start with the project path, like "platform/route-service/src/handler.js"'));
  check('the reply shows what was read', (await stepsLine(p)).startsWith('Read GitLab pipelines?ref=main&per_page=1 · Read GitLab jobs/502/trace:240–250 · Read platform/route-service/src/handler.js'));
  check('every request to GitLab was a read', gitlab.methods.slice(methodsBefore).length >= 5 && gitlab.methods.every((m) => m === 'GET'));

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
