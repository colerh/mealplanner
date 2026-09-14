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
      headers: {
        // A real browser UA + the headers a browser normally sends. Recipe
        // sites' bot/WAF filters (Cloudflare, etc.) block on sight otherwise —
        // a self-identifying "MealPlannerBot" UA is an instant 403 on most.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Upgrade-Insecure-Requests': '1',
      },
    });
    clearTimeout(timeout);
    if (!response.ok) return { statusCode: 502, body: JSON.stringify({ error: `Upstream returned ${response.status}. This site may be blocking automated requests — try a different recipe URL, or add it manually.` }) };
    const html = await response.text();
    return { statusCode: 200, body: JSON.stringify({ html: html.slice(0, 2_000_000) }) };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Failed to fetch the page. It may be blocking automated requests.' }) };
  }
};
