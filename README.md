# mealplanner

Personal recipe library, weekly meal calendar, pantry tracker, and shopping
list generator — a local-first PWA with optional Kroger cart integration.
Dark/technical aesthetic, mobile-first, no build step.

## Stack

- Plain HTML/CSS/JS (ES modules), no framework or bundler
- All app data lives in `localStorage` in the browser (recipes, pantry,
  meal plan, shopping list, settings) — nothing is synced anywhere
- A handful of small serverless functions under `api/` for the pieces that
  genuinely can't run client-side (see below)
- Installable as a PWA (manifest + service worker, offline app shell)

## Why there's a backend at all

The brief was "no backend unless strictly required." Three things needed one:

1. **`api/kroger-token.js`, `api/kroger-proxy.js`, `api/kroger-config.js`**
   — the Kroger OAuth client secret has to live server-side, full stop.
   `kroger-proxy` is a thin unauthenticated-secret passthrough (it just
   forwards the bearer token the client already has) needed because
   Kroger's API doesn't send CORS headers for browser callers.
2. **`api/fetch-page.js`** — recipe sites don't send CORS headers either,
   so the browser can't fetch a third-party recipe page's HTML directly.
   This function does a plain server-side fetch and returns the HTML; it
   holds no secret, it's purely a CORS workaround.
3. **`api/parse-recipe-llm.js`** — the JSON-LD fallback path sends page
   text to the Claude API, which requires an API key that can't be
   shipped to the client either.

Everything else — recipes, pantry, calendar, shopping list, all state —
is pure client-side `localStorage`.

## Data model

```
recipe:            { id, title, sourceUrl, servings, ingredients: [{name, amount, unit}], instructions: [string], tags: [string] }
pantryItem:        { ingredientName, status: "have"|"low"|"out", lastUpdated }
mealPlanEntry:      { date, mealSlot, recipeId }
shoppingListItem:  { ingredientName, quantity, unit, checked, source: "recipe"|"manual" }
```

## Local development

No build step. Serve the directory statically and open it in a browser:

```bash
npm run dev   # npx serve . -l 5000
```

The Kroger and recipe-import features need the `api/` functions running,
which requires the Vercel dev server instead:

```bash
npm i -g vercel
vercel dev
```

## Deploying (Vercel)

1. `vercel` (or connect the repo in the Vercel dashboard) — it auto-detects
   the static site + `api/` functions, no build config needed.
2. Set environment variables in the Vercel project settings:

| Variable | Required for | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | LLM recipe-parse fallback | From console.anthropic.com |
| `ANTHROPIC_MODEL` | optional | Defaults to `claude-sonnet-5` |
| `KROGER_CLIENT_ID` | Kroger integration | From Kroger developer portal |
| `KROGER_CLIENT_SECRET` | Kroger integration | Keep secret — server-only |
| `KROGER_REDIRECT_URI` | Kroger integration | e.g. `https://your-app.vercel.app/index.html` — must exactly match the redirect URI registered on the Kroger developer portal |

3. Register a Kroger developer app at https://developer.kroger.com:
   - Redirect URI: same value as `KROGER_REDIRECT_URI` above
   - Scopes: `product.compact`, `cart.basic:write`
4. Install it on your phone: open the deployed URL in Chrome/Safari and
   use "Add to Home Screen" — the manifest + service worker make it behave
   like a native app.

## Module notes

- **Recipe import** (Recipes tab → `+` → Import from URL): fetches the
  page, looks for embedded schema.org `Recipe` JSON-LD first (works for
  most major recipe sites), and falls back to an LLM parse of the page
  text if none is found. Either way you land on the edit form to review
  before saving — parsers aren't perfect.
- **Weekly calendar**: tap a slot to assign a saved recipe; the meal slots
  themselves (breakfast/lunch/dinner/etc.) are configurable in Settings.
- **Pantry**: loose have/low/out tracking only, no quantities by design.
  "Restock All" resets everything back to "have".
- **Shopping list**: "Generate Shopping List from This Week" on the
  calendar merges ingredients across that week's recipes, skips anything
  marked "have" in the pantry, and flags "low" items. Manually added items
  are left alone on regeneration.
- **Kroger cart**: connect your account once in Settings (OAuth2 +
  PKCE — the app never sees or stores your Kroger password), pick your
  store by ZIP, then "Send to Kroger Cart" on the shopping list searches
  the Product Compact API for each item and lets you confirm/pick the
  right match before adding anything to your real cart. There's no
  checkout API — finish the order in the Kroger app.

## Out of scope (v1)

Nutrition/calorie tracking, multi-user/sharing, non-Kroger store
integrations, precise pantry quantities — all intentionally left out per
the original spec.
