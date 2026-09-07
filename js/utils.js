// Shared helpers: date math, ingredient text parsing, unit normalization, toasts.

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function startOfWeek(date, weekStartsOn = 1) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function formatDayLabel(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

export function formatDateLabel(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ---- Ingredient text parsing ----
// Handles strings like "1 1/2 cups all-purpose flour" or "2 large eggs" or
// "salt to taste" and splits into { amount, unit, name }. Heuristic — the
// user reviews/edits parsed recipes before saving, so this doesn't need to
// be perfect.

const UNICODE_FRACTIONS = {
  '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

const KNOWN_UNITS = [
  'cups', 'cup', 'c', 'tablespoons', 'tablespoon', 'tbsp', 'tbs', 'tb',
  'teaspoons', 'teaspoon', 'tsp', 'ts',
  'ounces', 'ounce', 'oz', 'fl oz', 'fluid ounce', 'fluid ounces',
  'pounds', 'pound', 'lbs', 'lb',
  'grams', 'gram', 'g', 'kilograms', 'kilogram', 'kg',
  'milliliters', 'milliliter', 'ml', 'liters', 'liter', 'l',
  'cloves', 'clove', 'cans', 'can', 'packages', 'package', 'pkg',
  'pinch', 'pinches', 'dash', 'dashes', 'slices', 'slice',
  'sticks', 'stick', 'bunches', 'bunch', 'heads', 'head',
  'large', 'medium', 'small', 'whole', 'quarts', 'quart', 'qt', 'pints', 'pint', 'pt',
];
// longest-first so "fl oz" matches before "oz"
const UNIT_PATTERN = KNOWN_UNITS.sort((a, b) => b.length - a.length).join('|');

function parseNumberToken(token) {
  token = token.trim();
  if (!token) return null;
  if (UNICODE_FRACTIONS[token] !== undefined) return UNICODE_FRACTIONS[token];
  const mixedMatch = token.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) return Number(mixedMatch[1]) + Number(mixedMatch[2]) / Number(mixedMatch[3]);
  const fracMatch = token.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) return Number(fracMatch[1]) / Number(fracMatch[2]);
  const num = Number(token);
  return Number.isFinite(num) ? num : null;
}

export function parseIngredientLine(line) {
  let text = String(line || '').trim().replace(/\s+/g, ' ');
  if (!text) return { amount: '', unit: '', name: '' };

  // normalize unicode fraction glued to a leading integer, e.g. "1½" -> "1 ½"
  text = text.replace(/(\d)([¼½¾⅓⅔⅛⅜⅝⅞])/, '$1 $2');

  const amountRegex = new RegExp(
    `^((?:\\d+\\s+\\d+\\/\\d+)|(?:\\d+\\/\\d+)|(?:\\d*\\.\\d+)|(?:\\d+)|[${Object.keys(UNICODE_FRACTIONS).join('')}])\\s*`
  );
  const amountMatch = text.match(amountRegex);
  let amount = '';
  let rest = text;
  if (amountMatch) {
    const parsed = parseNumberToken(amountMatch[1]);
    if (parsed !== null) {
      amount = parsed;
      rest = text.slice(amountMatch[0].length);
    }
  }

  const unitRegex = new RegExp(`^(${UNIT_PATTERN})\\b\\.?\\s*`, 'i');
  const unitMatch = rest.match(unitRegex);
  let unit = '';
  if (unitMatch) {
    unit = unitMatch[1].toLowerCase();
    rest = rest.slice(unitMatch[0].length);
  }

  rest = rest.replace(/^,\s*/, '').replace(/^of\s+/i, '').trim();

  return { amount: amount === '' ? '' : amount, unit, name: rest };
}

export function formatQuantity(amount, unit) {
  const parts = [];
  if (amount !== '' && amount !== null && amount !== undefined) {
    const rounded = Math.round(amount * 100) / 100;
    parts.push(String(rounded));
  }
  if (unit) parts.push(unit);
  return parts.join(' ');
}

export function normalizeIngredientName(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/^\d+\s*/, '')
    .replace(/[.,]+$/, '')
    .replace(/\s+/g, ' ');
}

// ---- Toasts ----
let toastStack = null;
export function toast(message, type = 'info', ms = 3200) {
  if (!toastStack) {
    toastStack = document.createElement('div');
    toastStack.className = 'toast-stack';
    document.body.appendChild(toastStack);
  }
  const el = document.createElement('div');
  el.className = `toast ${type === 'info' ? '' : type}`.trim();
  el.textContent = message;
  toastStack.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ---- Modal ----
export function openModal(innerHtml, { onMount } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal-sheet">${innerHtml}</div>`;
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.body.appendChild(backdrop);
  if (onMount) onMount(backdrop.querySelector('.modal-sheet'), close);
  return close;
}

export function confirmDialog(message) {
  return new Promise((resolve) => {
    openModal(`
      <div class="modal-header"><h3>Confirm</h3></div>
      <p>${escapeHtml(message)}</p>
      <div class="btn-row mt-8">
        <button class="btn flex-1" data-a="cancel">Cancel</button>
        <button class="btn danger flex-1" data-a="ok">Confirm</button>
      </div>
    `, {
      onMount(sheet, close) {
        sheet.querySelector('[data-a=cancel]').addEventListener('click', () => { close(); resolve(false); });
        sheet.querySelector('[data-a=ok]').addEventListener('click', () => { close(); resolve(true); });
      },
    });
  });
}
