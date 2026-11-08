// Page épisode : en-tête, lecteur Spotify, texte, galerie des dessins, « À écouter aussi ».
import { loadEpisodes, linkify, coverImg, catBadge, specialBadges, metaLine, paragraphs, shortOf, esc, waves, spotifyEpisodeId,
  renderMiniCard, imgSrc, imgSrcset, imgFallback, TAPES, TILTS, SHOW_URL } from './site.js';
import { openLightbox } from './lightbox.js';
import { initReviews } from './avis.js';

const root = document.getElementById('episode-root');
const id = new URLSearchParams(location.search).get('id');

function notFound() {
  document.title = 'Épisode introuvable · Double M';
  root.innerHTML = `
  <section class="hero notfound">
    <p class="kicker">PAS DE SIGNAL</p>
    <h1 class="h1">ÉPISODE INTROUVABLE</h1>
    <p class="lead">Cet épisode n'existe pas, ou il vient d'être retiré. Les autres t'attendent.</p>
    <a class="btn btn--gold btn--lg" href="/episodes">VOIR LES ÉPISODES</a>
  </section>`;
}

function player(ep) {
  const sid = spotifyEpisodeId(ep.spotifyUrl);
  if (!sid) return `<p class="embed-note">Le lecteur n'est pas disponible pour cet épisode. Écoute-le directement sur Spotify.</p>`;
  return `<iframe class="spotify-embed" title="Lecteur Spotify : ${esc(ep.titre)}" src="https://open.spotify.com/embed/episode/${esc(sid)}?utm_source=generator&amp;theme=0"
    loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`;
}

function gallery(ep) {
  const d = (ep.dessins || []).filter((x) => x && x.src);
  if (ep.categorie !== 'dessin' || !d.length) return '';
  const items = d.map((x, i) => `
      <figure class="drawing">
        <button class="drawing__btn" type="button" data-i="${i}" style="--tilt:${TILTS[i % 6]}deg" aria-label="Agrandir le dessin : ${esc(x.legende)}">
          <div class="paper">
            <img class="paper__img" src="${esc(imgSrc(x.src, 640))}" ${imgSrcset(x.src, [384, 640, 1080]) ? `srcset="${esc(imgSrcset(x.src, [384, 640, 1080]))}" sizes="(min-width: 760px) 300px, 50vw"` : ''}
              data-src="${esc(x.src)}" alt="${esc(x.legende)}" loading="lazy" decoding="async">
            <span class="tape tape--${TAPES[i % 3]}" aria-hidden="true"></span>
          </div>
        </button>
        <figcaption>${x.minutage ? `<span class="timestamp"><span aria-hidden="true">▶ </span><span class="sr-only">À </span>${esc(x.minutage)}</span>` : ''}<span>${esc(x.legende)}</span>${x.auteur ? `<span class="drawing__by">· ${esc(x.auteur)}</span>` : ''}</figcaption>
      </figure>`).join('');
  return `
  <section class="container container--wide" style="padding-top:clamp(48px,6vw,80px)" aria-labelledby="drawings-title">
    <div class="drawings-block">
      ${waves([[420, .16], [760, .09]])}
      <div class="drawings-block__head">
        <h2 class="h2" id="drawings-title">LES DESSINS</h2>
        <p>Lance l'épisode, puis suis les dessins : chacun indique le moment où il apparaît. Touche un dessin pour l'agrandir.</p>
      </div>
      <div class="gallery">${items}</div>
    </div>
  </section>`;
}

function render(ep, all) {
  document.title = `${ep.titre} · Double M`;
  const desc = shortOf(ep.description);
  document.querySelector('meta[name="description"]')?.setAttribute('content', desc);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', `${ep.titre} · Double M`);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', desc);

  const listen = ep.spotifyUrl || SHOW_URL;
  const others = all.filter((e) => e.id !== ep.id).slice(0, 2);
  root.innerHTML = `
  <section class="ep-hero">
    ${waves([[220, .4], [400, .24], [600, .12]], 'waves--animated')}
    <div class="container ep-hero__inner ${ep.pochette ? 'has-cover' : ''}">
      <a class="back-link" href="/episodes">← TOUS LES ÉPISODES</a>
      ${ep.pochette ? coverImg(ep, 'ep-hero__cover', 320, '(min-width: 760px) 280px, 160px').replace('alt=""', `alt="Pochette de l'épisode « ${esc(ep.titre)} »"`).replace(' loading="lazy"', '') : ''}
      <div class="ep-hero__main">
      <div class="ep-hero__badges">${catBadge(ep.categorie)}<span class="ep-hero__num"><span class="n">N°</span> <span class="v">${esc(ep.numero)}</span></span>${specialBadges(ep, { isLatest: all[0] && all[0].id === ep.id })}</div>
      <h1 class="ep-hero__title">${esc(ep.titre)}</h1>
      <span class="ep-hero__meta">${esc(metaLine(ep))}</span>
      <div class="ep-hero__actions">
        <a class="btn btn--gold btn--lg btn--play" href="${esc(listen)}" target="_blank" rel="noopener"><span class="play-dot" aria-hidden="true"></span>ÉCOUTER SUR SPOTIFY<span class="sr-only"> (nouvel onglet)</span></a>
      </div>
      </div>
    </div>
  </section>

  <section class="container ep-body">
    <div class="ep-body__col">
      <h2 class="kicker">ÉCOUTER</h2>
      ${player(ep)}
    </div>
    <div class="ep-body__col ep-body__col--text">
      <h2 class="kicker">L'ÉPISODE</h2>
      ${paragraphs(ep.description).map((p) => `<p>${linkify(esc(p))}</p>`).join('')}
    </div>
  </section>

  ${gallery(ep)}

  <section class="container reviews" id="avis" aria-labelledby="reviews-title"></section>

  ${others.length ? `
  <section class="container also" aria-labelledby="also-title">
    <h2 id="also-title">À ÉCOUTER AUSSI</h2>
    <div class="mini-cards">${others.map(renderMiniCard).join('')}</div>
  </section>` : '<div style="height:clamp(56px,7vw,96px)"></div>'}`;

  imgFallback(root);
  initReviews(root.querySelector('#avis'), ep);
  // L'orientation (portrait / paysage) se lit sur l'image : le cadre papier suit ses proportions.
  root.querySelectorAll('.drawing .paper__img').forEach((im) => {
    const fit = () => { if (im.naturalWidth) im.closest('.paper').style.setProperty('--ratio', `${im.naturalWidth} / ${im.naturalHeight}`); };
    if (im.complete) fit(); else im.addEventListener('load', fit);
  });
  const list = (ep.dessins || []).filter((x) => x && x.src);
  root.querySelectorAll('.drawing__btn').forEach((b) => {
    b.addEventListener('click', () => openLightbox(list, Number(b.dataset.i), b));
  });
}

try {
  const all = await loadEpisodes();
  const ep = all.find((e) => e.id === id);
  if (ep) render(ep, all); else notFound();
} catch (e) {
  root.innerHTML = '<div class="container"><div class="empty" style="margin:48px 0">Impossible de charger l\'épisode pour le moment. Recharge la page dans un instant.</div></div>';
}
