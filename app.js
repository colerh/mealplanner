// ── Icon system (Lucide, MIT) ─────────────────────────────────────────────────
const IC = {
  book:     '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13Z"/><path d="M4 19.5V6.5"/>',
  box:      '<path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v9l9 5 9-5V8"/><path d="M12 13v9"/>',
  cart:     '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2l2.4 12.2a2 2 0 0 0 2 1.6H18a2 2 0 0 0 2-1.6L21.5 7H5.5"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  check:    '<polyline points="20 6 9 17 4 12"/>',
  x:        '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
};
function svgI(name, size = 16, color = 'currentColor') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon" aria-hidden="true">${IC[name] || ''}</svg>`;
}

// ── Storage ───────────────────────────────────────────────────────────────────
const ls = {
  get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

const getRecipes  = () => ls.get('mealplanner_recipes') || [];
const setRecipes  = v  => ls.set('mealplanner_recipes', v);
const getPantry   = () => ls.get('mealplanner_pantry') || [];
const setPantry   = v  => ls.set('mealplanner_pantry', v);
const getMealPlan = () => ls.get('mealplanner_mealplan') || [];
const setMealPlan = v  => ls.set('mealplanner_mealplan', v);
const getShopping = () => ls.get('mealplanner_shopping') || [];
const setShopping = v  => ls.set('mealplanner_shopping', v);
const getSettings = () => ({ mealSlots: ['breakfast', 'lunch', 'dinner'], weekStartsOn: 1, krogerLocationId: null, krogerLocationLabel: null, ...(ls.get('mealplanner_settings') || {}) });
const setSettings = v  => ls.set('mealplanner_settings', v);
const getKrogerTokens  = () => ls.get('mealplanner_kroger_tokens');
const setKrogerTokens  = v  => ls.set('mealplanner_kroger_tokens', v);
const clearKrogerTokens = () => localStorage.removeItem('mealplanner_kroger_tokens');
const getKrogerAppToken = () => ls.get('mealplanner_kroger_app_token');
const setKrogerAppToken = v  => ls.set('mealplanner_kroger_app_token', v);

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function saveRecipe(recipe) {
  const all = getRecipes();
  const idx = all.findIndex(r => r.id === recipe.id);
  if (idx >= 0) all[idx] = recipe; else all.unshift(recipe);
  setRecipes(all);
}
function deleteRecipe(id) {
  setRecipes(getRecipes().filter(r => r.id !== id));
  setMealPlan(getMealPlan().filter(e => e.recipeId !== id));
}
function getRecipe(id) { return getRecipes().find(r => r.id === id) || null; }

function savePantryItem(item) {
  const all = getPantry();
  const idx = all.findIndex(p => p.ingredientName.toLowerCase() === item.ingredientName.toLowerCase());
  if (idx >= 0) all[idx] = item; else all.push(item);
  setPantry(all);
}
function deletePantryItem(name) { setPantry(getPantry().filter(p => p.ingredientName !== name)); }
function restockAllPantry() { setPantry(getPantry().map(p => ({ ...p, status: 'have', lastUpdated: new Date().toISOString() }))); }
function pantryStatus(name) {
  const item = getPantry().find(p => p.ingredientName.toLowerCase() === name.toLowerCase());
  return item ? item.status : null;
}

function setMealPlanEntry(date, mealSlot, recipeId) {
  const all = getMealPlan().filter(e => !(e.date === date && e.mealSlot === mealSlot));
  if (recipeId) all.push({ date, mealSlot, recipeId });
  setMealPlan(all);
}

// ── Date helpers ────────────────────────────────────────────────────────────
function pad2(n) { return String(n).padStart(2, '0'); }
function toISODate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function getTodayStr() { return toISODate(new Date()); }
function startOfWeek(date, weekStartsOn = 1) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function fmtDayLabel(date) { return date.toLocaleDateString(undefined, { weekday: 'short' }); }
function fmtDateLabel(date) { return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }

// ── Ingredient text parsing ─────────────────────────────────────────────────
const UNICODE_FRACTIONS = { '¼': .25, '½': .5, '¾': .75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': .125, '⅜': .375, '⅝': .625, '⅞': .875 };
const KNOWN_UNITS = [
  'cups', 'cup', 'c', 'tablespoons', 'tablespoon', 'tbsp', 'tbs', 'tb',
  'teaspoons', 'teaspoon', 'tsp', 'ts', 'ounces', 'ounce', 'oz', 'fl oz',
  'pounds', 'pound', 'lbs', 'lb', 'grams', 'gram', 'g', 'kilograms', 'kilogram', 'kg',
  'milliliters', 'milliliter', 'ml', 'liters', 'liter', 'l',
  'cloves', 'clove', 'cans', 'can', 'packages', 'package', 'pkg',
  'pinch', 'pinches', 'dash', 'dashes', 'slices', 'slice', 'sticks', 'stick',
  'bunches', 'bunch', 'heads', 'head', 'large', 'medium', 'small', 'whole',
  'quarts', 'quart', 'qt', 'pints', 'pint', 'pt',
].sort((a, b) => b.length - a.length);
const UNIT_PATTERN = KNOWN_UNITS.join('|');

function parseNumberToken(token) {
  token = token.trim();
  if (!token) return null;
  if (UNICODE_FRACTIONS[token] !== undefined) return UNICODE_FRACTIONS[token];
  const mixed = token.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = token.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const num = Number(token);
  return Number.isFinite(num) ? num : null;
}

function parseIngredientLine(line) {
  let text = String(line || '').trim().replace(/\s+/g, ' ');
  if (!text) return { amount: '', unit: '', name: '' };
  text = text.replace(/(\d)([¼½¾⅓⅔⅛⅜⅝⅞])/, '$1 $2');
  const amountRegex = new RegExp(`^((?:\\d+\\s+\\d+\\/\\d+)|(?:\\d+\\/\\d+)|(?:\\d*\\.\\d+)|(?:\\d+)|[${Object.keys(UNICODE_FRACTIONS).join('')}])\\s*`);
  const amountMatch = text.match(amountRegex);
  let amount = '', rest = text;
  if (amountMatch) {
    const parsed = parseNumberToken(amountMatch[1]);
    if (parsed !== null) { amount = parsed; rest = text.slice(amountMatch[0].length); }
  }
  const unitMatch = rest.match(new RegExp(`^(${UNIT_PATTERN})\\b\\.?\\s*`, 'i'));
  let unit = '';
  if (unitMatch) { unit = unitMatch[1].toLowerCase(); rest = rest.slice(unitMatch[0].length); }
  rest = rest.replace(/^,\s*/, '').replace(/^of\s+/i, '').trim();
  return { amount, unit, name: rest };
}

function normalizeIngredientName(name) {
  return String(name || '').toLowerCase().trim().replace(/^\d+\s*/, '').replace(/[.,]+$/, '').replace(/\s+/g, ' ');
}

function formatQuantity(amount, unit) {
  const parts = [];
  if (amount !== '' && amount !== null && amount !== undefined) parts.push(String(Math.round(amount * 100) / 100));
  if (unit) parts.push(unit);
  return parts.join(' ');
}

// Strips prep/descriptor noise ("egg, lightly beaten" -> "egg") before
// hitting Kroger's product search — recipe ingredient text is written for
// humans, not a product catalog search box, and prep words hurt match quality.
const INGREDIENT_SEARCH_STOPWORDS = [
  'lightly beaten', 'well beaten', 'beaten', 'finely chopped', 'coarsely chopped',
  'roughly chopped', 'chopped', 'finely diced', 'diced', 'minced', 'thinly sliced',
  'sliced thin', 'sliced', 'grated', 'shredded', 'melted', 'softened',
  'at room temperature', 'room temperature', 'peeled and deveined', 'peeled',
  'deveined', 'seeded', 'cored', 'crushed', 'drained and rinsed', 'drained',
  'rinsed', 'packed', 'divided', 'to taste', 'for garnish', 'if desired',
  'optional', 'finely', 'coarsely', 'roughly', 'freshly', 'thinly', 'julienned',
  'cubed', 'halved', 'quartered', 'trimmed', 'washed', 'cleaned', 'boneless',
  'skinless', 'unsalted', 'salted',
].sort((a, b) => b.length - a.length);

function cleanIngredientSearchTerm(name) {
  let s = String(name || '').toLowerCase();
  s = s.replace(/\([^)]*\)/g, ' '); // drop parenthetical asides
  s = s.split(',')[0]; // "egg, lightly beaten" -> "egg" — prep notes almost always follow a comma
  INGREDIENT_SEARCH_STOPWORDS.forEach(w => { s = s.replace(new RegExp(`\\b${w}\\b`, 'g'), ' '); });
  s = s.replace(/\s+/g, ' ').trim();
  return s || String(name || '').trim();
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`.trim();
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

function openModal(innerHtml, { onMount } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">${innerHtml}</div>`;
  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
  if (onMount) onMount(overlay.querySelector('.modal'), close);
  return close;
}

function confirmDialog(message) {
  return new Promise(resolve => {
    openModal(`
      <h3>Confirm</h3>
      <p style="color:var(--text2);font-size:13px;margin-bottom:18px">${escapeHtml(message)}</p>
      <div class="btn-row">
        <button class="btn btn-outline flex-1" data-a="cancel">Cancel</button>
        <button class="btn btn-danger flex-1" data-a="ok">Confirm</button>
      </div>
    `, {
      onMount(modal, close) {
        modal.querySelector('[data-a=cancel]').addEventListener('click', () => { close(); resolve(false); });
        modal.querySelector('[data-a=ok]').addEventListener('click', () => { close(); resolve(true); });
      },
    });
  });
}

// ── Tabs ────────────────────────────────────────────────────────────────────
function showTab(id) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + id)?.classList.add('active');
  document.querySelectorAll('#sidebar .nav-item[data-tab], #bottom-nav .nav-item[data-tab]').forEach(n =>
    n.classList.toggle('active', n.dataset.tab === id));
  document.getElementById('menu-overlay')?.classList.remove('open');
  if (id === 'plan')     renderPlanTab();
  if (id === 'recipes')  renderRecipesTab();
  if (id === 'pantry')   renderPantryTab();
  if (id === 'shopping') renderShoppingTab();
  if (id === 'settings') renderSettingsTab();
}
function openMenu() { document.getElementById('menu-overlay').classList.add('open'); }

// ── RECIPES ───────────────────────────────────────────────────────────────────
let recipeView = { mode: 'list', id: null, draft: null };

function renderRecipesTab() {
  const tab = document.getElementById('tab-recipes');
  if (recipeView.mode === 'detail')      return renderRecipeDetail(tab, recipeView.id);
  if (recipeView.mode === 'form')        return renderRecipeForm(tab, recipeView.id, recipeView.draft);
  if (recipeView.mode === 'import')      return renderRecipeImport(tab);
  renderRecipeList(tab);
}

function goToRecipeList()               { recipeView = { mode: 'list', id: null, draft: null }; renderRecipesTab(); }
function goToRecipeDetail(id)           { recipeView = { mode: 'detail', id, draft: null }; renderRecipesTab(); }
function goToRecipeForm(id, draft)      { recipeView = { mode: 'form', id: id || null, draft: draft || null }; renderRecipesTab(); }
function goToRecipeImport()             { recipeView = { mode: 'import', id: null, draft: null }; renderRecipesTab(); }

function renderRecipeList(tab) {
  const recipes = getRecipes();
  const tags = Array.from(new Set(recipes.flatMap(r => r.tags || []))).sort();
  let query = '', activeTag = '';

  tab.innerHTML = `
    <div class="top-bar">
      <h1 style="margin:0">Recipes</h1>
      <button class="btn btn-primary btn-sm" id="add-recipe-btn">+ Add</button>
    </div>
    <div class="search-bar"><input type="search" id="recipe-search" placeholder="Search recipes or ingredients..."></div>
    ${tags.length ? `<div class="btn-row" style="margin-bottom:12px">${tags.map(t => `<button class="btn btn-ghost btn-sm tag-filter" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}</div>` : ''}
    <div id="recipe-results"></div>
  `;

  const resultsEl = tab.querySelector('#recipe-results');
  function draw() {
    const filtered = recipes.filter(r => {
      if (activeTag && !(r.tags || []).includes(activeTag)) return false;
      if (!query) return true;
      const hay = [r.title, ...(r.tags || []), ...(r.ingredients || []).map(i => i.name)].join(' ').toLowerCase();
      return hay.includes(query.toLowerCase());
    });
    if (!filtered.length) {
      resultsEl.innerHTML = `<div class="empty-state"><div class="big">🍳</div>No recipes yet.<br>Add one to get started.</div>`;
      return;
    }
    resultsEl.innerHTML = filtered.map(r => `
      <div class="card recipe-card" data-id="${r.id}">
        <div class="title">${escapeHtml(r.title)}</div>
        <div class="meta">${r.servings ? `${escapeHtml(String(r.servings))} servings · ` : ''}${(r.ingredients || []).length} ingredients</div>
        ${(r.tags || []).length ? `<div class="tags">${r.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      </div>
    `).join('');
    resultsEl.querySelectorAll('.recipe-card').forEach(card => card.addEventListener('click', () => goToRecipeDetail(card.dataset.id)));
  }

  tab.querySelector('#recipe-search').addEventListener('input', e => { query = e.target.value; draw(); });
  tab.querySelectorAll('.tag-filter').forEach(btn => btn.addEventListener('click', () => {
    activeTag = activeTag === btn.dataset.tag ? '' : btn.dataset.tag;
    tab.querySelectorAll('.tag-filter').forEach(b => b.classList.toggle('btn-primary', b.dataset.tag === activeTag));
    draw();
  }));
  tab.querySelector('#add-recipe-btn').addEventListener('click', showAddRecipeChoice);
  draw();
}

function showAddRecipeChoice() {
  openModal(`
    <h3>Add Recipe</h3>
    <div class="btn-row" style="flex-direction:column">
      <button class="btn btn-primary btn-block" data-a="url">Import from URL</button>
      <button class="btn btn-outline btn-block" data-a="manual">Add Manually</button>
    </div>
  `, {
    onMount(modal, close) {
      modal.querySelector('[data-a=url]').addEventListener('click', () => { close(); goToRecipeImport(); });
      modal.querySelector('[data-a=manual]').addEventListener('click', () => { close(); goToRecipeForm(); });
    },
  });
}

function renderRecipeImport(tab) {
  tab.innerHTML = `
    <div class="top-bar"><h1 style="margin:0">Import Recipe</h1></div>
    <div class="card">
      <div class="field"><label>Recipe URL</label><input type="url" id="import-url" placeholder="https://example.com/recipe"></div>
      <div class="btn-row">
        <button class="btn btn-ghost" id="cancel-import-btn">Cancel</button>
        <button class="btn btn-primary flex-1" id="import-btn">Fetch &amp; Import</button>
      </div>
      <div id="import-status" class="text-dim text-small mt-8"></div>
    </div>
    <div class="card">
      <h2>Site blocking the fetch?</h2>
      <p class="text-dim text-small">Some sites (AllRecipes and other big publishers) run bot-detection that blocks automated fetches entirely — no way around that from a server. Workaround: open the recipe in your own browser (it'll load fine there), copy the page's HTML source, and paste it below — same parser, just skips the blocked fetch.</p>
      <p class="text-dim text-small"><strong>Desktop:</strong> right-click the page → View Page Source (or Ctrl/Cmd+U) → Ctrl/Cmd+A → Ctrl/Cmd+C.</p>
      <div class="field mt-8"><textarea id="import-html" rows="6" placeholder="Paste page HTML here..."></textarea></div>
      <button class="btn btn-outline btn-block" id="parse-html-btn">Parse Pasted HTML</button>
    </div>
    <p class="text-dim text-small">Either path only works on sites that publish embedded recipe data (JSON-LD) — most major recipe sites do. If neither works, add the recipe manually instead.</p>
  `;
  tab.querySelector('#cancel-import-btn').addEventListener('click', goToRecipeList);
  tab.querySelector('#import-btn').addEventListener('click', async () => {
    const url = tab.querySelector('#import-url').value.trim();
    if (!url) { toast('Enter a URL first.', 'error'); return; }
    const statusEl = tab.querySelector('#import-status');
    const btn = tab.querySelector('#import-btn');
    btn.disabled = true;
    statusEl.innerHTML = `<span class="spinner"></span> Fetching page...`;
    try {
      const { recipe, viaWayback } = await importRecipeFromUrl(url);
      toast(viaWayback ? 'Site blocked a live fetch — parsed from an archived copy instead.' : 'Parsed structured recipe data.', 'success');
      goToRecipeForm(null, recipe);
    } catch (err) {
      console.error(err);
      statusEl.textContent = '';
      toast(err.message || 'Import failed. Try the paste-HTML option below.', 'error');
      btn.disabled = false;
    }
  });
  tab.querySelector('#parse-html-btn').addEventListener('click', () => {
    const html = tab.querySelector('#import-html').value;
    const url = tab.querySelector('#import-url').value.trim();
    if (!html.trim()) { toast('Paste some HTML first.', 'error'); return; }
    const recipe = extractJsonLdRecipe(html, url);
    if (!recipe || !recipe.ingredients.length) { toast('No structured recipe data found in that HTML.', 'error'); return; }
    toast('Parsed structured recipe data.', 'success');
    goToRecipeForm(null, recipe);
  });
}

function ingredientRowHtml(ing = { amount: '', unit: '', name: '' }) {
  return `
    <div class="ingredient-row">
      <input type="text" class="ing-amount" placeholder="Amt" value="${escapeHtml(ing.amount ?? '')}">
      <input type="text" class="ing-unit" placeholder="Unit" value="${escapeHtml(ing.unit ?? '')}">
      <input type="text" class="ing-name" placeholder="Ingredient" value="${escapeHtml(ing.name ?? '')}">
      <button type="button" class="remove-row-btn" data-remove-ing>&times;</button>
    </div>`;
}
function instructionRowHtml(step = '', idx = 0) {
  return `
    <div class="instruction-row">
      <div class="step-num">${idx + 1}.</div>
      <textarea class="instruction-text" placeholder="Step ${idx + 1}...">${escapeHtml(step)}</textarea>
      <button type="button" class="remove-row-btn" data-remove-step>&times;</button>
    </div>`;
}

function renderRecipeForm(tab, id, draft) {
  const editing = !!id;
  let recipe = editing ? getRecipe(id) : draft;
  if (editing && !recipe) { tab.innerHTML = `<div class="empty-state">Recipe not found.</div>`; return; }
  recipe = recipe || { title: '', sourceUrl: '', servings: '', ingredients: [{}], instructions: [''], tags: [] };
  if (!recipe.ingredients?.length) recipe.ingredients = [{ amount: '', unit: '', name: '' }];
  if (!recipe.instructions?.length) recipe.instructions = [''];

  tab.innerHTML = `
    <div class="top-bar"><h1 style="margin:0">${editing ? 'Edit' : 'New'} Recipe</h1></div>
    <div class="card">
      <div class="field"><label>Title</label><input type="text" id="f-title" value="${escapeHtml(recipe.title)}" placeholder="Recipe name"></div>
      <div class="field-row">
        <div class="field"><label>Servings</label><input type="text" id="f-servings" value="${escapeHtml(recipe.servings ?? '')}" placeholder="4"></div>
        <div class="field"><label>Source URL</label><input type="url" id="f-source" value="${escapeHtml(recipe.sourceUrl ?? '')}" placeholder="optional"></div>
      </div>
      <div class="field"><label>Tags (comma separated)</label><input type="text" id="f-tags" value="${escapeHtml((recipe.tags || []).join(', '))}" placeholder="weeknight, pasta"></div>
    </div>
    <div class="card">
      <div class="section-header"><h2 class="mb-0">Ingredients</h2><button type="button" class="btn btn-outline btn-sm" id="add-ing">+ Add</button></div>
      <div id="ingredient-rows">${recipe.ingredients.map(ingredientRowHtml).join('')}</div>
    </div>
    <div class="card">
      <div class="section-header"><h2 class="mb-0">Instructions</h2><button type="button" class="btn btn-outline btn-sm" id="add-step">+ Add</button></div>
      <div id="instruction-rows">${recipe.instructions.map(instructionRowHtml).join('')}</div>
    </div>
    <div class="btn-row">
      <button class="btn btn-ghost" id="cancel-form-btn">Cancel</button>
      <button class="btn btn-primary flex-1" id="save-recipe-btn">Save Recipe</button>
      ${editing ? '<button class="btn btn-danger" id="delete-recipe-btn">Delete</button>' : ''}
    </div>
  `;

  const ingRows = tab.querySelector('#ingredient-rows');
  const stepRows = tab.querySelector('#instruction-rows');
  function reindexSteps() {
    stepRows.querySelectorAll('.instruction-row').forEach((row, i) => {
      row.querySelector('.step-num').textContent = `${i + 1}.`;
      row.querySelector('textarea').placeholder = `Step ${i + 1}...`;
    });
  }
  tab.querySelector('#add-ing').addEventListener('click', () => ingRows.insertAdjacentHTML('beforeend', ingredientRowHtml()));
  tab.querySelector('#add-step').addEventListener('click', () => { stepRows.insertAdjacentHTML('beforeend', instructionRowHtml('', stepRows.children.length)); });
  ingRows.addEventListener('click', e => { if (e.target.matches('[data-remove-ing]')) e.target.closest('.ingredient-row').remove(); });
  stepRows.addEventListener('click', e => { if (e.target.matches('[data-remove-step]')) { e.target.closest('.instruction-row').remove(); reindexSteps(); } });
  tab.querySelector('#cancel-form-btn').addEventListener('click', () => editing ? goToRecipeDetail(id) : goToRecipeList());

  if (editing) {
    tab.querySelector('#delete-recipe-btn').addEventListener('click', async () => {
      if (await confirmDialog(`Delete "${recipe.title}"? This also removes it from any planned meals.`)) {
        deleteRecipe(id);
        toast('Recipe deleted.');
        goToRecipeList();
      }
    });
  }

  tab.querySelector('#save-recipe-btn').addEventListener('click', () => {
    const title = tab.querySelector('#f-title').value.trim();
    if (!title) { toast('Title is required.', 'error'); return; }
    const ingredients = Array.from(ingRows.querySelectorAll('.ingredient-row')).map(row => ({
      amount: row.querySelector('.ing-amount').value.trim(),
      unit: row.querySelector('.ing-unit').value.trim(),
      name: row.querySelector('.ing-name').value.trim(),
    })).filter(i => i.name);
    const instructions = Array.from(stepRows.querySelectorAll('.instruction-text')).map(ta => ta.value.trim()).filter(Boolean);
    const tags = tab.querySelector('#f-tags').value.split(',').map(t => t.trim()).filter(Boolean);
    const saved = {
      id: id || uuid(), title,
      sourceUrl: tab.querySelector('#f-source').value.trim(),
      servings: tab.querySelector('#f-servings').value.trim(),
      ingredients, instructions, tags,
    };
    saveRecipe(saved);
    toast('Recipe saved.', 'success');
    goToRecipeDetail(saved.id);
  });
}

function renderRecipeDetail(tab, id) {
  const recipe = getRecipe(id);
  if (!recipe) { tab.innerHTML = `<div class="empty-state">Recipe not found.</div>`; return; }
  tab.innerHTML = `
    <div class="top-bar">
      <h1 style="margin:0">${escapeHtml(recipe.title)}</h1>
      <div class="btn-row">
        <button class="btn btn-ghost btn-sm" id="back-btn">← Back</button>
        <button class="btn btn-outline btn-sm" id="edit-recipe-btn">Edit</button>
      </div>
    </div>
    <div class="text-dim text-small" style="margin-bottom:14px">
      ${recipe.servings ? `${escapeHtml(String(recipe.servings))} servings` : ''}
      ${recipe.sourceUrl ? ` · <a href="${escapeHtml(recipe.sourceUrl)}" target="_blank" rel="noopener">source</a>` : ''}
    </div>
    ${(recipe.tags || []).length ? `<div class="tags" style="margin-bottom:14px">${recipe.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    <div class="card">
      <h2>Ingredients</h2>
      <ul style="margin:0;padding-left:18px">${(recipe.ingredients || []).map(i => `<li>${escapeHtml([i.amount, i.unit, i.name].filter(Boolean).join(' '))}</li>`).join('') || '<li class="text-dim">None listed</li>'}</ul>
    </div>
    <div class="card">
      <h2>Instructions</h2>
      <ol style="margin:0;padding-left:18px">${(recipe.instructions || []).map(s => `<li style="margin-bottom:8px">${escapeHtml(s)}</li>`).join('') || '<li class="text-dim">None listed</li>'}</ol>
    </div>
  `;
  tab.querySelector('#back-btn').addEventListener('click', goToRecipeList);
  tab.querySelector('#edit-recipe-btn').addEventListener('click', () => goToRecipeForm(id));
}

// ── Recipe import pipeline (JSON-LD structured data only, for now) ─────────
async function fetchPageHtml(url) {
  const res = await fetch('/api/fetch-page', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || `Failed to fetch page (${res.status})`); }
  return res.json(); // { html, viaWayback }
}

function collectJsonLdNodes(doc) {
  const nodes = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const parsed = JSON.parse(script.textContent);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      arr.forEach(item => item['@graph'] ? nodes.push(...item['@graph']) : nodes.push(item));
    } catch {}
  });
  return nodes;
}
function isRecipeNode(node) {
  const type = node['@type'];
  if (!type) return false;
  return (Array.isArray(type) ? type : [type]).some(t => String(t).toLowerCase() === 'recipe');
}
function textOf(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.name) return value.name;
  return String(value);
}
function parseInstructions(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') return raw.split(/\n+/).map(s => s.trim()).filter(Boolean);
  if (Array.isArray(raw)) {
    const steps = [];
    raw.forEach(item => {
      if (typeof item === 'string') steps.push(item.trim());
      else if (item?.['@type'] === 'HowToSection' && Array.isArray(item.itemListElement)) item.itemListElement.forEach(sub => steps.push(textOf(sub.text || sub.name || sub)));
      else if (item?.text || item?.name) steps.push(textOf(item.text || item.name));
    });
    return steps.map(s => s.trim()).filter(Boolean);
  }
  return [];
}
function parseYield(raw) {
  if (!raw) return '';
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (String(value).match(/\d+/) || [String(value)])[0];
}
function parseIngredients(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(line => {
    const p = parseIngredientLine(line);
    return { name: p.name || String(line).trim(), amount: p.amount, unit: p.unit };
  });
}
function parseTags(node) {
  const tags = new Set();
  const addAll = val => { if (!val) return; (Array.isArray(val) ? val : String(val).split(',')).forEach(t => { const c = String(t).trim(); if (c) tags.add(c); }); };
  addAll(node.keywords); addAll(node.recipeCategory); addAll(node.recipeCuisine);
  return Array.from(tags).slice(0, 12);
}
function extractJsonLdRecipe(html, sourceUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const recipeNode = collectJsonLdNodes(doc).find(isRecipeNode);
  if (!recipeNode) return null;
  return {
    title: textOf(recipeNode.name) || 'Untitled recipe', sourceUrl,
    servings: parseYield(recipeNode.recipeYield),
    ingredients: parseIngredients(recipeNode.recipeIngredient || recipeNode.ingredients),
    instructions: parseInstructions(recipeNode.recipeInstructions),
    tags: parseTags(recipeNode),
  };
}
async function importRecipeFromUrl(url) {
  const { html, viaWayback } = await fetchPageHtml(url);
  const recipe = extractJsonLdRecipe(html, url);
  if (!recipe || !recipe.ingredients.length) {
    throw new Error("No structured recipe data found on this page. Try a different site, or add the recipe manually.");
  }
  return { recipe, viaWayback };
}

// ── PANTRY ──────────────────────────────────────────────────────────────────
function renderPantryTab() {
  const content = document.getElementById('pantry-content');
  content.innerHTML = `
    <div class="card">
      <div class="field-row" style="align-items:flex-end">
        <div class="field flex-1"><label>Add item</label><input type="text" id="new-pantry-name" placeholder="e.g. olive oil"></div>
        <button class="btn btn-primary" id="add-pantry-btn" style="margin-bottom:12px">Add</button>
      </div>
    </div>
    <div id="pantry-list"></div>
  `;
  const listEl = content.querySelector('#pantry-list');
  const STATUSES = ['have', 'low', 'out'];

  function draw() {
    const items = getPantry().slice().sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
    if (!items.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="big">🥫</div>No pantry items yet.<br>Add what you keep stocked so shopping lists can skip it.</div>`;
      return;
    }
    listEl.innerHTML = `<div class="card">${items.map(item => `
      <div class="pantry-row" data-name="${escapeHtml(item.ingredientName)}">
        <div class="name">${escapeHtml(item.ingredientName)}</div>
        <div class="status-toggle">${STATUSES.map(s => `<button data-status="${s}" class="${item.status === s ? `active-${s}` : ''}">${s}</button>`).join('')}</div>
        <button class="remove-row-btn" data-remove>&times;</button>
      </div>`).join('')}</div>`;

    listEl.querySelectorAll('.pantry-row').forEach(row => {
      const name = row.dataset.name;
      row.querySelectorAll('[data-status]').forEach(btn => btn.addEventListener('click', () => {
        savePantryItem({ ingredientName: name, status: btn.dataset.status, lastUpdated: new Date().toISOString() });
        draw();
      }));
      row.querySelector('[data-remove]').addEventListener('click', async () => {
        if (await confirmDialog(`Remove "${name}" from pantry?`)) { deletePantryItem(name); draw(); }
      });
    });
  }

  content.querySelector('#add-pantry-btn').addEventListener('click', () => {
    const input = content.querySelector('#new-pantry-name');
    const name = input.value.trim();
    if (!name) return;
    savePantryItem({ ingredientName: name, status: 'have', lastUpdated: new Date().toISOString() });
    input.value = '';
    draw();
  });
  content.querySelector('#new-pantry-name').addEventListener('keydown', e => { if (e.key === 'Enter') content.querySelector('#add-pantry-btn').click(); });
  draw();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('restock-btn')?.addEventListener('click', async () => {
    if (await confirmDialog('Mark all pantry items as "have"?')) { restockAllPantry(); toast('Pantry restocked.', 'success'); renderPantryTab(); }
  });
});

// ── PLAN (weekly calendar + month overview) ─────────────────────────────────
let planViewMode = 'week';
let planAnchor = getTodayStr();
let monthAnchor = getTodayStr();

function weekDates(anchorISO, weekStartsOn) {
  const start = startOfWeek(new Date(anchorISO + 'T00:00:00'), weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
function monthGridDates(anchorISO, weekStartsOn) {
  const anchor = new Date(anchorISO + 'T00:00:00');
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(firstOfMonth, weekStartsOn);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function pickRecipeModal(onPick) {
  const recipes = getRecipes();
  openModal(`
    <h3>Choose a recipe</h3>
    <input type="search" id="pick-search" placeholder="Search recipes..." style="margin-bottom:10px">
    <div id="pick-list" style="max-height:50vh;overflow-y:auto"></div>
    ${recipes.length ? '' : '<p class="text-dim text-small">No recipes saved yet. Add some in the Recipes tab first.</p>'}
  `, {
    onMount(modal, close) {
      const listEl = modal.querySelector('#pick-list');
      function draw(filter = '') {
        const filtered = recipes.filter(r => r.title.toLowerCase().includes(filter.toLowerCase()));
        listEl.innerHTML = filtered.map(r => `<div class="pantry-row" data-id="${r.id}" style="cursor:pointer"><div class="name">${escapeHtml(r.title)}</div><span class="text-dim text-small">${(r.ingredients || []).length} ing</span></div>`).join('') || '<p class="text-dim text-small">No matches.</p>';
        listEl.querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', () => { onPick(el.dataset.id); close(); }));
      }
      modal.querySelector('#pick-search').addEventListener('input', e => draw(e.target.value));
      draw();
    },
  });
}

// Shared day-editor used by both the month view (tap a day) and could be
// reused anywhere else a single day's slots need editing.
function openDayMealsModal(dateISO) {
  const dateLabel = new Date(dateISO + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  openModal(`
    <h3>${escapeHtml(dateLabel)}</h3>
    <div id="day-meals-list"></div>
    <button class="btn btn-outline btn-block mt-8" data-a="close">Close</button>
  `, {
    onMount(modal, close) {
      const listEl = modal.querySelector('#day-meals-list');
      function draw() {
        const settings = getSettings();
        const mealPlan = getMealPlan();
        const recipesById = Object.fromEntries(getRecipes().map(r => [r.id, r]));
        listEl.innerHTML = settings.mealSlots.map(slot => {
          const entry = mealPlan.find(e => e.date === dateISO && e.mealSlot === slot);
          const recipe = entry ? recipesById[entry.recipeId] : null;
          return `
            <div class="slot-row ${recipe ? 'filled' : ''}" data-slot="${slot}">
              <div class="slot-label">${escapeHtml(slot)}</div>
              <div class="slot-content">${recipe ? escapeHtml(recipe.title) : '<span class="text-dim">tap to assign</span>'}</div>
              ${recipe ? '<button class="remove-row-btn" data-clear-slot>&times;</button>' : ''}
            </div>`;
        }).join('');
        listEl.querySelectorAll('.slot-row').forEach(row => {
          row.querySelector('.slot-content').addEventListener('click', () => {
            pickRecipeModal(recipeId => { setMealPlanEntry(dateISO, row.dataset.slot, recipeId); draw(); renderPlanTab(); });
          });
          row.querySelector('[data-clear-slot]')?.addEventListener('click', e => {
            e.stopPropagation();
            setMealPlanEntry(dateISO, row.dataset.slot, null);
            draw(); renderPlanTab();
          });
        });
      }
      draw();
      modal.querySelector('[data-a=close]').addEventListener('click', close);
    },
  });
}

function drawWeekView(content) {
  const settings = getSettings();

  function draw() {
    const dates = weekDates(planAnchor, settings.weekStartsOn);
    const mealPlan = getMealPlan();
    const recipesById = Object.fromEntries(getRecipes().map(r => [r.id, r]));

    content.innerHTML = `
      <div class="week-nav">
        <button class="btn btn-outline btn-sm" id="prev-week">&larr;</button>
        <span class="week-label">${fmtDateLabel(dates[0])} &ndash; ${fmtDateLabel(dates[6])}</span>
        <button class="btn btn-outline btn-sm" id="next-week">&rarr;</button>
      </div>
      <div id="days"></div>
      <div class="btn-row">
        <button class="btn btn-danger btn-sm" id="clear-week">Clear Week</button>
        <button class="btn btn-primary flex-1" id="gen-shopping">Generate Shopping List</button>
      </div>
    `;

    content.querySelector('#days').innerHTML = dates.map(date => {
      const dateISO = toISODate(date);
      const isToday = dateISO === getTodayStr();
      return `
        <div class="day-col">
          <div class="day-label"><span>${fmtDayLabel(date)} <span class="date-num">${fmtDateLabel(date)}</span></span>${isToday ? '<span class="today-marker">TODAY</span>' : ''}</div>
          ${settings.mealSlots.map(slot => {
            const entry = mealPlan.find(e => e.date === dateISO && e.mealSlot === slot);
            const recipe = entry ? recipesById[entry.recipeId] : null;
            return `
              <div class="slot-row ${recipe ? 'filled' : ''} ${isToday ? 'today' : ''}" data-date="${dateISO}" data-slot="${slot}">
                <div class="slot-label">${escapeHtml(slot)}</div>
                <div class="slot-content">${recipe ? escapeHtml(recipe.title) : '<span class="text-dim">tap to assign</span>'}</div>
                ${recipe ? '<button class="remove-row-btn" data-clear-slot>&times;</button>' : ''}
              </div>`;
          }).join('')}
        </div>`;
    }).join('');

    content.querySelectorAll('.slot-row').forEach(row => {
      row.querySelector('.slot-content').addEventListener('click', () => {
        pickRecipeModal(recipeId => { setMealPlanEntry(row.dataset.date, row.dataset.slot, recipeId); draw(); });
      });
      row.querySelector('[data-clear-slot]')?.addEventListener('click', e => { e.stopPropagation(); setMealPlanEntry(row.dataset.date, row.dataset.slot, null); draw(); });
    });

    content.querySelector('#prev-week').addEventListener('click', () => { planAnchor = toISODate(addDays(dates[0], -7)); draw(); });
    content.querySelector('#next-week').addEventListener('click', () => { planAnchor = toISODate(addDays(dates[0], 7)); draw(); });
    content.querySelector('#clear-week').addEventListener('click', async () => {
      if (await confirmDialog('Clear all planned meals for this week?')) {
        const set = new Set(dates.map(toISODate));
        setMealPlan(getMealPlan().filter(e => !set.has(e.date)));
        draw();
      }
    });
    content.querySelector('#gen-shopping').addEventListener('click', () => {
      generateShoppingListFromDates(dates.map(toISODate));
      showTab('shopping');
    });
  }

  draw();
}

function drawMonthView(content) {
  const settings = getSettings();
  const anchorDate = new Date(monthAnchor + 'T00:00:00');
  const currentMonth = anchorDate.getMonth();
  const monthLabel = anchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const dates = monthGridDates(monthAnchor, settings.weekStartsOn);
  const mealPlan = getMealPlan();
  const recipesById = Object.fromEntries(getRecipes().map(r => [r.id, r]));
  const todayISO = getTodayStr();
  const CHIP_LIMIT = 2;

  content.innerHTML = `
    <div class="week-nav">
      <button class="btn btn-outline btn-sm" id="prev-month">&larr;</button>
      <span class="week-label">${escapeHtml(monthLabel)}</span>
      <button class="btn btn-outline btn-sm" id="next-month">&rarr;</button>
    </div>
    <div class="month-grid">
      ${dates.slice(0, 7).map(d => `<div class="month-dow">${fmtDayLabel(d)}</div>`).join('')}
      ${dates.map(date => {
        const dateISO = toISODate(date);
        const inMonth = date.getMonth() === currentMonth;
        const isToday = dateISO === todayISO;
        const entries = settings.mealSlots
          .map(slot => mealPlan.find(e => e.date === dateISO && e.mealSlot === slot))
          .filter(Boolean)
          .map(e => recipesById[e.recipeId])
          .filter(Boolean);
        const shown = entries.slice(0, CHIP_LIMIT);
        const extra = entries.length - shown.length;
        return `
          <div class="month-cell ${inMonth ? '' : 'dim'} ${isToday ? 'today' : ''}" data-date="${dateISO}">
            <div class="month-cell-daynum">${date.getDate()}</div>
            <div class="month-cell-chips">
              ${shown.map(r => `<div class="month-chip">${escapeHtml(r.title)}</div>`).join('')}
              ${extra > 0 ? `<div class="month-chip-more">+${extra} more</div>` : ''}
            </div>
          </div>`;
      }).join('')}
    </div>
  `;

  content.querySelectorAll('.month-cell').forEach(cell => cell.addEventListener('click', () => openDayMealsModal(cell.dataset.date)));
  content.querySelector('#prev-month').addEventListener('click', () => {
    monthAnchor = toISODate(new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1));
    drawMonthView(content);
  });
  content.querySelector('#next-month').addEventListener('click', () => {
    monthAnchor = toISODate(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1));
    drawMonthView(content);
  });
}

function renderPlanTab() {
  const content = document.getElementById('plan-content');
  content.innerHTML = `
    <div class="toggle-group">
      <button class="toggle-btn ${planViewMode === 'week' ? 'active' : ''}" data-view="week">Week</button>
      <button class="toggle-btn ${planViewMode === 'month' ? 'active' : ''}" data-view="month">Month</button>
    </div>
    <div id="plan-view"></div>
  `;
  content.querySelectorAll('.toggle-btn').forEach(btn => btn.addEventListener('click', () => {
    planViewMode = btn.dataset.view;
    renderPlanTab();
  }));
  const viewEl = content.querySelector('#plan-view');
  if (planViewMode === 'month') drawMonthView(viewEl);
  else drawWeekView(viewEl);
}

// ── SHOPPING ────────────────────────────────────────────────────────────────
function mergeIngredientsForDates(dates) {
  const mealPlan = getMealPlan().filter(e => dates.includes(e.date));
  const recipesById = Object.fromEntries(getRecipes().map(r => [r.id, r]));
  const groups = new Map();
  mealPlan.forEach(entry => {
    const recipe = recipesById[entry.recipeId];
    if (!recipe) return;
    (recipe.ingredients || []).forEach(ing => {
      if (!ing.name) return;
      const key = normalizeIngredientName(ing.name);
      if (!groups.has(key)) groups.set(key, { displayName: ing.name.trim(), units: new Map() });
      const group = groups.get(key);
      const unitKey = (ing.unit || '').toLowerCase();
      const amount = ing.amount === '' || ing.amount === undefined ? null : Number(ing.amount);
      const existing = group.units.get(unitKey);
      if (existing === undefined) group.units.set(unitKey, amount);
      else if (existing !== null && amount !== null) group.units.set(unitKey, existing + amount);
      else group.units.set(unitKey, null);
    });
  });
  return groups;
}
function groupQuantityString(group) {
  const parts = [];
  for (const [unit, amount] of group.units.entries()) parts.push(amount === null ? (unit || '') : formatQuantity(amount, unit));
  return parts.filter(Boolean).join(' + ');
}

function generateShoppingListFromDates(dates) {
  const groups = mergeIngredientsForDates(dates);
  const existing = getShopping();
  const manualItems = existing.filter(i => i.source === 'manual');
  const prevGenerated = new Map(existing.filter(i => i.source === 'recipe').map(i => [normalizeIngredientName(i.ingredientName), i]));

  const generated = [];
  let skippedHave = 0, flaggedLow = 0;
  for (const [key, group] of groups.entries()) {
    const status = pantryStatus(group.displayName);
    if (status === 'have') { skippedHave++; continue; }
    if (status === 'low') flaggedLow++;
    const prev = prevGenerated.get(key);
    generated.push({
      ingredientName: group.displayName,
      quantity: groupQuantityString(group),
      unit: '',
      checked: prev ? prev.checked : false,
      source: 'recipe',
      pantryFlag: status === 'low' ? 'low' : (status === 'out' ? 'out' : null),
    });
  }
  setShopping([...manualItems, ...generated]);
  toast(`Generated ${generated.length} item${generated.length === 1 ? '' : 's'}. ${skippedHave} skipped (in stock), ${flaggedLow} low.`, 'success');
}

function renderShoppingTab() {
  const content = document.getElementById('shopping-content');
  const connected = isKrogerConnected();
  const settings = getSettings();
  content.innerHTML = `
    <div class="card">
      <div class="field-row" style="align-items:flex-end">
        <div class="field flex-1"><label>Add item</label><input type="text" id="manual-item-name" placeholder="e.g. paper towels"></div>
        <button class="btn btn-primary" id="manual-add-btn" style="margin-bottom:12px">Add</button>
      </div>
    </div>
    <div class="btn-row" style="margin-bottom:8px">
      <button class="btn btn-outline btn-sm" id="clear-checked-btn">Clear Checked</button>
      <button class="btn btn-outline btn-sm flex-1" id="estimate-cost-btn">Estimate Cost</button>
    </div>
    <div id="estimate-summary"></div>
    <button class="btn btn-primary btn-block" id="send-kroger-btn" style="margin-bottom:12px">Send to Kroger Cart</button>
    <div class="kroger-status ${connected ? 'connected' : 'disconnected'}">${connected ? '● Kroger account connected' : '○ Kroger not connected — set up in Settings.'}</div>
    <div id="shopping-list"></div>
  `;
  const listEl = content.querySelector('#shopping-list');
  const summaryEl = content.querySelector('#estimate-summary');

  function drawSummary(uncheckedForSummary) {
    if (!connected || !settings.krogerLocationId || !uncheckedForSummary.length) { summaryEl.innerHTML = ''; return; }
    const summary = computeEstimateSummary(uncheckedForSummary, settings.krogerLocationId);
    if (!summary) { summaryEl.innerHTML = ''; return; }
    summaryEl.innerHTML = `
      <div class="card" style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span class="text-dim text-small">Estimated total (${summary.pricedCount}/${summary.totalCount} priced)</span>
          <span style="font-size:20px;font-weight:700;color:var(--accent)">$${summary.total.toFixed(2)}</span>
        </div>
        <div class="text-dim text-small mt-8">Based on the top match per item — actual picks/prices confirmed when you send to cart.</div>
      </div>`;
  }

  function draw() {
    const current = getShopping();
    if (!current.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="big">🛒</div>List is empty.<br>Generate one from your weekly plan or add items manually.</div>`;
      summaryEl.innerHTML = '';
      return;
    }
    const unchecked = current.filter(i => !i.checked);
    const checked = current.filter(i => i.checked);
    const estimate = (connected && settings.krogerLocationId) ? computeEstimateSummary(unchecked, settings.krogerLocationId) : null;
    const row = item => {
      const price = estimate?.priceByName.get(normalizeIngredientName(item.ingredientName));
      return `
      <div class="shop-row ${item.checked ? 'checked' : ''}" data-idx="${current.indexOf(item)}">
        <div class="checkbox" data-toggle>${item.checked ? svgI('check', 13, '#0f1117') : ''}</div>
        <div class="item-qty">${escapeHtml(item.quantity || '')}</div>
        <div class="item-name">${escapeHtml(item.ingredientName)} ${item.pantryFlag === 'low' ? '<span class="badge badge-amber">low</span>' : ''}</div>
        ${price !== undefined ? `<span class="badge badge-green">$${price.toFixed(2)}</span>` : ''}
        <button class="remove-row-btn" data-remove>&times;</button>
      </div>`;
    };
    listEl.innerHTML = `
      ${unchecked.length ? `<div class="shop-group-title">To Get (${unchecked.length})</div><div class="card">${unchecked.map(row).join('')}</div>` : ''}
      ${checked.length ? `<div class="shop-group-title">Checked (${checked.length})</div><div class="card">${checked.map(row).join('')}</div>` : ''}
    `;
    listEl.querySelectorAll('.shop-row').forEach(rowEl => {
      const idx = Number(rowEl.dataset.idx);
      rowEl.querySelector('[data-toggle]').addEventListener('click', () => { const all = getShopping(); all[idx].checked = !all[idx].checked; setShopping(all); draw(); drawSummary(getShopping().filter(i => !i.checked)); });
      rowEl.querySelector('[data-remove]').addEventListener('click', () => { const all = getShopping(); all.splice(idx, 1); setShopping(all); draw(); drawSummary(getShopping().filter(i => !i.checked)); });
    });
    drawSummary(unchecked);
  }

  content.querySelector('#manual-add-btn').addEventListener('click', () => {
    const input = content.querySelector('#manual-item-name');
    const name = input.value.trim();
    if (!name) return;
    const all = getShopping(); all.push({ ingredientName: name, quantity: '', unit: '', checked: false, source: 'manual' }); setShopping(all);
    input.value = ''; draw();
  });
  content.querySelector('#manual-item-name').addEventListener('keydown', e => { if (e.key === 'Enter') content.querySelector('#manual-add-btn').click(); });
  content.querySelector('#clear-checked-btn').addEventListener('click', async () => {
    if (await confirmDialog('Remove all checked items?')) { setShopping(getShopping().filter(i => !i.checked)); draw(); }
  });
  content.querySelector('#estimate-cost-btn').addEventListener('click', estimateShoppingCost);
  content.querySelector('#send-kroger-btn').addEventListener('click', openKrogerReview);
  draw();
}

// ── KROGER (OAuth2 + PKCE, Product Compact API, Cart API) ──────────────────
// The client secret never touches this file — it lives only in
// netlify/functions/kroger-token.js. This module handles the public half of
// PKCE, token storage/refresh, and calls to Kroger's APIs via a thin proxy
// function (needed because Kroger's API sends no CORS headers for browsers).

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomString(len = 64) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return base64url(bytes).slice(0, len);
}
async function sha256(str) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)); }

async function getKrogerConfig() {
  const res = await fetch('/api/kroger-config');
  if (!res.ok) throw new Error('Kroger is not configured on the server (missing env vars).');
  return res.json();
}

async function startKrogerAuth() {
  const config = await getKrogerConfig();
  const verifier = randomString(64);
  const state = randomString(24);
  const challenge = base64url(await sha256(verifier));
  sessionStorage.setItem('kroger_pkce_verifier', verifier);
  sessionStorage.setItem('kroger_pkce_state', state);
  const redirectUri = config.redirectUri || `${location.origin}${location.pathname}`;
  const url = new URL('https://api.kroger.com/v1/connect/oauth2/authorize');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'cart.basic:write product.compact');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  location.href = url.toString();
}

async function handleKrogerOAuthRedirect(params) {
  if (params.has('error')) return { ok: false, error: params.get('error_description') || params.get('error') };
  const code = params.get('code'), state = params.get('state');
  const expectedState = sessionStorage.getItem('kroger_pkce_state');
  const verifier = sessionStorage.getItem('kroger_pkce_verifier');
  sessionStorage.removeItem('kroger_pkce_state');
  sessionStorage.removeItem('kroger_pkce_verifier');
  if (!code || !verifier || state !== expectedState) return { ok: false, error: 'Invalid OAuth state — please try connecting again.' };
  try {
    const config = await getKrogerConfig();
    const redirectUri = config.redirectUri || `${location.origin}${location.pathname}`;
    const res = await fetch('/api/kroger-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grantType: 'authorization_code', code, codeVerifier: verifier, redirectUri }) });
    if (!res.ok) { const body = await res.json().catch(() => ({})); return { ok: false, error: body.error || `Token exchange failed (${res.status})` }; }
    const tokens = await res.json();
    setKrogerTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + (tokens.expires_in - 30) * 1000, scope: tokens.scope });
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}

function isKrogerConnected() { return !!getKrogerTokens()?.refreshToken; }
function disconnectKroger() { clearKrogerTokens(); }

async function refreshKrogerUserToken() {
  const tokens = getKrogerTokens();
  if (!tokens?.refreshToken) return null;
  const res = await fetch('/api/kroger-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grantType: 'refresh_token', refreshToken: tokens.refreshToken }) });
  if (!res.ok) { clearKrogerTokens(); throw new Error('Kroger session expired — please reconnect your account in Settings.'); }
  const fresh = await res.json();
  const updated = { accessToken: fresh.access_token, refreshToken: fresh.refresh_token || tokens.refreshToken, expiresAt: Date.now() + (fresh.expires_in - 30) * 1000, scope: fresh.scope };
  setKrogerTokens(updated);
  return updated.accessToken;
}
async function getKrogerUserAccessToken() {
  const tokens = getKrogerTokens();
  if (!tokens) throw new Error('Kroger account not connected. Connect it in Settings first.');
  if (tokens.expiresAt > Date.now()) return tokens.accessToken;
  return refreshKrogerUserToken();
}
async function getKrogerAppAccessToken() {
  const cached = getKrogerAppToken();
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken;
  const res = await fetch('/api/kroger-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grantType: 'client_credentials' }) });
  if (!res.ok) throw new Error('Could not get a Kroger app token — check server-side Kroger credentials.');
  const tokens = await res.json();
  const record = { accessToken: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in - 30) * 1000 };
  setKrogerAppToken(record);
  return record.accessToken;
}
async function krogerProxy(token, method, path, query, body) {
  const res = await fetch('/api/kroger-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, method, path, query: query || {}, body }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Kroger request failed (${res.status})`);
  return data;
}
async function searchKrogerLocations(zipCode) {
  const token = await getKrogerAppAccessToken();
  const data = await krogerProxy(token, 'GET', '/v1/locations', { 'filter.zipCode.near': zipCode, 'filter.limit': 10 });
  return data.data || [];
}
async function searchKrogerProducts(term, locationId) {
  const token = await getKrogerAppAccessToken();
  const data = await krogerProxy(token, 'GET', '/v1/products', { 'filter.term': term, 'filter.locationId': locationId, 'filter.limit': 5 });
  return data.data || [];
}
async function addItemsToKrogerCart(items) {
  const token = await getKrogerUserAccessToken();
  // Kroger's cart/add returns 200/204 even when it silently drops an item
  // that isn't valid at your account's currently-active store (that store is
  // separate from whatever location we searched products under — Kroger's
  // API has no endpoint for us to set it). Log the raw response so it's at
  // least inspectable if something goes missing.
  const data = await krogerProxy(token, 'PUT', '/v1/cart/add', undefined, { items: items.map(i => ({ upc: i.upc, quantity: i.quantity || 1, modality: 'PICKUP' })) });
  console.log('Kroger cart/add response:', data);
  return true;
}

function productPriceValue(product) {
  const price = product.items?.[0]?.price;
  if (!price) return null;
  const amount = price.promo || price.regular;
  return amount ? Number(amount) : null;
}
function productPrice(product) {
  const amount = productPriceValue(product);
  return amount === null ? '' : `$${amount.toFixed(2)}`;
}

// Shared by the cost-estimate button and the Send-to-Cart review — both need
// the same "search Kroger for each unchecked item" step, so cache the result
// keyed by exactly which items + which store it covers, and skip re-querying
// Kroger a second time if nothing relevant changed in between.
let lastKrogerMatchCache = null;

function shoppingMatchKey(items, locationId) {
  return locationId + '|' + items.map(i => normalizeIngredientName(i.ingredientName)).sort().join(',');
}

async function matchShoppingItemsToKrogerProducts(items, locationId, { useCache = true } = {}) {
  const key = shoppingMatchKey(items, locationId);
  if (useCache && lastKrogerMatchCache && lastKrogerMatchCache.key === key) return lastKrogerMatchCache.results;
  const results = await Promise.all(items.map(async item => {
    try { return { item, matches: await searchKrogerProducts(cleanIngredientSearchTerm(item.ingredientName), locationId), error: null }; }
    catch (err) { return { item, matches: [], error: err.message }; }
  }));
  lastKrogerMatchCache = { key, results };
  return results;
}

async function estimateShoppingCost() {
  if (!isKrogerConnected()) { toast('Connect your Kroger account in Settings first.', 'error'); return; }
  const settings = getSettings();
  if (!settings.krogerLocationId) { toast('Pick a Kroger store in Settings first.', 'error'); return; }
  const items = getShopping().filter(i => !i.checked);
  if (!items.length) { toast('Nothing to estimate — everything is checked off.', 'error'); return; }

  const btn = document.getElementById('estimate-cost-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Estimating...'; }
  try {
    await matchShoppingItemsToKrogerProducts(items, settings.krogerLocationId, { useCache: false });
    renderShoppingTab();
  } catch (err) {
    toast(err.message || 'Price lookup failed.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Estimate Cost'; }
  }
}

function computeEstimateSummary(items, locationId) {
  const key = shoppingMatchKey(items, locationId);
  if (!lastKrogerMatchCache || lastKrogerMatchCache.key !== key) return null;
  let total = 0, pricedCount = 0;
  const priceByName = new Map();
  lastKrogerMatchCache.results.forEach(r => {
    const price = r.matches[0] ? productPriceValue(r.matches[0]) : null;
    if (price !== null) { total += price; pricedCount++; priceByName.set(normalizeIngredientName(r.item.ingredientName), price); }
  });
  return { total, pricedCount, totalCount: items.length, priceByName };
}

async function openKrogerReview() {
  if (!isKrogerConnected()) { toast('Connect your Kroger account in Settings first.', 'error'); return; }
  const settings = getSettings();
  if (!settings.krogerLocationId) { toast('Pick a Kroger store in Settings first.', 'error'); return; }
  const items = getShopping().filter(i => !i.checked);
  if (!items.length) { toast('Nothing to send — everything is checked off.', 'error'); return; }

  const closeLoading = openModal(`<h3>Matching items...</h3><div style="text-align:center;padding:20px"><span class="spinner"></span></div>`);
  let results;
  try {
    results = await matchShoppingItemsToKrogerProducts(items, settings.krogerLocationId);
  } catch (err) { closeLoading(); toast(err.message || 'Product search failed.', 'error'); return; }
  closeLoading();

  const selections = new Map();
  results.forEach(r => selections.set(r.item.ingredientName, r.matches[0]?.upc || null));
  const bodyHtml = results.map(r => `
    <div class="card" data-item="${escapeHtml(r.item.ingredientName)}">
      <div style="font-weight:700;margin-bottom:6px">${escapeHtml(r.item.ingredientName)} <span class="text-dim text-small">${escapeHtml(r.item.quantity || '')}</span></div>
      ${r.error ? `<div class="text-small" style="color:var(--red)">${escapeHtml(r.error)}</div>` : ''}
      ${!r.error && !r.matches.length ? '<div class="text-dim text-small">No matches found — will be skipped.</div>' : ''}
      ${r.matches.map((p, i) => `
        <div class="match-option ${i === 0 ? 'selected' : ''}" data-upc="${escapeHtml(p.upc)}">
          <img src="${escapeHtml(p.images?.[0]?.sizes?.find(s => s.size === 'small')?.url || p.images?.[0]?.sizes?.[0]?.url || '')}" onerror="this.style.visibility='hidden'">
          <div class="info"><div class="desc">${escapeHtml(p.description || '')}</div><div class="price">${escapeHtml(productPrice(p))}</div></div>
        </div>`).join('')}
      ${r.matches.length ? '<button class="btn btn-ghost btn-sm mt-8" data-skip>Skip this item</button>' : ''}
    </div>`).join('');

  openModal(`
    <h3>Confirm Kroger Matches</h3>
    <p class="text-dim text-small" style="margin-bottom:10px">Items get added to whatever store is currently active on your Kroger account — if something doesn't show up in your cart, check that it matches the store selected in Settings (<strong>${escapeHtml(settings.krogerLocationLabel || settings.krogerLocationId)}</strong>).</p>
    <div style="max-height:60vh;overflow-y:auto">${bodyHtml}</div>
    <div class="btn-row mt-8"><button class="btn btn-outline flex-1" data-a="cancel">Cancel</button><button class="btn btn-primary flex-1" data-a="confirm">Add to Cart</button></div>
  `, {
    onMount(modal, close) {
      modal.querySelectorAll('[data-item]').forEach(card => {
        const name = card.dataset.item;
        card.querySelectorAll('.match-option').forEach(opt => opt.addEventListener('click', () => {
          card.querySelectorAll('.match-option').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected'); selections.set(name, opt.dataset.upc);
        }));
        card.querySelector('[data-skip]')?.addEventListener('click', () => { card.querySelectorAll('.match-option').forEach(o => o.classList.remove('selected')); selections.set(name, null); });
      });
      modal.querySelector('[data-a=cancel]').addEventListener('click', close);
      modal.querySelector('[data-a=confirm]').addEventListener('click', async () => {
        const toAdd = Array.from(selections.values()).filter(Boolean).map(upc => ({ upc, quantity: 1 }));
        if (!toAdd.length) { toast('No items selected.', 'error'); return; }
        try {
          await addItemsToKrogerCart(toAdd);
          toast(`Sent ${toAdd.length} item${toAdd.length === 1 ? '' : 's'} to Kroger — double check your cart, since Kroger fulfills to whichever store is active on your account.`, 'success');
          close();
        } catch (err) { toast(err.message || 'Failed to add to cart.', 'error'); }
      });
    },
  });
}

// ── SETTINGS ────────────────────────────────────────────────────────────────
function renderSettingsTab() {
  const content = document.getElementById('settings-content');
  const settings = getSettings();
  const connected = isKrogerConnected();

  content.innerHTML = `
    <div class="card">
      <h2>Meal Slots</h2>
      <p class="text-dim text-small" style="margin-bottom:10px">Comma separated, in order shown on the weekly plan.</p>
      <div class="field"><input type="text" id="meal-slots-input" value="${escapeHtml(settings.mealSlots.join(', '))}"></div>
      <button class="btn btn-outline btn-sm" id="save-slots-btn">Save</button>
    </div>

    <div class="card">
      <h2>Kroger Integration</h2>
      <div class="kroger-status ${connected ? 'connected' : 'disconnected'}">${connected ? '● Connected' : '○ Not connected'}</div>
      ${connected ? '<button class="btn btn-danger btn-sm" id="kroger-disconnect-btn">Disconnect</button>' : '<button class="btn btn-primary btn-sm" id="kroger-connect-btn">Connect Kroger Account</button>'}
      <div class="field mt-8">
        <label>Store (search by ZIP)</label>
        <div class="field-row"><input type="text" id="zip-input" placeholder="ZIP code" style="flex:1"><button class="btn btn-outline btn-sm" id="zip-search-btn">Search</button></div>
      </div>
      <div id="location-results"></div>
      <div id="current-location" class="text-small mt-8">${settings.krogerLocationLabel ? `Selected store: <strong>${escapeHtml(settings.krogerLocationLabel)}</strong>` : '<span class="text-dim">No store selected.</span>'}</div>
      <p class="text-dim text-small mt-8">This store is only used to look up products/prices. Kroger actually adds cart items to whichever store is currently active on your Kroger account — make sure that matches, in the Kroger app or kroger.com, or items may not show up after "Send to Kroger Cart."</p>
    </div>

    <div class="card">
      <h2>Backup</h2>
      <p class="text-dim text-small" style="margin-bottom:10px">All data lives in this browser's local storage. Export a backup occasionally, or move data to another device.</p>
      <div class="btn-row">
        <button class="btn btn-outline btn-sm" id="export-btn">Export JSON</button>
        <label class="btn btn-outline btn-sm" style="cursor:pointer">Import JSON<input type="file" id="import-input" accept="application/json" style="display:none"></label>
      </div>
    </div>

    <div class="card">
      <h2>Danger Zone</h2>
      <button class="btn btn-danger btn-sm" id="wipe-btn">Erase All Data</button>
    </div>
  `;

  content.querySelector('#save-slots-btn').addEventListener('click', () => {
    const slots = content.querySelector('#meal-slots-input').value.split(',').map(s => s.trim()).filter(Boolean);
    if (!slots.length) { toast('Enter at least one meal slot.', 'error'); return; }
    setSettings({ ...getSettings(), mealSlots: slots });
    toast('Saved.', 'success');
  });

  if (connected) {
    content.querySelector('#kroger-disconnect-btn').addEventListener('click', async () => {
      if (await confirmDialog('Disconnect your Kroger account? You can reconnect anytime.')) { disconnectKroger(); toast('Disconnected.'); renderSettingsTab(); }
    });
  } else {
    content.querySelector('#kroger-connect-btn').addEventListener('click', async () => {
      try { await startKrogerAuth(); } catch (err) { toast(err.message || 'Could not start Kroger connection.', 'error'); }
    });
  }

  content.querySelector('#zip-search-btn').addEventListener('click', async () => {
    const zip = content.querySelector('#zip-input').value.trim();
    if (!zip) return;
    const resultsEl = content.querySelector('#location-results');
    resultsEl.innerHTML = `<div class="text-dim text-small mt-8"><span class="spinner"></span> Searching...</div>`;
    try {
      const locations = await searchKrogerLocations(zip);
      if (!locations.length) { resultsEl.innerHTML = '<p class="text-dim text-small mt-8">No stores found near that ZIP.</p>'; return; }
      resultsEl.innerHTML = `<div class="card mt-8">${locations.map(loc => `
        <div class="pantry-row" data-id="${escapeHtml(loc.locationId)}" data-label="${escapeHtml(`${loc.chain || ''} ${loc.address?.addressLine1 || ''}`)}" style="cursor:pointer">
          <div class="name">${escapeHtml(loc.chain || loc.name || 'Kroger')}<br><span class="text-dim text-small">${escapeHtml(loc.address?.addressLine1 || '')}, ${escapeHtml(loc.address?.city || '')}</span></div>
        </div>`).join('')}</div>`;
      resultsEl.querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', () => {
        setSettings({ ...getSettings(), krogerLocationId: el.dataset.id, krogerLocationLabel: el.dataset.label });
        toast('Store selected.', 'success');
        renderSettingsTab();
      }));
    } catch (err) { resultsEl.innerHTML = `<p class="text-small mt-8" style="color:var(--red)">${escapeHtml(err.message || 'Search failed.')}</p>`; }
  });

  content.querySelector('#export-btn').addEventListener('click', () => {
    const data = { recipes: getRecipes(), pantry: getPantry(), mealPlan: getMealPlan(), shoppingList: getShopping(), settings: getSettings(), exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `mealplanner-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  });

  content.querySelector('#import-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!(await confirmDialog('Import will overwrite all current data. Continue?'))) { e.target.value = ''; return; }
    try {
      const data = JSON.parse(await file.text());
      if (data.recipes) setRecipes(data.recipes);
      if (data.pantry) setPantry(data.pantry);
      if (data.mealPlan) setMealPlan(data.mealPlan);
      if (data.shoppingList) setShopping(data.shoppingList);
      if (data.settings) setSettings(data.settings);
      toast('Import complete.', 'success');
      renderSettingsTab();
    } catch { toast('Import failed: invalid file.', 'error'); }
  });

  content.querySelector('#wipe-btn').addEventListener('click', async () => {
    if (await confirmDialog('Erase ALL local data (recipes, pantry, plan, shopping list, Kroger connection)? This cannot be undone.')) {
      ['mealplanner_recipes', 'mealplanner_pantry', 'mealplanner_mealplan', 'mealplanner_shopping', 'mealplanner_settings', 'mealplanner_kroger_tokens', 'mealplanner_kroger_app_token']
        .forEach(k => localStorage.removeItem(k));
      toast('All data erased.');
      renderSettingsTab();
    }
  });
}

// ── Theme ───────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('mealplanner_theme', theme);
  document.querySelectorAll('.theme-toggle').forEach(btn => { btn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark'; });
}
function toggleTheme() { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); }

// ── Init ────────────────────────────────────────────────────────────────────
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('install-btn').style.display = '';
});

async function checkKrogerOAuthRedirect() {
  const params = new URLSearchParams(location.search);
  if (!params.has('code') && !params.has('error')) return;
  const result = await handleKrogerOAuthRedirect(params);
  history.replaceState({}, '', location.pathname);
  toast(result.ok ? 'Kroger account connected.' : `Kroger connect failed: ${result.error}`, result.ok ? 'success' : 'error');
  showTab('settings');
}

document.addEventListener('DOMContentLoaded', async () => {
  applyTheme(localStorage.getItem('mealplanner_theme') || 'dark');

  document.querySelectorAll('#sidebar .nav-item[data-tab], #bottom-nav .nav-item[data-tab]').forEach(el => {
    el.addEventListener('click', () => showTab(el.dataset.tab));
  });
  document.getElementById('menu-btn').addEventListener('click', openMenu);
  document.querySelectorAll('.menu-item[data-tab]').forEach(el => el.addEventListener('click', () => showTab(el.dataset.tab)));
  document.getElementById('sidebar-theme-btn').addEventListener('click', toggleTheme);
  document.getElementById('install-btn').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById('install-btn').style.display = 'none';
  });

  await checkKrogerOAuthRedirect();
  showTab('plan');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(err => console.warn('sw register failed', err)));
  }
});
