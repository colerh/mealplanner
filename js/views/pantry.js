import { db } from '../db.js';
import { escapeHtml, toast, confirmDialog } from '../utils.js';

const STATUSES = ['have', 'low', 'out'];

export function renderPantry(params, root) {
  root.innerHTML = `
    <div class="section-title">
      <h2>Pantry</h2>
      <button class="btn small" id="restock-btn">Restock All</button>
    </div>
    <div class="card">
      <div class="field-row" style="align-items:flex-end;">
        <div class="field flex-1">
          <label>Add item</label>
          <input type="text" id="new-item-name" placeholder="e.g. olive oil" />
        </div>
        <button class="btn primary" id="add-item-btn" style="margin-bottom:12px;">Add</button>
      </div>
    </div>
    <div id="pantry-list"></div>
  `;

  const listEl = root.querySelector('#pantry-list');

  function renderList() {
    const items = db.getPantry().slice().sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
    if (!items.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="big">🥫</div>No pantry items yet.<br>Add what you keep stocked so shopping lists can skip it.</div>`;
      return;
    }
    listEl.innerHTML = `<div class="card">${items.map((item) => `
      <div class="pantry-row" data-name="${escapeHtml(item.ingredientName)}">
        <div class="name">${escapeHtml(item.ingredientName)}</div>
        <div class="status-toggle">
          ${STATUSES.map((s) => `<button data-status="${s}" class="${item.status === s ? `active ${s}` : ''}">${s}</button>`).join('')}
        </div>
        <button class="remove-row-btn" data-remove>&times;</button>
      </div>
    `).join('')}</div>`;

    listEl.querySelectorAll('.pantry-row').forEach((row) => {
      const name = row.dataset.name;
      row.querySelectorAll('[data-status]').forEach((btn) => {
        btn.addEventListener('click', () => {
          db.savePantryItem({ ingredientName: name, status: btn.dataset.status, lastUpdated: new Date().toISOString() });
          renderList();
        });
      });
      row.querySelector('[data-remove]').addEventListener('click', async () => {
        if (await confirmDialog(`Remove "${name}" from pantry?`)) {
          db.deletePantryItem(name);
          renderList();
        }
      });
    });
  }

  root.querySelector('#add-item-btn').addEventListener('click', () => {
    const input = root.querySelector('#new-item-name');
    const name = input.value.trim();
    if (!name) return;
    db.savePantryItem({ ingredientName: name, status: 'have', lastUpdated: new Date().toISOString() });
    input.value = '';
    renderList();
  });
  root.querySelector('#new-item-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') root.querySelector('#add-item-btn').click();
  });

  root.querySelector('#restock-btn').addEventListener('click', async () => {
    if (await confirmDialog('Mark all pantry items as "have"?')) {
      db.restockAll();
      toast('Pantry restocked.', 'success');
      renderList();
    }
  });

  renderList();
}
