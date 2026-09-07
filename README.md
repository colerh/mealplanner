# mealplanner

Personal recipe library, weekly meal calendar, pantry tracker, and shopping
list generator with optional Kroger cart integration. Dark, mobile-first,
localStorage-first — same stack as Iron Forge and the finance tracker.

## Run locally

```bash
npm install
npm run local        # http://localhost:3000, mirrors the Netlify functions via server.js
# or
npm run dev           # netlify dev
```

## Deploy (Netlify)

Connect the repo in the Netlify dashboard — `netlify.toml` handles build/redirects, no config needed.
Set these env vars in the site settings (see `.env.example`):

- `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` — LLM fallback for recipe import
- `KROGER_CLIENT_ID` / `KROGER_CLIENT_SECRET` / `KROGER_REDIRECT_URI` — from developer.kroger.com (scopes: `product.compact`, `cart.basic:write`); redirect URI must match exactly

Everything else (recipes, pantry, meal plan, shopping list) lives in `localStorage` — no other backend.
