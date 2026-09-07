// Forwards Product Compact API / Locations API / Cart API calls to Kroger
// with the caller-supplied bearer token. Exists only to work around Kroger
// not sending CORS headers for browser callers — no secret is used or
// needed here, the token was already obtained via kroger-token.js.
const BASE_URL = 'https://api.kroger.com';
const ALLOWED_PATHS = [/^\/v1\/locations(\/|$)/, /^\/v1\/products(\/|$)/, /^\/v1\/cart(\/|$)/];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body.' }) }; }
  const { token, method, path, query, body } = payload;
  if (!token || !method || !path) return { statusCode: 400, body: JSON.stringify({ error: 'Missing token/method/path.' }) };
  if (!ALLOWED_PATHS.some(re => re.test(path))) return { statusCode: 400, body: JSON.stringify({ error: 'Path not allowed.' }) };
  if (!['GET', 'PUT', 'POST'].includes(method)) return { statusCode: 400, body: JSON.stringify({ error: 'Method not allowed for proxy.' }) };

  const url = new URL(path, BASE_URL);
  if (query && typeof query === 'object') {
    Object.entries(query).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v); });
  }

  try {
    const upstream = await fetch(url.toString(), {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await upstream.text();
    const data = text ? JSON.parse(text) : {};
    if (!upstream.ok) {
      console.error('Kroger proxy error', upstream.status, data);
      return { statusCode: upstream.status, body: JSON.stringify({ error: data.errors?.[0]?.reason || data.error_description || 'Kroger API request failed.' }) };
    }
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (err) {
    console.error(err);
    return { statusCode: 502, body: JSON.stringify({ error: 'Could not reach Kroger.' }) };
  }
};
