// Returns the non-secret bits the client needs to kick off the PKCE
// authorize redirect. The client secret is never exposed here.
exports.handler = async () => {
  const clientId = process.env.KROGER_CLIENT_ID;
  if (!clientId) return { statusCode: 500, body: JSON.stringify({ error: 'Server is missing KROGER_CLIENT_ID.' }) };
  return { statusCode: 200, body: JSON.stringify({ clientId, redirectUri: process.env.KROGER_REDIRECT_URI || null }) };
};
