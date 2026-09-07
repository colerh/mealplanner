/*
 * Local dev server — mirrors the Netlify Functions API exactly.
 * Run:  node server.js  →  http://localhost:3000
 * Needs: .env with ANTHROPIC_API_KEY, KROGER_CLIENT_ID, KROGER_CLIENT_SECRET
 */
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Each handler below is required straight from its Netlify function file
// and adapted to Express, so the /api/* behavior matches production exactly.
function wrap(fn) {
  return async (req, res) => {
    const event = {
      httpMethod: req.method,
      body: JSON.stringify(req.body || {}),
      queryStringParameters: req.query,
    };
    const result = await fn(event);
    res.status(result.statusCode);
    if (result.body) res.type('application/json').send(result.body);
    else res.end();
  };
}

const fetchPage       = require('./netlify/functions/fetch-page');
const parseRecipeLlm  = require('./netlify/functions/parse-recipe-llm');
const krogerConfig    = require('./netlify/functions/kroger-config');
const krogerToken     = require('./netlify/functions/kroger-token');
const krogerProxy     = require('./netlify/functions/kroger-proxy');

app.post('/api/fetch-page',       wrap(fetchPage.handler));
app.post('/api/parse-recipe-llm', wrap(parseRecipeLlm.handler));
app.get('/api/kroger-config',     wrap(krogerConfig.handler));
app.post('/api/kroger-token',     wrap(krogerToken.handler));
app.post('/api/kroger-proxy',     wrap(krogerProxy.handler));

const port = process.env.PORT || 3000;
app.listen(port, '127.0.0.1', () => console.log(`MealPlanner → http://localhost:${port}`));
