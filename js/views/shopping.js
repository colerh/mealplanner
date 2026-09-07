import { db } from '../db.js';
import { escapeHtml, toast, normalizeIngredientName, formatQuantity, confirmDialog, openModal } from '../utils.js';
import { isConnected, searchProducts, addItemsToCart } from '../kroger.js';

function mergeIngredients(entries, recipesById) {
  // key: normalized name -> { name, units: { unitKey: totalAmount|null } }
  const groups = new Map();
  for (const entry of entries) {
    const recipe = recipesById[entry.recipeId];
    if (!recipe) continue;
    for (const ing of recipe.ingredients || []) {
      if (!ing.name) continue;
      const key = normalizeIngredientName(ing.name);
      if (!groups.has(key)) groups.set(key, { displayName: ing.name.trim(), units: new Map() });
      const group = groups.get(key);
      const unitKey = (ing.unit || '').toLowerCase();
      const amount = ing.amount === '' || ing.amount === undefined ? null : Number(ing.amount);
      const existing = group.units.get(unitKey);
      if (existing === undefined) {
        group.units.set(unitKey, amount);
      } else if (existing !== null && amount !== null) {
        group.units.set(unitKey, existing + amount);
      } else {
        group.units.set(unitKey, null); // can't combine cleanly, drop to unquantified
      }
    }
  }
  return groups;
}

function groupsToQuantityString(group) {
  const parts = [];
  for (const [unit, amount] of group.units.entries()) {
    if (amount === null) parts.push(unit || '');
    else parts.push(formatQuantity(amount, unit));
  }
  return parts.filter(Boolean).join(' + ');
}

function generateFromDates(dates) {
  const mealPlan = db.getMealPlan().filter((e) => dates.includes(e.date));
  const recipesById = Object.fromEntries(db.getRecipes().map((r) => [r.id, r]));
  const groups = mergeIngredients(mealPlan, recipesById);
  const pantry = db.getPantry();
  const pantryStatus = (name) => {
    const item = pantry.find((p) => p.ingredientName.toLowerCase() === name.toLowerCase());
    return item ? item.status : null;
  };

  const existing = db.getShoppingList();
  const manualItems = existing.filter((i) => i.source === 'manual');
  const prevGenerated = new Map(
    existing.filter((i) => i.source === 'recipe').map((i) => [normalizeIngredientName(i.ingredientName), i])
  );

  const generated = [];
  let skippedHave = 0;
  let flaggedLow = 0;
  for (const [key, group] of groups.entries()) {
    const status = pantryStatus(group.displayName);
    if (status === 'have') { skippedHave++; continue; }
    if (status === 'low') flaggedLow++;
    const prev = prevGenerated.get(key);
    generated.push({
      ingredientName: group.displayName,
      quantity: groupsToQuantityString(group),
      unit: '',
      checked: prev ? prev.checked : false,
      source: 'recipe',
      pantryFlag: status === 'low' ? 'low' : (status === 'out' ? 'out' : null),
    });
  }

  db.saveShoppingList([...manualItems, ...generated]);
  return { count: generated.length, skippedHave, flaggedLow };
}

export function renderShopping(params, root, query) {
  if (query.generate === '1') {
    const raw = sessionStorage.getItem('mealplanner.shoppingWeek');
    if (raw) {
      const dates = JSON.parse(raw);
      const { count, skippedHave, flaggedLow } = generateFromDates(dates);
      sessionStorage.removeItem('mealplanner.shoppingWeek');
      history.replaceState({}, '', location.pathname + '#/shopping');
      toast(`Generated ${count} item${count === 1 ? '' : 's'}. ${skippedHave} skipped (in stock), ${flaggedLow} low.`, 'success');
    }
  }

  draw(root);
}

function draw(root) {
  const items = db.getShoppingList();
  const connected = isConnected();

  root.innerHTML = `
    <div class="section-title"><h2>Shopping List</h2></div>
    <div class="card">
      <div class="field-row" style="align-items:flex-end;">
        <div class="field flex-1">
          <label>Add item</label>
          <input type="text" id="manual-name" placeholder="e.g. paper towels" />
        </div>
        <button class="btn primary" id="manual-add-btn" style="margin-bottom:12px;">Add</button>
      </div>
    </div>

    <div class="btn-row" style="margin-bottom:12px;">
      <button class="btn small" id="clear-checked-btn">Clear Checked</button>
      <button class="btn small primary flex-1" id="send-kroger-btn">Send to Kroger Cart</button>
    </div>
    <div class="kroger-status ${connected ? 'connected' : 'disconnected'}">
      ${connected ? '● Kroger account connected' : '○ Kroger not connected — set up in Settings to enable cart send.'}
    </div>

    <div id="list-container"></div>
  `;

  const listContainer = root.querySelector('#list-container');

  function renderList() {
    const current = db.getShoppingList();
    if (!current.length) {
      listContainer.innerHTML = `<div class="empty-state"><div class="big">🛒</div>List is empty.<br>Generate one from your weekly plan or add items manually.</div>`;
      return;
    }
    const unchecked = current.filter((i) => !i.checked);
    const checked = current.filter((i) => i.checked);

    const rowHtml = (item, idx, arr) => `
      <div class="shop-row ${item.checked ? 'checked' : ''}" data-idx="${arr === current ? current.indexOf(item) : idx}">
        <div class="checkbox" data-toggle>${item.checked ? '✓' : ''}</div>
        <div class="item-qty">${escapeHtml(item.quantity || '')}</div>
        <div class="item-name">${escapeHtml(item.ingredientName)} ${item.pantryFlag === 'low' ? '<span class="badge low">low</span>' : ''}</div>
        <button class="remove-row-btn" data-remove>&times;</button>
      </div>
    `;

    listContainer.innerHTML = `
      ${unchecked.length ? `<div class="shop-group-title">To Get (${unchecked.length})</div><div class="card">${unchecked.map((i) => rowHtml(i, 0, current)).join('')}</div>` : ''}
      ${checked.length ? `<div class="shop-group-title">Checked (${checked.length})</div><div class="card">${checked.map((i) => rowHtml(i, 0, current)).join('')}</div>` : ''}
    `;

    listContainer.querySelectorAll('.shop-row').forEach((row) => {
      const idx = Number(row.dataset.idx);
      row.querySelector('[data-toggle]').addEventListener('click', () => {
        const all = db.getShoppingList();
        all[idx].checked = !all[idx].checked;
        db.saveShoppingList(all);
        renderList();
      });
      row.querySelector('[data-remove]').addEventListener('click', () => {
        const all = db.getShoppingList();
        all.splice(idx, 1);
        db.saveShoppingList(all);
        renderList();
      });
    });
  }

  root.querySelector('#manual-add-btn').addEventListener('click', () => {
    const input = root.querySelector('#manual-name');
    const name = input.value.trim();
    if (!name) return;
    db.addShoppingItem({ ingredientName: name, quantity: '', unit: '', checked: false, source: 'manual' });
    input.value = '';
    renderList();
  });
  root.querySelector('#manual-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') root.querySelector('#manual-add-btn').click();
  });

  root.querySelector('#clear-checked-btn').addEventListener('click', async () => {
    if (await confirmDialog('Remove all checked items?')) {
      db.clearCheckedShoppingItems();
      renderList();
    }
  });

  root.querySelector('#send-kroger-btn').addEventListener('click', () => openKrogerReview());

  renderList();
}

async function openKrogerReview() {
  if (!isConnected()) {
    toast('Connect your Kroger account in Settings first.', 'error');
    return;
  }
  const settings = db.getSettings();
  if (!settings.krogerLocationId) {
    toast('Pick a Kroger store in Settings first.', 'error');
    return;
  }
  const items = db.getShoppingList().filter((i) => !i.checked);
  if (!items.length) {
    toast('Nothing to send — everything is checked off.', 'error');
    return;
  }

  const closeLoading = openModal(`
    <div class="modal-header"><h3>Matching items...</h3></div>
    <div style="text-align:center;padding:20px;"><span class="spinner"></span></div>
  `);

  let results;
  try {
    results = await Promise.all(items.map(async (item) => {
      try {
        const matches = await searchProducts(item.ingredientName, settings.krogerLocationId);
        return { item, matches, error: null };
      } catch (err) {
        return { item, matches: [], error: err.message };
      }
    }));
  } catch (err) {
    closeLoading();
    toast(err.message || 'Product search failed.', 'error');
    return;
  }
  closeLoading();
  showReviewModal(results);
}

function productPrice(product) {
  const price = product.items?.[0]?.price;
  if (!price) return '';
  const amount = price.promo || price.regular;
  return amount ? `$${Number(amount).toFixed(2)}` : '';
}

function showReviewModal(results) {
  const selections = new Map(); // ingredientName -> upc or null (skip)
  results.forEach((r) => selections.set(r.item.ingredientName, r.matches[0]?.upc || null));

  const bodyHtml = results.map((r) => `
    <div class="card" data-item="${escapeHtml(r.item.ingredientName)}">
      <div style="font-weight:600;margin-bottom:6px;">${escapeHtml(r.item.ingredientName)} <span class="text-dim text-small">${escapeHtml(r.item.quantity || '')}</span></div>
      ${r.error ? `<div class="text-small" style="color:var(--danger);">${escapeHtml(r.error)}</div>` : ''}
      ${!r.error && !r.matches.length ? '<div class="text-dim text-small">No matches found — will be skipped.</div>' : ''}
      ${r.matches.map((p, i) => `
        <div class="match-option ${i === 0 ? 'selected' : ''}" data-upc="${escapeHtml(p.upc)}">
          <img src="${escapeHtml(p.images?.[0]?.sizes?.find((s) => s.size === 'small')?.url || p.images?.[0]?.sizes?.[0]?.url || '')}" onerror="this.style.visibility='hidden'" />
          <div class="info">
            <div class="desc">${escapeHtml(p.description || '')}</div>
            <div class="price">${escapeHtml(productPrice(p))}</div>
          </div>
        </div>
      `).join('')}
      ${r.matches.length ? `<button class="btn small ghost mt-8" data-skip>Skip this item</button>` : ''}
    </div>
  `).join('');

  openModal(`
    <div class="modal-header"><h3>Confirm Kroger Matches</h3></div>
    <div style="max-height:60vh;overflow-y:auto;">${bodyHtml}</div>
    <div class="btn-row mt-8">
      <button class="btn ghost flex-1" data-a="cancel">Cancel</button>
      <button class="btn primary flex-1" data-a="confirm">Add to Cart</button>
    </div>
  `, {
    onMount(sheet, close) {
      sheet.querySelectorAll('[data-item]').forEach((card) => {
        const name = card.dataset.item;
        card.querySelectorAll('.match-option').forEach((opt) => {
          opt.addEventListener('click', () => {
            card.querySelectorAll('.match-option').forEach((o) => o.classList.remove('selected'));
            opt.classList.add('selected');
            selections.set(name, opt.dataset.upc);
          });
        });
        const skipBtn = card.querySelector('[data-skip]');
        if (skipBtn) {
          skipBtn.addEventListener('click', () => {
            card.querySelectorAll('.match-option').forEach((o) => o.classList.remove('selected'));
            selections.set(name, null);
          });
        }
      });

      sheet.querySelector('[data-a=cancel]').addEventListener('click', close);
      sheet.querySelector('[data-a=confirm]').addEventListener('click', async () => {
        const toAdd = Array.from(selections.entries()).filter(([, upc]) => upc).map(([, upc]) => ({ upc, quantity: 1 }));
        if (!toAdd.length) { toast('No items selected.', 'error'); return; }
        try {
          await addItemsToCart(toAdd);
          toast(`Added ${toAdd.length} item${toAdd.length === 1 ? '' : 's'} to your Kroger cart.`, 'success');
          close();
        } catch (err) {
          toast(err.message || 'Failed to add to cart.', 'error');
        }
      });
    },
  });
}
