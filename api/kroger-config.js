// Returns the non-secret bits the client needs to kick off the PKCE
// authorize redirect. The client secret is never exposed here.
module.exports = async (req, res) => {
  const clientId = process.env.KROGER_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({ error: 'Server is missing KROGER_CLIENT_ID.' });
    return;
  }
  res.status(200).json({
    clientId,
    redirectUri: process.env.KROGER_REDIRECT_URI || null,
  });
};
