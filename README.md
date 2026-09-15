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

- `KROGER_CLIENT_ID` / `KROGER_CLIENT_SECRET` / `KROGER_REDIRECT_URI` — from developer.kroger.com (scopes: `product.compact`, `cart.basic:write`); redirect URI must match exactly

Everything else (recipes, pantry, meal plan, shopping list) lives in `localStorage`, with an optional sync layer on Netlify Blobs (no extra setup or env vars — works automatically on any Netlify deploy). In Settings, set a sync code on each device to share data between them. This is a loose, codeless sync, not a real account system: anyone with the code can read or overwrite that data, so it's meant for your own devices only. Sync requires a real Netlify deploy or `netlify dev` — it won't work under `npm run local`.

Recipe import only supports sites that publish embedded structured data (schema.org `Recipe` JSON-LD) — most major recipe sites do. Sites without it need the recipe added manually for now; an AI fallback (Claude API) may come later.
