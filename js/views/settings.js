import { db } from '../db.js';
import { escapeHtml, toast, confirmDialog } from '../utils.js';
import { startAuth, isConnected, disconnect, searchLocations } from '../kroger.js';

export function renderSettings(params, root) {
  const settings = db.getSettings();
  const connected = isConnected();

  root.innerHTML = `
    <div class="section-title"><h2>Settings</h2></div>

    <div class="card">
      <h3>Meal Slots</h3>
      <p class="text-dim text-small">Comma separated, in order shown on the weekly calendar.</p>
      <div class="field">
        <input type="text" id="meal-slots" value="${escapeHtml(settings.mealSlots.join(', '))}" />
      </div>
      <button class="btn small" id="save-slots">Save</button>
    </div>

    <div class="card">
      <h3>Kroger Integration</h3>
      <div class="kroger-status ${connected ? 'connected' : 'disconnected'}">
        ${connected ? '● Connected' : '○ Not connected'}
      </div>
      ${connected ? `
        <button class="btn danger small" id="disconnect-btn">Disconnect</button>
      ` : `
        <button class="btn primary small" id="connect-btn">Connect Kroger Account</button>
      `}

      <div class="field mt-8">
        <label>Store (search by ZIP)</label>
        <div class="field-row">
          <input type="text" id="zip-input" placeholder="ZIP code" style="flex:1;" />
          <button class="btn small" id="zip-search-btn">Search</button>
        </div>
      </div>
      <div id="location-results"></div>
      <div id="current-location" class="text-small mt-8">
        ${settings.krogerLocationLabel ? `Selected store: <strong>${escapeHtml(settings.krogerLocationLabel)}</strong>` : '<span class="text-dim">No store selected.</span>'}
      </div>
    </div>

    <div class="card">
      <h3>Backup</h3>
      <p class="text-dim text-small">All data lives in this browser's local storage. Export a backup occasionally, or move data to another device.</p>
      <div class="btn-row">
        <button class="btn small" id="export-btn">Export JSON</button>
        <label class="btn small" style="cursor:pointer;">Import JSON<input type="file" id="import-input" accept="application/json" style="display:none;" /></label>
      </div>
    </div>

    <div class="card">
      <h3>Danger Zone</h3>
      <button class="btn danger small" id="wipe-btn">Erase All Data</button>
    </div>
  `;

  root.querySelector('#save-slots').addEventListener('click', () => {
    const slots = root.querySelector('#meal-slots').value.split(',').map((s) => s.trim()).filter(Boolean);
    if (!slots.length) { toast('Enter at least one meal slot.', 'error'); return; }
    db.saveSettings({ mealSlots: slots });
    toast('Saved.', 'success');
  });

  if (connected) {
    root.querySelector('#disconnect-btn').addEventListener('click', async () => {
      if (await confirmDialog('Disconnect your Kroger account? You can reconnect anytime.')) {
        disconnect();
        toast('Disconnected.');
        renderSettings(params, root);
      }
    });
  } else {
    root.querySelector('#connect-btn').addEventListener('click', async () => {
      try {
        await startAuth();
      } catch (err) {
        toast(err.message || 'Could not start Kroger connection.', 'error');
      }
    });
  }

  root.querySelector('#zip-search-btn').addEventListener('click', async () => {
    const zip = root.querySelector('#zip-input').value.trim();
    if (!zip) return;
    const resultsEl = root.querySelector('#location-results');
    resultsEl.innerHTML = '<div class="text-dim text-small mt-8"><span class="spinner"></span> Searching...</div>';
    try {
      const locations = await searchLocations(zip);
      if (!locations.length) {
        resultsEl.innerHTML = '<p class="text-dim text-small mt-8">No stores found near that ZIP.</p>';
        return;
      }
      resultsEl.innerHTML = `<div class="card mt-8">${locations.map((loc) => `
        <div class="list-item" data-id="${escapeHtml(loc.locationId)}" data-label="${escapeHtml(`${loc.chain || ''} ${loc.address?.addressLine1 || ''}`)}" style="cursor:pointer;">
          <div class="flex-1">
            <div>${escapeHtml(loc.chain || loc.name || 'Kroger')}</div>
            <div class="text-dim text-small">${escapeHtml(loc.address?.addressLine1 || '')}, ${escapeHtml(loc.address?.city || '')}</div>
          </div>
        </div>
      `).join('')}</div>`;
      resultsEl.querySelectorAll('[data-id]').forEach((el) => {
        el.addEventListener('click', () => {
          db.saveSettings({ krogerLocationId: el.dataset.id, krogerLocationLabel: el.dataset.label });
          toast('Store selected.', 'success');
          renderSettings(params, root);
        });
      });
    } catch (err) {
      resultsEl.innerHTML = `<p class="text-small mt-8" style="color:var(--danger);">${escapeHtml(err.message || 'Search failed.')}</p>`;
    }
  });

  root.querySelector('#export-btn').addEventListener('click', () => {
    const data = {
      recipes: db.getRecipes(),
      pantry: db.getPantry(),
      mealPlan: db.getMealPlan(),
      shoppingList: db.getShoppingList(),
      settings: db.getSettings(),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mealplanner-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  root.querySelector('#import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!(await confirmDialog('Import will overwrite all current data. Continue?'))) { e.target.value = ''; return; }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.recipes) db.saveAll(db.KEYS.recipes, data.recipes);
      if (data.pantry) db.saveAll(db.KEYS.pantry, data.pantry);
      if (data.mealPlan) db.saveAll(db.KEYS.mealPlan, data.mealPlan);
      if (data.shoppingList) db.saveAll(db.KEYS.shoppingList, data.shoppingList);
      if (data.settings) db.saveSettings(data.settings);
      toast('Import complete.', 'success');
      renderSettings(params, root);
    } catch (err) {
      toast('Import failed: invalid file.', 'error');
    }
  });

  root.querySelector('#wipe-btn').addEventListener('click', async () => {
    if (await confirmDialog('Erase ALL local data (recipes, pantry, plan, shopping list, Kroger connection)? This cannot be undone.')) {
      Object.values(db.KEYS).forEach((key) => localStorage.removeItem(key));
      toast('All data erased.');
      renderSettings(params, root);
    }
  });
}
