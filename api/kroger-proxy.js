// Forwards Product Compact API / Locations API / Cart API calls to Kroger
// with the caller-supplied bearer token. Exists only to work around Kroger
// not sending CORS headers for browser callers — no secret is used or
// needed here, the token was already obtained via kroger-token.js.
const BASE_URL = 'https://api.kroger.com';
const ALLOWED_PATHS = [/^\/v1\/locations(\/|$)/, /^\/v1\/products(\/|$)/, /^\/v1\/cart(\/|$)/];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { token, method, path, query, body } = req.body || {};
  if (!token || !method || !path) {
    res.status(400).json({ error: 'Missing token/method/path.' });
    return;
  }
  if (!ALLOWED_PATHS.some((re) => re.test(path))) {
    res.status(400).json({ error: 'Path not allowed.' });
    return;
  }
  if (!['GET', 'PUT', 'POST'].includes(method)) {
    res.status(400).json({ error: 'Method not allowed for proxy.' });
    return;
  }

  const url = new URL(path, BASE_URL);
  if (query && typeof query === 'object') {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
  }

  try {
    const upstream = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await upstream.text();
    const data = text ? JSON.parse(text) : {};
    if (!upstream.ok) {
      console.error('Kroger proxy error', upstream.status, data);
      res.status(upstream.status).json({ error: data.errors?.[0]?.reason || data.error_description || 'Kroger API request failed.' });
      return;
    }
    res.status(200).json(data);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Could not reach Kroger.' });
  }
};
