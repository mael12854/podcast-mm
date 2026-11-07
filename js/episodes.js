// Épisodes : liste complète + filtre par catégorie (onglets accessibles).
import { loadEpisodes, renderCard, imgFallback } from './site.js';

const FILTERS = [['all', 'Tous'], ['chronique', 'Chronique'], ['parents', 'Chronique des parents'], ['dessin', '✎ Dessin radio-dessiné']];
const tabsEl = document.getElementById('filters');
const panel = document.getElementById('episodes-panel');
let eps = [];
let current = new URLSearchParams(location.search).get('categorie');
if (!FILTERS.some(([k]) => k === current)) current = 'all';

function renderTabs() {
  const counts = { all: eps.length };
  eps.forEach((e) => { counts[e.categorie] = (counts[e.categorie] || 0) + 1; });
  tabsEl.innerHTML = FILTERS.map(([k, label]) => `
    <button class="chip chip--${k}" type="button" role="tab" id="tab-${k}" data-k="${k}"
      aria-selected="${k === current}" aria-controls="episodes-panel" tabindex="${k === current ? 0 : -1}">
      ${label}<span class="chip__count"><span class="sr-only">(</span>${counts[k] || 0}<span class="sr-only"> épisodes)</span></span>
    </button>`).join('');
}

function renderList() {
  panel.setAttribute('aria-labelledby', 'tab-' + current);
  const list = eps.filter((e) => current === 'all' || e.categorie === current);
  panel.innerHTML = list.length
    ? `<div class="cards">${list.map((e) => renderCard(e, { level: 2 })).join('')}</div>`
    : '<div class="empty">Pas encore d\'épisode dans cette catégorie. Ça arrive !</div>';
  imgFallback(panel);
}

function select(k, focus) {
  current = k;
  tabsEl.querySelectorAll('[role="tab"]').forEach((t) => {
    const on = t.dataset.k === k;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
  });
  const url = new URL(location.href);
  if (k === 'all') url.searchParams.delete('categorie'); else url.searchParams.set('categorie', k);
  history.replaceState(null, '', url);
  renderList();
}

tabsEl.addEventListener('click', (e) => {
  const t = e.target.closest('[role="tab"]');
  if (t) select(t.dataset.k, false);
});
tabsEl.addEventListener('keydown', (e) => {
  const keys = FILTERS.map(([k]) => k);
  let i = keys.indexOf(current);
  if (e.key === 'ArrowRight') i = (i + 1) % keys.length;
  else if (e.key === 'ArrowLeft') i = (i - 1 + keys.length) % keys.length;
  else if (e.key === 'Home') i = 0;
  else if (e.key === 'End') i = keys.length - 1;
  else return;
  e.preventDefault();
  select(keys[i], true);
});

try {
  eps = await loadEpisodes();
  renderTabs();
  renderList();
} catch (e) {
  panel.innerHTML = '<div class="empty">Impossible de charger les épisodes pour le moment. Recharge la page dans un instant.</div>';
}
