// Thin proxy to Kroger's OAuth2 token endpoint. This is the one place the
// Kroger client secret is used — read from an env var here, never sent to
// the browser. Handles all three grant types the app needs:
//   - authorization_code: initial connect (PKCE code_verifier included)
//   - refresh_token: silent renewal of a previously-issued token
//   - client_credentials: app-level token for product/location search
//     (doesn't require the user to be logged in)
const TOKEN_URL = 'https://api.kroger.com/v1/connect/oauth2/token';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };

  const clientId = process.env.KROGER_CLIENT_ID;
  const clientSecret = process.env.KROGER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { statusCode: 500, body: JSON.stringify({ error: 'Server is missing KROGER_CLIENT_ID / KROGER_CLIENT_SECRET.' }) };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body.' }) }; }
  const { grantType, code, codeVerifier, redirectUri, refreshToken } = payload;
  const form = new URLSearchParams();

  if (grantType === 'authorization_code') {
    if (!code || !codeVerifier || !redirectUri) return { statusCode: 400, body: JSON.stringify({ error: 'Missing code/codeVerifier/redirectUri.' }) };
    form.set('grant_type', 'authorization_code');
    form.set('code', code);
    form.set('redirect_uri', redirectUri);
    form.set('code_verifier', codeVerifier);
  } else if (grantType === 'refresh_token') {
    if (!refreshToken) return { statusCode: 400, body: JSON.stringify({ error: 'Missing refreshToken.' }) };
    form.set('grant_type', 'refresh_token');
    form.set('refresh_token', refreshToken);
  } else if (grantType === 'client_credentials') {
    form.set('grant_type', 'client_credentials');
    form.set('scope', 'product.compact');
  } else {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid grantType.' }) };
  }

  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth}` },
      body: form.toString(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Kroger token error', response.status, data);
      return { statusCode: response.status, body: JSON.stringify({ error: data.error_description || data.error || 'Kroger token request failed.' }) };
    }
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (err) {
    console.error(err);
    return { statusCode: 502, body: JSON.stringify({ error: 'Could not reach Kroger.' }) };
  }
};
