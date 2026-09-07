// Kroger OAuth2 (Authorization Code + PKCE) + Product/Cart API client.
//
// The OAuth client secret never touches this file — it lives only in the
// serverless functions under /api/kroger-*. This module handles:
//   - the public (non-secret) half of PKCE: verifier/challenge generation
//     and building the authorize redirect
//   - storing/refreshing the resulting tokens in localStorage
//   - calling Kroger's Product Compact API and Cart API through a thin
//     proxy function (needed because Kroger's API does not send CORS
//     headers for browser-based callers)
import { db } from './db.js';

const SESSION_KEYS = { verifier: 'kroger.pkce.verifier', state: 'kroger.pkce.state' };

function base64url(bytes) {
  let str = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(len = 64) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return base64url(bytes).slice(0, len);
}

async function sha256(str) {
  const data = new TextEncoder().encode(str);
  return crypto.subtle.digest('SHA-256', data);
}

async function getConfig() {
  const res = await fetch('/api/kroger-config');
  if (!res.ok) throw new Error('Kroger is not configured on the server (missing env vars).');
  return res.json();
}

export async function startAuth() {
  const config = await getConfig();
  const verifier = randomString(64);
  const state = randomString(24);
  const challenge = base64url(await sha256(verifier));
  sessionStorage.setItem(SESSION_KEYS.verifier, verifier);
  sessionStorage.setItem(SESSION_KEYS.state, state);

  const redirectUri = config.redirectUri || `${location.origin}${location.pathname}`;
  const url = new URL('https://api.kroger.com/v1/connect/oauth2/authorize');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'cart.basic:write product.compact');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  location.href = url.toString();
}

export async function handleOAuthRedirect(params) {
  if (params.has('error')) {
    return { ok: false, error: params.get('error_description') || params.get('error') };
  }
  const code = params.get('code');
  const state = params.get('state');
  const expectedState = sessionStorage.getItem(SESSION_KEYS.state);
  const verifier = sessionStorage.getItem(SESSION_KEYS.verifier);
  sessionStorage.removeItem(SESSION_KEYS.state);
  sessionStorage.removeItem(SESSION_KEYS.verifier);

  if (!code || !verifier || state !== expectedState) {
    return { ok: false, error: 'Invalid OAuth state — please try connecting again.' };
  }
  try {
    const config = await getConfig();
    const redirectUri = config.redirectUri || `${location.origin}${location.pathname}`;
    const res = await fetch('/api/kroger-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grantType: 'authorization_code', code, codeVerifier: verifier, redirectUri }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error || `Token exchange failed (${res.status})` };
    }
    const tokens = await res.json();
    db.saveKrogerTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in - 30) * 1000,
      scope: tokens.scope,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export function isConnected() {
  return !!db.getKrogerTokens()?.refreshToken;
}

export function disconnect() {
  db.clearKrogerTokens();
}

async function refreshUserToken() {
  const tokens = db.getKrogerTokens();
  if (!tokens?.refreshToken) return null;
  const res = await fetch('/api/kroger-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grantType: 'refresh_token', refreshToken: tokens.refreshToken }),
  });
  if (!res.ok) {
    db.clearKrogerTokens();
    throw new Error('Kroger session expired — please reconnect your account in Settings.');
  }
  const fresh = await res.json();
  const updated = {
    accessToken: fresh.access_token,
    refreshToken: fresh.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + (fresh.expires_in - 30) * 1000,
    scope: fresh.scope,
  };
  db.saveKrogerTokens(updated);
  return updated.accessToken;
}

export async function getUserAccessToken() {
  const tokens = db.getKrogerTokens();
  if (!tokens) throw new Error('Kroger account not connected. Connect it in Settings first.');
  if (tokens.expiresAt > Date.now()) return tokens.accessToken;
  return refreshUserToken();
}

async function getAppAccessToken() {
  const cached = db.getKrogerAppToken();
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken;
  const res = await fetch('/api/kroger-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grantType: 'client_credentials' }),
  });
  if (!res.ok) throw new Error('Could not get a Kroger app token — check server-side Kroger credentials.');
  const tokens = await res.json();
  const record = { accessToken: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in - 30) * 1000 };
  db.saveKrogerAppToken(record);
  return record.accessToken;
}

async function proxyRequest(token, method, path, query, requestBody) {
  const res = await fetch('/api/kroger-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, method, path, query: query || {}, body: requestBody }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Kroger request failed (${res.status})`);
  return body;
}

export async function searchLocations(zipCode) {
  const token = await getAppAccessToken();
  const data = await proxyRequest(token, 'GET', '/v1/locations', {
    'filter.zipCode.near': zipCode,
    'filter.limit': 10,
  });
  return data.data || [];
}

export async function searchProducts(term, locationId) {
  const token = await getAppAccessToken();
  const data = await proxyRequest(token, 'GET', '/v1/products', {
    'filter.term': term,
    'filter.locationId': locationId,
    'filter.limit': 5,
  });
  return data.data || [];
}

export async function addItemsToCart(items) {
  // items: [{ upc, quantity }]
  const token = await getUserAccessToken();
  const body = { items: items.map((i) => ({ upc: i.upc, quantity: i.quantity || 1, modality: 'PICKUP' })) };
  await proxyRequest(token, 'PUT', '/v1/cart/add', undefined, body);
  return true;
}
