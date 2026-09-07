import { db } from '../db.js';
import { escapeHtml, toast, openModal, confirmDialog, startOfWeek, addDays, toISODate, todayISO, formatDayLabel, formatDateLabel } from '../utils.js';
import { navigate } from '../router.js';

function weekDates(anchorISO, weekStartsOn) {
  const start = startOfWeek(new Date(anchorISO + 'T00:00:00'), weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function pickRecipeModal(onPick) {
  const recipes = db.getRecipes();
  openModal(`
    <div class="modal-header"><h3>Choose a recipe</h3></div>
    <input type="search" id="pick-search" placeholder="Search recipes..." style="margin-bottom:10px;" />
    <div id="pick-list" style="max-height:50vh;overflow-y:auto;"></div>
    ${recipes.length ? '' : '<p class="text-dim text-small">No recipes saved yet. Add some in the Recipes tab first.</p>'}
  `, {
    onMount(sheet, close) {
      const listEl = sheet.querySelector('#pick-list');
      function render(filter = '') {
        const filtered = recipes.filter((r) => r.title.toLowerCase().includes(filter.toLowerCase()));
        listEl.innerHTML = filtered.map((r) => `
          <div class="list-item" data-id="${r.id}" style="cursor:pointer;">
            <div class="flex-1">${escapeHtml(r.title)}</div>
            <span class="text-dim text-small">${(r.ingredients || []).length} ing</span>
          </div>
        `).join('') || '<p class="text-dim text-small">No matches.</p>';
        listEl.querySelectorAll('[data-id]').forEach((el) => {
          el.addEventListener('click', () => { onPick(el.dataset.id); close(); });
        });
      }
      sheet.querySelector('#pick-search').addEventListener('input', (e) => render(e.target.value));
      render();
    },
  });
}

export function renderCalendar(params, root) {
  const settings = db.getSettings();
  const anchorISO = params && root.dataset ? (window.__calAnchor || todayISO()) : todayISO();
  let anchor = window.__calAnchor || todayISO();

  function draw() {
    const dates = weekDates(anchor, settings.weekStartsOn);
    const startLabel = formatDateLabel(dates[0]);
    const endLabel = formatDateLabel(dates[6]);
    const mealPlan = db.getMealPlan();
    const recipesById = Object.fromEntries(db.getRecipes().map((r) => [r.id, r]));

    root.innerHTML = `
      <div class="section-title"><h2>Weekly Plan</h2></div>
      <div class="week-nav">
        <button class="btn small" id="prev-week">&larr;</button>
        <span class="week-label">${startLabel} &ndash; ${endLabel}</span>
        <button class="btn small" id="next-week">&rarr;</button>
      </div>
      <div id="days"></div>
      <div class="btn-row">
        <button class="btn danger small" id="clear-week">Clear Week</button>
        <button class="btn primary flex-1" id="gen-shopping">Generate Shopping List from This Week</button>
      </div>
    `;

    const daysEl = root.querySelector('#days');
    daysEl.innerHTML = dates.map((date) => {
      const dateISO = toISODate(date);
      const isToday = dateISO === todayISO();
      return `
        <div class="day-col">
          <div class="day-label">
            <span>${formatDayLabel(date)} <span class="date-num">${formatDateLabel(date)}</span></span>
            ${isToday ? '<span class="today-marker">TODAY</span>' : ''}
          </div>
          ${settings.mealSlots.map((slot) => {
            const entry = mealPlan.find((e) => e.date === dateISO && e.mealSlot === slot);
            const recipe = entry ? recipesById[entry.recipeId] : null;
            return `
              <div class="slot-row ${recipe ? 'filled' : ''} ${isToday ? 'today' : ''}" data-date="${dateISO}" data-slot="${slot}">
                <div class="slot-label">${escapeHtml(slot)}</div>
                <div class="slot-content">${recipe ? escapeHtml(recipe.title) : '<span class="text-dim">tap to assign</span>'}</div>
                <div class="slot-actions">
                  ${recipe ? '<button class="btn small ghost" data-clear-slot>&times;</button>' : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }).join('');

    daysEl.querySelectorAll('.slot-row').forEach((row) => {
      row.querySelector('.slot-content').addEventListener('click', () => {
        pickRecipeModal((recipeId) => {
          db.setMealPlanEntry(row.dataset.date, row.dataset.slot, recipeId);
          draw();
        });
      });
      const clearBtn = row.querySelector('[data-clear-slot]');
      if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          db.setMealPlanEntry(row.dataset.date, row.dataset.slot, null);
          draw();
        });
      }
    });

    root.querySelector('#prev-week').addEventListener('click', () => {
      anchor = toISODate(addDays(dates[0], -7));
      window.__calAnchor = anchor;
      draw();
    });
    root.querySelector('#next-week').addEventListener('click', () => {
      anchor = toISODate(addDays(dates[0], 7));
      window.__calAnchor = anchor;
      draw();
    });
    root.querySelector('#clear-week').addEventListener('click', async () => {
      if (await confirmDialog('Clear all planned meals for this week?')) {
        db.clearMealPlanRange(dates.map(toISODate));
        draw();
      }
    });
    root.querySelector('#gen-shopping').addEventListener('click', () => {
      sessionStorage.setItem('mealplanner.shoppingWeek', JSON.stringify(dates.map(toISODate)));
      navigate('/shopping?generate=1');
    });
  }

  draw();
}
