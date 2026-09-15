// A "loose account" sync: a user-chosen code maps to one JSON blob holding
// their recipes/pantry/meal plan/shopping list/settings, stored in Netlify
// Blobs. There's no password and no real user identity — anyone who knows
// the code can read or overwrite that blob. That's an accepted tradeoff for
// skipping real accounts on a personal app; Kroger tokens are never part of
// what the client sends here.
const { getStore } = require('@netlify/blobs');

const CODE_PATTERN = /^[a-z0-9_-]{4,64}$/;
const MAX_PAYLOAD_BYTES = 2_000_000;

function normalizeCode(raw) {
  return String(raw || '').trim().toLowerCase();
}

function store() {
  return getStore('mealplanner-sync');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'GET') {
    const code = normalizeCode(event.queryStringParameters?.code);
    if (!CODE_PATTERN.test(code)) return { statusCode: 400, body: JSON.stringify({ error: 'Invalid sync code.' }) };
    try {
      const raw = await store().get(`codes/${code}`);
      return { statusCode: 200, body: JSON.stringify({ data: raw ? JSON.parse(raw) : null }) };
    } catch (err) {
      console.error(err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not read sync data. If running locally, this needs `netlify dev`, not the plain node server.' }) };
    }
  }

  if (event.httpMethod === 'POST') {
    let payload;
    try { payload = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body.' }) }; }
    const code = normalizeCode(payload.code);
    if (!CODE_PATTERN.test(code)) return { statusCode: 400, body: JSON.stringify({ error: 'Invalid sync code.' }) };
    if (!payload.data || typeof payload.data !== 'object') return { statusCode: 400, body: JSON.stringify({ error: 'Missing "data".' }) };
    const serialized = JSON.stringify(payload.data);
    if (serialized.length > MAX_PAYLOAD_BYTES) return { statusCode: 413, body: JSON.stringify({ error: 'Sync data too large.' }) };
    try {
      await store().set(`codes/${code}`, serialized);
      return { statusCode: 200, body: JSON.stringify({ ok: true, updatedAt: payload.data.updatedAt || null }) };
    } catch (err) {
      console.error(err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not save sync data. If running locally, this needs `netlify dev`, not the plain node server.' }) };
    }
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
};
