// Fetches a recipe page's HTML server-side and hands it back to the client.
// Recipe sites don't set CORS headers for arbitrary origins, so the browser
// can't fetch them directly — this is purely a CORS workaround, no secret
// involved.
//
// Some large publishers (AllRecipes, Food Network, etc.) run Cloudflare Bot
// Management, which fingerprint-blocks server-side requests outright — no
// header can talk its way past that. As a free fallback (no API key, no
// subscription), if the live fetch fails we try the Wayback Machine's latest
// snapshot of the same URL. archive.org itself isn't bot-protected, and
// recipe content is effectively static, so an older snapshot is normally
// just as usable as the live page.
const { assertPublicHttpUrl } = require('./_lib/ssrf');

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
};

async function fetchWithTimeout(url, ms, extraHeaders) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { ...BROWSER_HEADERS, ...extraHeaders } });
  } finally {
    clearTimeout(timeout);
  }
}

async function tryWaybackMachine(originalUrl) {
  try {
    const availRes = await fetchWithTimeout(`https://archive.org/wayback/available?url=${encodeURIComponent(originalUrl)}`, 8000);
    if (!availRes.ok) return null;
    const data = await availRes.json();
    const snapshot = data?.archived_snapshots?.closest;
    if (!snapshot?.available || !snapshot.url) return null;
    // Insert id_ right after the timestamp segment to get the raw archived
    // page instead of the version with Wayback's UI toolbar injected.
    const rawUrl = snapshot.url.replace(/(\/web\/\d+)(\/)/, '$1id_$2');
    const pageRes = await fetchWithTimeout(rawUrl, 10000);
    if (!pageRes.ok) return null;
    return await pageRes.text();
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };

  let url;
  try { ({ url } = JSON.parse(event.body || '{}')); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body.' }) }; }
  if (!url || typeof url !== 'string') return { statusCode: 400, body: JSON.stringify({ error: 'Missing "url".' }) };

  let parsed;
  try { parsed = await assertPublicHttpUrl(url); }
  catch (err) { return { statusCode: 400, body: JSON.stringify({ error: err.message }) }; }

  let html = null;
  try {
    const response = await fetchWithTimeout(parsed.toString(), 12000);
    if (response.ok) html = await response.text();
  } catch {
    // fall through to the Wayback attempt below
  }

  let viaWayback = false;
  if (!html) {
    html = await tryWaybackMachine(parsed.toString());
    viaWayback = !!html;
  }

  if (!html) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'This site is blocking automated requests and has no usable archived copy. Try the paste-HTML option below, or add the recipe manually.' }),
    };
  }

  return { statusCode: 200, body: JSON.stringify({ html: html.slice(0, 2_000_000), viaWayback }) };
};
