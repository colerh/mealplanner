// localStorage-backed data access. Every collection is a flat JSON array
// keyed under a single namespaced key; reads/writes are synchronous since
// localStorage itself is synchronous and datasets here are small (personal use).

const NS = 'mealplanner';
const KEYS = {
  recipes: `${NS}.recipes`,
  pantry: `${NS}.pantry`,
  mealPlan: `${NS}.mealPlan`,
  shoppingList: `${NS}.shoppingList`,
  settings: `${NS}.settings`,
  krogerTokens: `${NS}.kroger.tokens`,
  krogerAppToken: `${NS}.kroger.appToken`,
};

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`db: failed to read ${key}`, err);
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const DEFAULT_SETTINGS = {
  mealSlots: ['breakfast', 'lunch', 'dinner'],
  weekStartsOn: 1, // Monday
  krogerLocationId: null,
  krogerLocationLabel: null,
};

export const db = {
  KEYS,
  uuid,

  // ---- generic collection helpers ----
  getAll(key) {
    return read(key, []);
  },
  saveAll(key, items) {
    write(key, items);
  },

  // ---- recipes ----
  getRecipes() {
    return read(KEYS.recipes, []);
  },
  getRecipe(id) {
    return this.getRecipes().find((r) => r.id === id) || null;
  },
  saveRecipe(recipe) {
    const all = this.getRecipes();
    const idx = all.findIndex((r) => r.id === recipe.id);
    if (idx >= 0) all[idx] = recipe;
    else all.unshift(recipe);
    write(KEYS.recipes, all);
    return recipe;
  },
  deleteRecipe(id) {
    write(KEYS.recipes, this.getRecipes().filter((r) => r.id !== id));
    write(KEYS.mealPlan, this.getMealPlan().filter((e) => e.recipeId !== id));
  },

  // ---- pantry ----
  getPantry() {
    return read(KEYS.pantry, []);
  },
  savePantryItem(item) {
    const all = this.getPantry();
    const idx = all.findIndex((p) => p.ingredientName.toLowerCase() === item.ingredientName.toLowerCase());
    if (idx >= 0) all[idx] = item;
    else all.push(item);
    write(KEYS.pantry, all);
    return item;
  },
  deletePantryItem(ingredientName) {
    write(KEYS.pantry, this.getPantry().filter((p) => p.ingredientName !== ingredientName));
  },
  restockAll() {
    const all = this.getPantry().map((p) => ({ ...p, status: 'have', lastUpdated: new Date().toISOString() }));
    write(KEYS.pantry, all);
  },
  findPantryStatus(ingredientName) {
    const item = this.getPantry().find((p) => p.ingredientName.toLowerCase() === ingredientName.toLowerCase());
    return item ? item.status : null;
  },

  // ---- meal plan ----
  getMealPlan() {
    return read(KEYS.mealPlan, []);
  },
  setMealPlanEntry(date, mealSlot, recipeId) {
    const all = this.getMealPlan().filter((e) => !(e.date === date && e.mealSlot === mealSlot));
    if (recipeId) all.push({ date, mealSlot, recipeId });
    write(KEYS.mealPlan, all);
  },
  clearMealPlanRange(dates) {
    const set = new Set(dates);
    write(KEYS.mealPlan, this.getMealPlan().filter((e) => !set.has(e.date)));
  },

  // ---- shopping list ----
  getShoppingList() {
    return read(KEYS.shoppingList, []);
  },
  saveShoppingList(items) {
    write(KEYS.shoppingList, items);
  },
  addShoppingItem(item) {
    const all = this.getShoppingList();
    all.push(item);
    write(KEYS.shoppingList, all);
  },
  clearCheckedShoppingItems() {
    write(KEYS.shoppingList, this.getShoppingList().filter((i) => !i.checked));
  },

  // ---- settings ----
  getSettings() {
    return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) };
  },
  saveSettings(patch) {
    const merged = { ...this.getSettings(), ...patch };
    write(KEYS.settings, merged);
    return merged;
  },

  // ---- kroger tokens (user OAuth, for cart access) ----
  getKrogerTokens() {
    return read(KEYS.krogerTokens, null);
  },
  saveKrogerTokens(tokens) {
    write(KEYS.krogerTokens, tokens);
  },
  clearKrogerTokens() {
    localStorage.removeItem(KEYS.krogerTokens);
  },

  // ---- kroger app token (client_credentials, for product/location search) ----
  getKrogerAppToken() {
    return read(KEYS.krogerAppToken, null);
  },
  saveKrogerAppToken(tokens) {
    write(KEYS.krogerAppToken, tokens);
  },
};
