// Thin proxy to Kroger's OAuth2 token endpoint. This is the one place the
// Kroger client secret is used — it's read from an env var here and never
// sent to the browser. Handles all three grant types the app needs:
//   - authorization_code: initial connect (PKCE code_verifier included)
//   - refresh_token: silent renewal of a previously-issued token
//   - client_credentials: app-level token for product/location search
//     (doesn't require the user to be logged in)
const TOKEN_URL = 'https://api.kroger.com/v1/connect/oauth2/token';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const clientId = process.env.KROGER_CLIENT_ID;
  const clientSecret = process.env.KROGER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.status(500).json({ error: 'Server is missing KROGER_CLIENT_ID / KROGER_CLIENT_SECRET.' });
    return;
  }

  const { grantType, code, codeVerifier, redirectUri, refreshToken } = req.body || {};
  const form = new URLSearchParams();

  if (grantType === 'authorization_code') {
    if (!code || !codeVerifier || !redirectUri) {
      res.status(400).json({ error: 'Missing code/codeVerifier/redirectUri.' });
      return;
    }
    form.set('grant_type', 'authorization_code');
    form.set('code', code);
    form.set('redirect_uri', redirectUri);
    form.set('code_verifier', codeVerifier);
  } else if (grantType === 'refresh_token') {
    if (!refreshToken) {
      res.status(400).json({ error: 'Missing refreshToken.' });
      return;
    }
    form.set('grant_type', 'refresh_token');
    form.set('refresh_token', refreshToken);
  } else if (grantType === 'client_credentials') {
    form.set('grant_type', 'client_credentials');
    form.set('scope', 'product.compact');
  } else {
    res.status(400).json({ error: 'Invalid grantType.' });
    return;
  }

  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: form.toString(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Kroger token error', response.status, data);
      res.status(response.status).json({ error: data.error_description || data.error || 'Kroger token request failed.' });
      return;
    }
    res.status(200).json(data);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Could not reach Kroger.' });
  }
};
