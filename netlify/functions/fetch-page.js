// Fetches a recipe page's HTML server-side and hands it back to the client.
// Recipe sites don't set CORS headers for arbitrary origins, so the browser
// can't fetch them directly — this is purely a CORS workaround, no secret involved.
const { assertPublicHttpUrl } = require('./_lib/ssrf');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };

  let url;
  try { ({ url } = JSON.parse(event.body || '{}')); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body.' }) }; }
  if (!url || typeof url !== 'string') return { statusCode: 400, body: JSON.stringify({ error: 'Missing "url".' }) };

  let parsed;
  try { parsed = await assertPublicHttpUrl(url); }
  catch (err) { return { statusCode: 400, body: JSON.stringify({ error: err.message }) }; }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(parsed.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MealPlannerBot/1.0; personal recipe import)', Accept: 'text/html,application/xhtml+xml' },
    });
    clearTimeout(timeout);
    if (!response.ok) return { statusCode: 502, body: JSON.stringify({ error: `Upstream returned ${response.status}` }) };
    const html = await response.text();
    return { statusCode: 200, body: JSON.stringify({ html: html.slice(0, 2_000_000) }) };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Failed to fetch the page. It may be blocking automated requests.' }) };
  }
};
