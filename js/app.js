import { initRouter, registerRoute, navigate } from './router.js';
import { toast } from './utils.js';
import { renderRecipeList, renderRecipeForm, renderRecipeDetail, renderRecipeImport } from './views/recipes.js';
import { renderPantry } from './views/pantry.js';
import { renderCalendar } from './views/calendar.js';
import { renderShopping } from './views/shopping.js';
import { renderSettings } from './views/settings.js';
import { handleOAuthRedirect } from './kroger.js';

const NAV_ITEMS = [
  { route: '/calendar', label: 'Plan', icon: 'calendar' },
  { route: '/recipes', label: 'Recipes', icon: 'book' },
  { route: '/pantry', label: 'Pantry', icon: 'box' },
  { route: '/shopping', label: 'Shop', icon: 'cart' },
  { route: '/settings', label: 'Settings', icon: 'gear' },
];

const ICONS = {
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13Z"/><path d="M4 19.5V6.5"/>',
  box: '<path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v9l9 5 9-5V8"/><path d="M12 13v9"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2l2.4 12.2a2 2 0 0 0 2 1.6H18a2 2 0 0 0 2-1.6L21.5 7H5.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
};

function renderShell() {
  const header = document.getElementById('app-header');
  header.innerHTML = `
    <div class="brand"><span class="dot"></span> mealplanner</div>
    <div class="header-actions"></div>
  `;

  const nav = document.getElementById('bottom-nav');
  nav.innerHTML = NAV_ITEMS.map((item) => `
    <a href="#${item.route}" data-route="${item.route}">
      <svg viewBox="0 0 24 24">${ICONS[item.icon]}</svg>
      <span>${item.label}</span>
    </a>
  `).join('');
}

function registerRoutes() {
  registerRoute('/recipes', renderRecipeList);
  registerRoute('/recipes/import', renderRecipeImport);
  registerRoute('/recipes/new', renderRecipeForm);
  registerRoute('/recipes/:id', renderRecipeDetail);
  registerRoute('/recipes/:id/edit', renderRecipeForm);
  registerRoute('/pantry', renderPantry);
  registerRoute('/calendar', renderCalendar);
  registerRoute('/shopping', renderShopping);
  registerRoute('/settings', renderSettings);
}

async function checkOAuthRedirect() {
  const params = new URLSearchParams(location.search);
  if (params.has('code') || params.has('error')) {
    const result = await handleOAuthRedirect(params);
    // strip query params so a refresh doesn't try to reuse the spent code
    history.replaceState({}, '', location.pathname + location.hash);
    if (result.ok) {
      toast('Kroger account connected.', 'success');
    } else {
      toast(`Kroger connect failed: ${result.error}`, 'error');
    }
    navigate('/settings');
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('sw register failed', err));
    });
  }
}

async function boot() {
  renderShell();
  registerRoutes();
  const root = document.getElementById('view-root');
  await checkOAuthRedirect();
  initRouter(root);
  registerServiceWorker();
}

boot();
