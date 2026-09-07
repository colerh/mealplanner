import { db } from '../db.js';
import { escapeHtml, toast, openModal, confirmDialog } from '../utils.js';
import { navigate } from '../router.js';
import { importRecipeFromUrl } from '../lib/recipeParser.js';

const DRAFT_KEY = 'mealplanner.importDraft';

function allTags(recipes) {
  const set = new Set();
  recipes.forEach((r) => (r.tags || []).forEach((t) => set.add(t)));
  return Array.from(set).sort();
}

function recipeMatches(recipe, query, activeTag) {
  if (activeTag && !(recipe.tags || []).includes(activeTag)) return false;
  if (!query) return true;
  const haystack = [recipe.title, ...(recipe.tags || []), ...(recipe.ingredients || []).map((i) => i.name)]
    .join(' ').toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function renderRecipeList(params, root) {
  const recipes = db.getRecipes();
  const tags = allTags(recipes);
  let state = { query: '', tag: '' };

  root.innerHTML = `
    <div class="section-title">
      <h2>Recipe Library</h2>
      <span class="text-dim text-small">${recipes.length}</span>
    </div>
    <div class="search-bar">
      <input type="search" id="search-input" placeholder="Search recipes or ingredients..." />
    </div>
    ${tags.length ? `<div class="btn-row mt-8" id="tag-filters" style="margin-bottom:12px;">
      ${tags.map((t) => `<button class="btn small tag-filter" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}
    </div>` : ''}
    <div id="recipe-results"></div>
    <button class="fab" id="add-recipe-fab" aria-label="Add recipe">+</button>
  `;

  const resultsEl = root.querySelector('#recipe-results');

  function renderResults() {
    const filtered = recipes.filter((r) => recipeMatches(r, state.query, state.tag));
    if (!filtered.length) {
      resultsEl.innerHTML = `<div class="empty-state"><div class="big">🍳</div>No recipes yet.<br>Tap + to import one or add manually.</div>`;
      return;
    }
    resultsEl.innerHTML = filtered.map((r) => `
      <div class="card recipe-card" data-id="${r.id}">
        <div class="title">${escapeHtml(r.title)}</div>
        <div class="meta">${r.servings ? `${escapeHtml(String(r.servings))} servings · ` : ''}${(r.ingredients || []).length} ingredients</div>
        ${(r.tags || []).length ? `<div class="tags">${r.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      </div>
    `).join('');
    resultsEl.querySelectorAll('.recipe-card').forEach((card) => {
      card.addEventListener('click', () => navigate(`/recipes/${card.dataset.id}`));
    });
  }

  root.querySelector('#search-input').addEventListener('input', (e) => {
    state.query = e.target.value;
    renderResults();
  });
  root.querySelectorAll('.tag-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tag = state.tag === btn.dataset.tag ? '' : btn.dataset.tag;
      root.querySelectorAll('.tag-filter').forEach((b) => b.classList.toggle('primary', b.dataset.tag === state.tag));
      renderResults();
    });
  });
  root.querySelector('#add-recipe-fab').addEventListener('click', showAddChoiceModal);

  renderResults();
}

function showAddChoiceModal() {
  openModal(`
    <div class="modal-header"><h3>Add Recipe</h3></div>
    <div class="btn-row" style="flex-direction:column;">
      <button class="btn primary" data-a="url" style="width:100%;">Import from URL</button>
      <button class="btn" data-a="manual" style="width:100%;">Add Manually</button>
    </div>
  `, {
    onMount(sheet, close) {
      sheet.querySelector('[data-a=url]').addEventListener('click', () => { close(); navigate('/recipes/import'); });
      sheet.querySelector('[data-a=manual]').addEventListener('click', () => { close(); navigate('/recipes/new'); });
    },
  });
}

export function renderRecipeImport(params, root) {
  root.innerHTML = `
    <div class="section-title"><h2>Import Recipe</h2></div>
    <div class="card">
      <div class="field">
        <label>Recipe URL</label>
        <input type="url" id="import-url" placeholder="https://example.com/recipe" />
      </div>
      <div class="btn-row">
        <button class="btn ghost" id="cancel-btn">Cancel</button>
        <button class="btn primary flex-1" id="import-btn">Import</button>
      </div>
      <div id="import-status" class="text-dim text-small mt-8"></div>
    </div>
    <p class="text-dim text-small">Parses embedded recipe data (JSON-LD) when the site provides it. Falls back to an LLM parse of the page text otherwise. You'll review and edit before saving.</p>
  `;

  root.querySelector('#cancel-btn').addEventListener('click', () => navigate('/recipes'));

  root.querySelector('#import-btn').addEventListener('click', async () => {
    const url = root.querySelector('#import-url').value.trim();
    if (!url) { toast('Enter a URL first.', 'error'); return; }
    const statusEl = root.querySelector('#import-status');
    const btn = root.querySelector('#import-btn');
    btn.disabled = true;
    statusEl.innerHTML = '<span class="spinner"></span> Fetching page...';
    try {
      const { recipe, method } = await importRecipeFromUrl(url);
      statusEl.textContent = `Parsed via ${method === 'json-ld' ? 'structured recipe data' : 'AI fallback'}. Review below.`;
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(recipe));
      navigate('/recipes/new');
    } catch (err) {
      console.error(err);
      statusEl.textContent = '';
      toast(err.message || 'Import failed.', 'error');
      btn.disabled = false;
    }
  });
}

function ingredientRowHtml(ing = { amount: '', unit: '', name: '' }, idx) {
  return `
    <div class="ingredient-row" data-idx="${idx}">
      <input type="text" class="ing-amount" placeholder="Amt" value="${escapeHtml(ing.amount ?? '')}" />
      <input type="text" class="ing-unit" placeholder="Unit" value="${escapeHtml(ing.unit ?? '')}" />
      <input type="text" class="ing-name" placeholder="Ingredient" value="${escapeHtml(ing.name ?? '')}" />
      <button type="button" class="remove-row-btn" data-remove-ing>&times;</button>
    </div>
  `;
}

function instructionRowHtml(step = '', idx) {
  return `
    <div class="instruction-row" data-idx="${idx}">
      <div class="step-num">${idx + 1}.</div>
      <textarea class="instruction-text" placeholder="Step ${idx + 1}...">${escapeHtml(step)}</textarea>
      <button type="button" class="remove-row-btn" data-remove-step>&times;</button>
    </div>
  `;
}

export function renderRecipeForm(params, root) {
  const editing = !!params.id;
  let recipe = editing ? db.getRecipe(params.id) : null;

  if (!editing) {
    const draftRaw = sessionStorage.getItem(DRAFT_KEY);
    if (draftRaw) {
      try { recipe = JSON.parse(draftRaw); } catch { recipe = null; }
      sessionStorage.removeItem(DRAFT_KEY);
    }
  }
  if (editing && !recipe) {
    root.innerHTML = `<div class="empty-state">Recipe not found.</div>`;
    return;
  }
  recipe = recipe || { title: '', sourceUrl: '', servings: '', ingredients: [{ amount: '', unit: '', name: '' }], instructions: [''], tags: [] };
  if (!recipe.ingredients || !recipe.ingredients.length) recipe.ingredients = [{ amount: '', unit: '', name: '' }];
  if (!recipe.instructions || !recipe.instructions.length) recipe.instructions = [''];

  root.innerHTML = `
    <div class="section-title"><h2>${editing ? 'Edit' : 'New'} Recipe</h2></div>
    <div class="card">
      <div class="field">
        <label>Title</label>
        <input type="text" id="f-title" value="${escapeHtml(recipe.title)}" placeholder="Recipe name" />
      </div>
      <div class="field-row">
        <div class="field">
          <label>Servings</label>
          <input type="text" id="f-servings" value="${escapeHtml(recipe.servings ?? '')}" placeholder="4" />
        </div>
        <div class="field">
          <label>Source URL</label>
          <input type="url" id="f-source" value="${escapeHtml(recipe.sourceUrl ?? '')}" placeholder="optional" />
        </div>
      </div>
      <div class="field">
        <label>Tags (comma separated)</label>
        <input type="text" id="f-tags" value="${escapeHtml((recipe.tags || []).join(', '))}" placeholder="weeknight, pasta, freezer-friendly" />
      </div>
    </div>

    <div class="card">
      <div class="section-title mb-0"><h2>Ingredients</h2><button type="button" class="btn small" id="add-ing">+ Add</button></div>
      <div id="ingredient-rows">${recipe.ingredients.map(ingredientRowHtml).join('')}</div>
    </div>

    <div class="card">
      <div class="section-title mb-0"><h2>Instructions</h2><button type="button" class="btn small" id="add-step">+ Add</button></div>
      <div id="instruction-rows">${recipe.instructions.map(instructionRowHtml).join('')}</div>
    </div>

    <div class="btn-row">
      <button class="btn ghost" id="cancel-btn">Cancel</button>
      <button class="btn primary flex-1" id="save-btn">Save Recipe</button>
      ${editing ? '<button class="btn danger" id="delete-btn">Delete</button>' : ''}
    </div>
  `;

  const ingRows = root.querySelector('#ingredient-rows');
  const stepRows = root.querySelector('#instruction-rows');

  function reindexIngredients() {
    ingRows.querySelectorAll('.ingredient-row').forEach((row, i) => (row.dataset.idx = i));
  }
  function reindexSteps() {
    stepRows.querySelectorAll('.instruction-row').forEach((row, i) => {
      row.dataset.idx = i;
      row.querySelector('.step-num').textContent = `${i + 1}.`;
      row.querySelector('textarea').placeholder = `Step ${i + 1}...`;
    });
  }

  root.querySelector('#add-ing').addEventListener('click', () => {
    ingRows.insertAdjacentHTML('beforeend', ingredientRowHtml(undefined, ingRows.children.length));
  });
  root.querySelector('#add-step').addEventListener('click', () => {
    stepRows.insertAdjacentHTML('beforeend', instructionRowHtml('', stepRows.children.length));
  });
  ingRows.addEventListener('click', (e) => {
    if (e.target.matches('[data-remove-ing]')) {
      e.target.closest('.ingredient-row').remove();
      reindexIngredients();
    }
  });
  stepRows.addEventListener('click', (e) => {
    if (e.target.matches('[data-remove-step]')) {
      e.target.closest('.instruction-row').remove();
      reindexSteps();
    }
  });

  root.querySelector('#cancel-btn').addEventListener('click', () => navigate(editing ? `/recipes/${recipe.id}` : '/recipes'));

  if (editing) {
    root.querySelector('#delete-btn').addEventListener('click', async () => {
      if (await confirmDialog(`Delete "${recipe.title}"? This also removes it from any planned meals.`)) {
        db.deleteRecipe(recipe.id);
        toast('Recipe deleted.');
        navigate('/recipes');
      }
    });
  }

  root.querySelector('#save-btn').addEventListener('click', () => {
    const title = root.querySelector('#f-title').value.trim();
    if (!title) { toast('Title is required.', 'error'); return; }

    const ingredients = Array.from(ingRows.querySelectorAll('.ingredient-row')).map((row) => ({
      amount: row.querySelector('.ing-amount').value.trim(),
      unit: row.querySelector('.ing-unit').value.trim(),
      name: row.querySelector('.ing-name').value.trim(),
    })).filter((i) => i.name);

    const instructions = Array.from(stepRows.querySelectorAll('.instruction-text'))
      .map((ta) => ta.value.trim()).filter(Boolean);

    const tags = root.querySelector('#f-tags').value.split(',').map((t) => t.trim()).filter(Boolean);

    const saved = {
      id: recipe.id || db.uuid(),
      title,
      sourceUrl: root.querySelector('#f-source').value.trim(),
      servings: root.querySelector('#f-servings').value.trim(),
      ingredients,
      instructions,
      tags,
    };
    db.saveRecipe(saved);
    toast('Recipe saved.', 'success');
    navigate(`/recipes/${saved.id}`);
  });
}

export function renderRecipeDetail(params, root) {
  const recipe = db.getRecipe(params.id);
  if (!recipe) {
    root.innerHTML = `<div class="empty-state">Recipe not found.</div>`;
    return;
  }
  root.innerHTML = `
    <div class="section-title">
      <h2>${escapeHtml(recipe.title)}</h2>
      <div class="btn-row">
        <button class="btn small" id="edit-btn">Edit</button>
      </div>
    </div>
    <div class="meta text-dim text-small mb-0" style="margin-bottom:12px;">
      ${recipe.servings ? `${escapeHtml(String(recipe.servings))} servings` : ''}
      ${recipe.sourceUrl ? ` · <a href="${escapeHtml(recipe.sourceUrl)}" target="_blank" rel="noopener">source</a>` : ''}
    </div>
    ${(recipe.tags || []).length ? `<div class="tags mt-8" style="margin-bottom:14px;">${recipe.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}

    <div class="card">
      <h3>Ingredients</h3>
      <ul style="margin:0;padding-left:18px;">
        ${(recipe.ingredients || []).map((i) => `<li>${[i.amount, i.unit, i.name].filter(Boolean).map(escapeHtml).join(' ')}</li>`).join('') || '<li class="text-dim">None listed</li>'}
      </ul>
    </div>

    <div class="card">
      <h3>Instructions</h3>
      <ol style="margin:0;padding-left:18px;">
        ${(recipe.instructions || []).map((s) => `<li style="margin-bottom:8px;">${escapeHtml(s)}</li>`).join('') || '<li class="text-dim">None listed</li>'}
      </ol>
    </div>
  `;
  root.querySelector('#edit-btn').addEventListener('click', () => navigate(`/recipes/${recipe.id}/edit`));
}
