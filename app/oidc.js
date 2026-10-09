// Sign-in (optional add-on): sign in with your organisation's identity provider instead of pasting
// an API key, using OpenID Connect (authorization code + PKCE) straight from the browser. No backend,
// no secret, no vendor library. It only turns on when the web root has a config.json with an "oidc"
// section (see config.example.json and the README); without one the app is exactly as before.
//
// Rules, all fixed: the redirect URI is this page's address (origin + path); tokens live in this
// tab's sessionStorage and are gone when it closes; the token sent to the API is the one config.token
// names ("access", the default, or "id"); it's refreshed 60 seconds before it expires, keeping the
// new refresh token each time; if a refresh fails you're signed out and see Sign in again.
//
// To remove it: delete this file, config.example.json and tests/suites/signin.mjs, their lines in
// index.html, tests/run.mjs and .gitignore, and the lines marked "sign-in" in main.js and api.js.

import { el } from './dom.js';

const KEY = 'oidc-tokens';
const PENDING = 'oidc-pending';
const EARLY = 60; // seconds before expiry to refresh

// The deployment's config.json, or null when there is none. Fetched fresh so a changed file applies on reload.
export async function loadConfig() {
  let res;
  try { res = await fetch('config.json', { cache: 'no-store' }); } catch { return null; }
  if (!res.ok || res.status === 204) return null; // 204: the web server's way of saying there's none
  try {
    return await res.json();
  } catch {
    throw new Error("config.json isn't valid JSON, so it was ignored.");
  }
}

export function createAuth(oidc) {
  const issuer = String(oidc.issuer ?? '').replace(/\/+$/, '');
  if (!issuer || !oidc.clientId) throw new Error('config.json: "oidc" needs an "issuer" and a "clientId".');
  if (oidc.token && oidc.token !== 'access' && oidc.token !== 'id') throw new Error('config.json: "token" must be "access" or "id".');
  const which = oidc.token === 'id' ? 'id_token' : 'access_token';
  const scope = oidc.scope || 'openid profile offline_access';
  const redirectUri = location.origin + location.pathname;
  let discovery = null;
  let refreshing = null;

  const read = (key) => { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } };
  const write = (key, value) => (value ? sessionStorage.setItem(key, JSON.stringify(value)) : sessionStorage.removeItem(key));

  async function endpoints() {
    if (discovery) return discovery;
    const res = await fetch(`${issuer}/.well-known/openid-configuration`);
    if (!res.ok) throw new Error(`Couldn't read the sign-in settings from ${issuer} (HTTP ${res.status}).`);
    return (discovery = await res.json());
  }

  async function postToken(params) {
    const { token_endpoint: url } = await endpoints();
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: oidc.clientId, ...params }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error_description || body.error || `HTTP ${res.status}`);
    return body;
  }

  // Keeps the tokens with the time the one we send expires: its expires_in for an access token,
  // the "exp" claim for an ID token.
  function save(body, previous = null) {
    const tokens = {
      access_token: body.access_token,
      id_token: body.id_token ?? previous?.id_token,
      refresh_token: body.refresh_token ?? previous?.refresh_token,
    };
    tokens.expires_at = which === 'id_token' ? claims(tokens.id_token)?.exp : Math.floor(Date.now() / 1000) + Number(body.expires_in ?? 0);
    write(KEY, tokens);
    return tokens;
  }

  async function refresh() {
    const tokens = read(KEY);
    if (!tokens?.refresh_token) throw new Error('signed out');
    try {
      return save(await postToken({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, scope }), tokens);
    } catch (e) {
      write(KEY, null);
      throw e;
    }
  }

  return {
    label: oidc.label || 'Sign in',
    signedIn: () => Boolean(read(KEY)),
    // "Signed in as …": from the ID token, for display only (its signature isn't checked here; the API checks the token it gets).
    user() {
      const c = claims(read(KEY)?.id_token) ?? {};
      return c.preferred_username || c.email || c.name || '';
    },

    async signIn() {
      const { authorization_endpoint: url } = await endpoints();
      const verifier = random();
      const pending = { verifier, state: random(), nonce: random() };
      write(PENDING, pending);
      const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
      const params = new URLSearchParams({ response_type: 'code', client_id: oidc.clientId, redirect_uri: redirectUri, scope, state: pending.state, nonce: pending.nonce, code_challenge: challenge, code_challenge_method: 'S256' });
      location.assign(`${url}?${params}`);
    },

    // On the way back from the provider: swap ?code= for tokens and tidy the address. Returns an error
    // message when sign-in failed, '' otherwise (including when this isn't a sign-in return at all).
    async handleCallback() {
      const url = new URL(location.href);
      const [code, state, error, why] = ['code', 'state', 'error', 'error_description'].map((p) => url.searchParams.get(p));
      if (!code && !error) return '';
      const pending = read(PENDING);
      write(PENDING, null);
      for (const p of ['code', 'state', 'error', 'error_description', 'session_state', 'iss']) url.searchParams.delete(p);
      history.replaceState(null, '', url);
      if (error) return `Sign-in failed: ${why || error}`;
      if (!pending || state !== pending.state) return "Sign-in failed: the reply didn't match this sign-in. Try again.";
      try {
        const tokens = save(await postToken({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: pending.verifier }));
        const nonce = claims(tokens.id_token)?.nonce;
        if (nonce !== undefined && nonce !== pending.nonce) { write(KEY, null); return "Sign-in failed: the reply didn't match this sign-in. Try again."; }
        return '';
      } catch (e) {
        return `Sign-in failed: ${e.message}`;
      }
    },

    signOut() { write(KEY, null); },

    // The token for the API, refreshed when it's within a minute of expiring (or when `force`d after a 401).
    // Null when signed out, or when a refresh fails (which signs you out).
    async getToken({ force = false } = {}) {
      let tokens = read(KEY);
      if (!tokens) return null;
      if (force || !tokens.expires_at || tokens.expires_at - EARLY <= Date.now() / 1000) {
        refreshing ??= refresh().finally(() => { refreshing = null; });
        try { tokens = await refreshing; } catch { return null; }
      }
      return tokens[which] ?? null;
    },
  };
}

// The Sign in / Signed in as … part of Settings, shown only when sign-in is configured.
export function renderSignIn(box, auth, { onSignOut }) {
  box.hidden = false;
  const draw = () => {
    if (auth.signedIn()) {
      const out = el('button', 'btn', 'Sign out');
      out.type = 'button';
      out.addEventListener('click', () => { auth.signOut(); onSignOut(); draw(); });
      const who = auth.user();
      box.replaceChildren(el('span', 'signin-who', who ? `Signed in as ${who}` : 'Signed in'), out);
    } else {
      const go = el('button', 'btn primary', auth.label);
      go.type = 'button';
      go.addEventListener('click', () => auth.signIn().catch((e) => { box.append(el('span', 'signin-error', e.message)); }));
      box.replaceChildren(go, el('span', 'signin-hint', 'or use an API key below'));
    }
  };
  draw();
  return { draw };
}

const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// A JWT's claims, decoded but not verified.
function claims(jwt) {
  try {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(part))));
  } catch {
    return null;
  }
}
