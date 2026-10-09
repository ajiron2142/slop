// Sign-in (optional add-on): with no config.json nothing changes; with one, Sign in goes to the
// identity provider and back, models load with the token, it refreshes on its own and after a 401,
// and Sign out goes back to Sign in. The provider is a fake one (startIdp in servers.mjs).
import { startIdp } from '../servers.mjs';
import { openApp, send } from '../helpers.mjs';

export default async function ({ browser, site, mock, check }) {
  // Without config.json: no sign-in anywhere.
  {
    const { page: p, context } = await openApp({ browser, site, mock });
    await p.click('#settings-btn');
    check('without config.json there is no sign-in', await p.isHidden('#signin'));
    await context.close();
  }

  const idp = await startIdp();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, bypassCSP: true });
  const config = { baseUrl: mock.url, oidc: { label: 'Sign in with Example', issuer: idp.url, clientId: 'slop-test', scope: 'openid profile offline_access api' } };
  await context.route('**/config.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(config) }));
  const p = await context.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const bearer = () => mock.auths.at(-1);

  await p.goto(site);
  await p.waitForSelector('#settings[open]');
  check('config.json fills in the base URL', (await p.inputValue('#set-base-url')) === mock.url);
  check('the welcome asks you to sign in, with the configured label', (await p.textContent('#settings-status')).includes('Sign in with Example to start') && (await p.textContent('#signin button')) === 'Sign in with Example');

  await p.click('#signin button');
  for (let i = 0; i < 100 && bearer() !== 'Bearer at-1'; i++) await p.waitForTimeout(50); // to the provider and back
  await p.waitForSelector('#model-picker .model:not([disabled])');
  check('signing in goes to the provider and back, and models load with the token', bearer() === 'Bearer at-1' && idp.grants.join() === 'authorization_code');
  check('the address no longer has the code in it', !p.url().includes('code=') && !p.url().includes('state='));
  await p.click('#settings-btn');
  check('Settings says who is signed in', (await p.textContent('#signin')).includes('Signed in as alice') && (await p.textContent('#signin button')) === 'Sign out');
  await p.click('#close-settings');

  await send(p, 'echo hello');
  check('chatting works while signed in', (await p.textContent('.msg.assistant:last-of-type .body')).startsWith('Got 0 image') && bearer() === 'Bearer at-1');

  // After a 401: one fresh token, and the same request again.
  mock.rejected.add('at-1');
  await send(p, 'echo after a 401');
  check('a 401 gets one fresh token and the request goes through', (await p.textContent('.msg.assistant:last-of-type .body')).startsWith('Got 0 image') && mock.auths.includes('Bearer at-2') && idp.grants.join() === 'authorization_code,refresh_token');

  // A token within a minute of expiring is refreshed before it's used; refresh tokens rotate.
  idp.expiresIn = 30; // the next token (at-3) lasts 30 seconds, so the one after replaces it before use
  mock.rejected.add('at-2');
  await send(p, 'echo near expiry');
  check('a token close to expiring is refreshed on its own, with the new refresh token', mock.auths.at(-1) !== 'Bearer at-3' && mock.auths.includes('Bearer at-4') && idp.grants.slice(2).every((g) => g === 'refresh_token'));
  idp.expiresIn = 3600;

  const seen = mock.auths.length;
  await p.reload();
  for (let i = 0; i < 100 && mock.auths.length === seen; i++) await p.waitForTimeout(50);
  check('a reload keeps you signed in (this tab only)', mock.auths.at(-1).startsWith('Bearer at-') && await p.isHidden('#settings[open]'));

  await p.click('#settings-btn');
  await p.click('#signin button:text-is("Sign out")');
  check('Sign out goes back to Sign in', (await p.textContent('#signin button')) === 'Sign in with Example' && !(await p.evaluate(() => sessionStorage.getItem('oidc-tokens'))));
  await p.click('#close-settings');

  await p.goto(`${site}?error=access_denied&error_description=The+user+declined&state=x`);
  await p.waitForSelector('#settings[open]');
  check('a refused sign-in says why, and tidies the address', (await p.textContent('#settings-status')) === 'Sign-in failed: The user declined' && !p.url().includes('error='));

  check('no errors in the browser console', errors.length === 0);
  if (errors.length) console.log('    ', errors.join('\n     '));
  await context.close();
  idp.close();
}
