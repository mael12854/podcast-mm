// Double M — outils partagés par les pages publiques.

export const SHOW_URL = 'https://open.spotify.com/show/4AzeojO18Sh7Ft80TGsn9e';

export const CATS = {
  chronique: { label: 'Chronique', up: 'CHRONIQUE' },
  parents: { label: 'Chronique des parents', up: 'CHRONIQUE DES PARENTS' },
  dessin: { label: 'Dessin radio-dessiné', up: '✎ DESSIN RADIO-DESSINÉ' },
};

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const TAPES = ['gold', 'coral', 'lavender'];
export const TILTS = [-2, 1.5, -1, 2, -1.5, 1];

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtDate(iso, long = false) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return '';
  const months = long ? MONTHS_LONG : MONTHS;
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

// Rend les adresses web cliquables dans un texte déjà échappé (descriptions écrites depuis l'admin).
export function linkify(escaped) {
  return escaped.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)»]/g, (url) => {
    const label = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `<a href="${url}" target="_blank" rel="noopener nofollow">${label}<span class="sr-only"> (nouvel onglet)</span></a>`;
  });
}

export function paragraphs(desc) {
  return String(desc || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

// La première phrase de la description sert de résumé sur les cartes.
export function shortOf(desc) {
  const first = paragraphs(desc)[0] || '';
  const sentence = first.split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ«"0-9])/)[0] || first;
  return sentence.length > 180 ? sentence.slice(0, 177).replace(/\s+\S*$/, '') + '…' : sentence;
}

export function metaLine(ep, { withAuthors = true } = {}) {
  return [fmtDate(ep.date), ep.duree, withAuthors ? ep.auteurs : ''].filter(Boolean).join(' · ');
}

export function spotifyEpisodeId(url) {
  const m = /^https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?episode\/([A-Za-z0-9]+)/.exec(url || '');
  return m ? m[1] : null;
}

export function episodeUrl(ep) {
  return `/episode?id=${encodeURIComponent(ep.id)}`;
}

// Images : sur Vercel, on passe par l'optimiseur d'images (taille adaptée à l'écran).
// En local, on sert le fichier d'origine.
const ON_VERCEL = !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname) && location.protocol === 'https:';
export function imgSrc(src, width) {
  const path = '/' + String(src || '').replace(/^\/+/, '');
  if (!ON_VERCEL || !width) return path;
  return `/_vercel/image?url=${encodeURIComponent(path)}&w=${width}&q=80`;
}
export function imgSrcset(src, widths) {
  if (!ON_VERCEL) return '';
  return widths.map((w) => `${imgSrc(src, w)} ${w}w`).join(', ');
}
// Si l'optimiseur échoue, on retombe sur le fichier d'origine.
export function imgFallback(root = document) {
  root.querySelectorAll('img[data-src]').forEach((img) => {
    img.addEventListener('error', () => {
      if (img.dataset.fellback) return;
      img.dataset.fellback = '1';
      img.removeAttribute('srcset');
      img.src = '/' + img.dataset.src.replace(/^\/+/, '');
    }, { once: false });
  });
}

export function waves(list, cls = '') {
  return `<div class="waves ${cls}" aria-hidden="true">${list.map(([s, o]) => `<span style="--s:${s}px;--o:${o}"></span>`).join('')}</div>`;
}

export function catBadge(cat, size = '') {
  const c = CATS[cat] || CATS.chronique;
  return `<span class="badge badge--${CATS[cat] ? cat : 'chronique'} ${size ? 'badge--' + size : ''}">${esc(c.up)}</span>`;
}

// Bandes spéciales : « NOUVEL ÉPISODE » sur le plus récent, « 1ER ÉPISODE » sur le n° 1.
export function specialBadges(ep, { isLatest = false } = {}) {
  let out = '';
  if (Number(ep.numero) === 1) out += '<span class="badge badge--new">1ER ÉPISODE</span>';
  if (isLatest && Number(ep.numero) !== 1) out += '<span class="badge badge--new">NOUVEL ÉPISODE</span>';
  return out;
}

export function epNum(ep, cls = '') {
  return `<span class="ep-num ${cls}" aria-hidden="true"><span class="ep-num__n">N°</span><span class="ep-num__v">${esc(ep.numero)}</span></span>`;
}

function paperThumb(src, cls, tape, width) {
  const img = src
    ? `<img class="paper__img" src="${esc(imgSrc(src, width))}" data-src="${esc(src)}" alt="" loading="lazy" decoding="async">`
    : '<div class="paper__hatch"></div>';
  return `<div class="paper ${cls}" aria-hidden="true">${img}<span class="tape tape--${tape}"></span></div>`;
}

// Pochette carrée de l'épisode (décorative à côté du titre : alt vide).
export function coverImg(ep, cls, width, sizes) {
  if (!ep.pochette) return '';
  const set = imgSrcset(ep.pochette, [width, width * 2]);
  return `<img class="${cls}" src="${esc(imgSrc(ep.pochette, width))}" ${set ? `srcset="${esc(set)}" sizes="${sizes || width + 'px'}"` : ''} data-src="${esc(ep.pochette)}" alt="" loading="lazy" decoding="async">`;
}

export function renderCard(ep, { level = 3, latestId = null } = {}) {
  const isDessin = ep.categorie === 'dessin';
  const first = isDessin && ep.dessins && ep.dessins[0] ? ep.dessins[0].src : null;
  const h = `h${level}`;
  return `
<article class="card">
  <div class="card__visual">
    ${waves([[90, .45], [170, .28], [260, .15]], 'waves--thin')}
    ${ep.pochette ? coverImg(ep, 'card__cover', 320, '120px') : (isDessin ? paperThumb(first, 'card__drawing', 'lavender', 320) : '')}
    <div class="card__badges">${catBadge(ep.categorie, 'card')}${specialBadges(ep, { isLatest: ep.id === latestId })}</div>
    ${epNum(ep, 'card__num')}
  </div>
  <div class="card__body">
    <span class="meta">${esc(metaLine(ep))}</span>
    <${h} class="card__title"><a href="${episodeUrl(ep)}"><span class="sr-only">Épisode ${esc(ep.numero)} : </span>${esc(ep.titre)}</a></${h}>
    <p class="card__short">${esc(shortOf(ep.description))}</p>
    <span class="card__cta" aria-hidden="true">ÉCOUTER →</span>
  </div>
</article>`;
}

export function renderMiniCard(ep) {
  return `
<article class="mini-card">
  ${ep.pochette ? coverImg(ep, 'num-tile num-tile--cover', 144, '72px') : `<span class="num-tile" aria-hidden="true">${esc(ep.numero)}</span>`}
  <div class="mini-card__body">
    ${catBadge(ep.categorie, 'list')}
    <h3 class="mini-card__title"><a href="${episodeUrl(ep)}"><span class="sr-only">Épisode ${esc(ep.numero)} : </span>${esc(ep.titre)}</a></h3>
    <span class="meta">${esc(metaLine(ep, { withAuthors: false }))}</span>
  </div>
</article>`;
}

export { paperThumb };

// Chargement des épisodes publiés (du plus récent au plus ancien).
export async function loadEpisodes() {
  const res = await fetch('/data/episodes.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('episodes.json introuvable');
  const list = await res.json();
  return (Array.isArray(list) ? list : [])
    .filter((e) => e && e.id && e.titre)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.numero) - Number(a.numero));
}

// ---------- Header : menu mobile ----------
export function initHeader() {
  const btn = document.querySelector('.menu-toggle');
  const panel = document.getElementById('mobile-menu');
  if (!btn || !panel) return;
  const set = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    panel.hidden = !open;
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') { set(false); btn.focus(); }
  });
  matchMedia('(min-width: 760px)').addEventListener('change', (e) => { if (e.matches) set(false); });
}

initHeader();
