// Minimal hash router. Routes are registered as pattern -> render(params, root).
// Patterns use ":param" segments, e.g. "/recipes/:id".

const routes = [];
let rootEl = null;
let notFoundHandler = () => '<div class="empty-state">Not found</div>';

export function registerRoute(pattern, render) {
  const paramNames = [];
  const regex = new RegExp(
    '^' + pattern.replace(/:[^/]+/g, (m) => {
      paramNames.push(m.slice(1));
      return '([^/]+)';
    }) + '$'
  );
  routes.push({ pattern, regex, paramNames, render });
}

export function setNotFound(handler) {
  notFoundHandler = handler;
}

export function navigate(path) {
  if (location.hash.slice(1) === path) {
    handleRoute();
  } else {
    location.hash = path;
  }
}

export function currentPath() {
  return location.hash.slice(1) || '/recipes';
}

async function handleRoute() {
  const path = currentPath();
  const [pathname, queryString] = path.split('?');
  const query = Object.fromEntries(new URLSearchParams(queryString || ''));

  for (const route of routes) {
    const match = pathname.match(route.regex);
    if (match) {
      const params = {};
      route.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(match[i + 1]); });
      rootEl.innerHTML = '';
      await route.render(params, rootEl, query);
      updateNavHighlight(pathname);
      window.scrollTo(0, 0);
      return;
    }
  }
  rootEl.innerHTML = notFoundHandler();
}

function updateNavHighlight(pathname) {
  document.querySelectorAll('#bottom-nav a').forEach((a) => {
    const base = '/' + pathname.split('/')[1];
    a.classList.toggle('active', a.getAttribute('data-route') === base);
  });
}

export function initRouter(root) {
  rootEl = root;
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

export function rerender() {
  handleRoute();
}
