// Fetches a recipe page's HTML server-side and hands it back to the client.
// This exists purely to work around browser CORS — recipe sites don't set
// CORS headers for arbitrary origins, so the client can't fetch them
// directly. No secrets are involved here.
const { assertPublicHttpUrl } = require('./_lib/ssrf');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing "url".' });
    return;
  }

  let parsed;
  try {
    parsed = await assertPublicHttpUrl(url);
  } catch (err) {
    res.status(400).json({ error: err.message });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(parsed.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MealPlannerBot/1.0; personal recipe import)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timeout);
    if (!response.ok) {
      res.status(502).json({ error: `Upstream returned ${response.status}` });
      return;
    }
    const html = await response.text();
    res.status(200).json({ html: html.slice(0, 2_000_000) });
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch the page. It may be blocking automated requests.' });
  }
};
