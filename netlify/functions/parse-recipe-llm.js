// Fallback recipe parser for pages without schema.org JSON-LD. Sends the
// page's visible text to the Claude API (server-side only — the API key
// must never reach client code) and asks for strict JSON matching the
// app's recipe shape.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const SYSTEM_PROMPT = `You extract recipe data from raw webpage text and return ONLY strict JSON, no prose, no markdown fences.
The JSON must match exactly this shape:
{
  "title": string,
  "servings": string,
  "ingredients": [{ "name": string, "amount": string, "unit": string }],
  "instructions": [string],
  "tags": [string]
}
Rules:
- "amount" and "unit" may be empty strings if not clearly stated.
- Split each ingredient line into amount/unit/name as best you can (e.g. "2 cups flour" -> amount "2", unit "cups", name "flour").
- "instructions" is an ordered array of step strings, one step per array entry.
- "tags" is a short list of relevant keywords (cuisine, meal type, diet) if inferable, else an empty array.
- If the text does not appear to contain a recipe at all, still return your best-effort guess rather than refusing.
- Output nothing but the JSON object.`;

function extractJson(text) {
  try { return JSON.parse(text); }
  catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Model did not return valid JSON.');
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: 'Server is missing ANTHROPIC_API_KEY.' }) };

  let text, sourceUrl;
  try { ({ text, sourceUrl } = JSON.parse(event.body || '{}')); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body.' }) }; }
  if (!text || typeof text !== 'string') return { statusCode: 400, body: JSON.stringify({ error: 'Missing "text".' }) };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Source URL: ${sourceUrl || 'unknown'}\n\nPage text:\n${text.slice(0, 12000)}` }],
      }),
    });
    if (!response.ok) {
      const errBody = await response.text();
      console.error('Anthropic API error', response.status, errBody);
      return { statusCode: 502, body: JSON.stringify({ error: `LLM request failed (${response.status})` }) };
    }
    const data = await response.json();
    const recipe = extractJson(data.content?.[0]?.text || '');
    return { statusCode: 200, body: JSON.stringify(recipe) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to parse recipe with LLM.' }) };
  }
};
