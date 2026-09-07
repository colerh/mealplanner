import { parseIngredientLine } from '../utils.js';

// Recipe import pipeline:
//   1. POST /api/fetch-page to pull the raw HTML for a URL (server-side —
//      browsers can't fetch arbitrary third-party pages due to CORS).
//   2. Look for schema.org Recipe JSON-LD embedded in the page.
//   3. If nothing usable found, fall back to /api/parse-recipe-llm, which
//      sends the page's visible text to Claude and gets back strict JSON.
// Either path returns a draft recipe object for the user to review/edit
// before it's saved to localStorage.

export async function fetchPageHtml(url) {
  const res = await fetch('/api/fetch-page', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to fetch page (${res.status})`);
  }
  const { html } = await res.json();
  return html;
}

function collectJsonLdNodes(doc) {
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  const nodes = [];
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of arr) {
        if (item['@graph']) nodes.push(...item['@graph']);
        else nodes.push(item);
      }
    } catch {
      // malformed JSON-LD block — skip it
    }
  }
  return nodes;
}

function isRecipeNode(node) {
  const type = node['@type'];
  if (!type) return false;
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => String(t).toLowerCase() === 'recipe');
}

function textOf(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.name) return value.name;
  return String(value);
}

function parseInstructions(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') {
    return raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(raw)) {
    const steps = [];
    for (const item of raw) {
      if (typeof item === 'string') {
        steps.push(item.trim());
      } else if (item && item['@type'] === 'HowToSection' && Array.isArray(item.itemListElement)) {
        for (const sub of item.itemListElement) steps.push(textOf(sub.text || sub.name || sub));
      } else if (item && (item.text || item.name)) {
        steps.push(textOf(item.text || item.name));
      }
    }
    return steps.map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function parseYield(raw) {
  if (!raw) return '';
  const value = Array.isArray(raw) ? raw[0] : raw;
  const match = String(value).match(/\d+/);
  return match ? match[0] : String(value);
}

function parseIngredients(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((line) => {
    const parsed = parseIngredientLine(line);
    return {
      name: parsed.name || String(line).trim(),
      amount: parsed.amount === '' ? '' : parsed.amount,
      unit: parsed.unit || '',
    };
  });
}

function parseTags(node) {
  const tags = new Set();
  const addAll = (val) => {
    if (!val) return;
    const arr = Array.isArray(val) ? val : String(val).split(',');
    arr.forEach((t) => {
      const clean = String(t).trim();
      if (clean) tags.add(clean);
    });
  };
  addAll(node.keywords);
  addAll(node.recipeCategory);
  addAll(node.recipeCuisine);
  return Array.from(tags).slice(0, 12);
}

export function extractJsonLdRecipe(html, sourceUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const nodes = collectJsonLdNodes(doc);
  const recipeNode = nodes.find(isRecipeNode);
  if (!recipeNode) return null;

  return {
    title: textOf(recipeNode.name) || 'Untitled recipe',
    sourceUrl,
    servings: parseYield(recipeNode.recipeYield),
    ingredients: parseIngredients(recipeNode.recipeIngredient || recipeNode.ingredients),
    instructions: parseInstructions(recipeNode.recipeInstructions),
    tags: parseTags(recipeNode),
  };
}

export function extractVisibleText(html, maxLength = 12000) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, noscript, svg, nav, footer, header').forEach((el) => el.remove());
  const text = (doc.body?.innerText || doc.body?.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  return text.slice(0, maxLength);
}

export async function parseRecipeWithLLM(pageText, sourceUrl) {
  const res = await fetch('/api/parse-recipe-llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: pageText, sourceUrl }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `LLM parse failed (${res.status})`);
  }
  const recipe = await res.json();
  return {
    title: recipe.title || 'Untitled recipe',
    sourceUrl,
    servings: recipe.servings || '',
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    instructions: Array.isArray(recipe.instructions) ? recipe.instructions : [],
    tags: Array.isArray(recipe.tags) ? recipe.tags : [],
  };
}

export async function importRecipeFromUrl(url) {
  const html = await fetchPageHtml(url);
  const jsonLd = extractJsonLdRecipe(html, url);
  if (jsonLd && jsonLd.ingredients.length) {
    return { recipe: jsonLd, method: 'json-ld' };
  }
  const text = extractVisibleText(html);
  const recipe = await parseRecipeWithLLM(text, url);
  return { recipe, method: 'llm' };
}
