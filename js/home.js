// Accueil : dernier épisode mis en avant + derniers épisodes.
import { loadEpisodes, coverImg, titleHtml, renderCard, catBadge, specialBadges, epNum, metaLine, shortOf, esc, waves, episodeUrl, paperThumb, imgFallback, SHOW_URL } from './site.js';

const featuredEl = document.getElementById('featured');
const recentEl = document.getElementById('recent');

function waveBars() {
  // 48 barres : or = déjà écouté, lavande = à venir (purement décoratif)
  return Array.from({ length: 48 }, (_, i) => {
    const h = Math.min(100, Math.round(22 + Math.abs(Math.sin(i * 0.9) * 48 + Math.sin(i * 0.37) * 30)));
    return `<span class="${i < 14 ? 'on' : ''}" style="height:${h}%"></span>`;
  }).join('');
}

function renderFeatured(ep) {
  const isDessin = ep.categorie === 'dessin';
  const d = ep.dessins || [];
  const listen = ep.spotifyUrl || SHOW_URL;
  return `
<article class="featured" aria-labelledby="feat-title">
  <div class="featured__visual">
    ${waves([[140, .45], [260, .28], [400, .15]])}
    ${ep.pochette ? coverImg(ep, 'featured__cover', 384, '(min-width: 760px) 240px, 45vw')
      : (isDessin ? paperThumb(d[0] && d[0].src, 'featured__d1', 'gold', 480) + paperThumb(d[1] && d[1].src, 'featured__d2', 'coral', 400) : '')}
    ${epNum(ep, 'featured__num')}
  </div>
  <div class="featured__body">
    <div class="featured__badges">${catBadge(ep.categorie)}${specialBadges(ep, { isLatest: true })}</div>
    <h3 class="featured__title" id="feat-title">${titleHtml(ep)}</h3>
    <span class="featured__meta">${esc(metaLine(ep))}</span>
    <p class="featured__short">${esc(shortOf(ep.description))}</p>
    <div class="mini-player">
      <a class="mini-player__play" href="${episodeUrl(ep)}" aria-label="Écouter « ${esc(ep.titre)} » sur la page de l'épisode"></a>
      <div class="mini-player__track" aria-hidden="true">
        <div class="wave-bars">${waveBars()}</div>
        <div class="mini-player__times"><span>VIA SPOTIFY</span><span>${esc(ep.duree || '')}</span></div>
      </div>
    </div>
    <div class="featured__actions">
      <a class="btn btn--outline btn--md" href="${episodeUrl(ep)}">VOIR L'ÉPISODE</a>
      <a class="btn btn--text" href="${esc(listen)}" target="_blank" rel="noopener">ÉCOUTER SUR SPOTIFY ↗<span class="sr-only"> (nouvel onglet)</span></a>
    </div>
  </div>
</article>`;
}

try {
  const eps = await loadEpisodes();
  if (!eps.length) {
    featuredEl.innerHTML = '<div class="empty">Le premier épisode arrive bientôt. Reste à l\'écoute !</div>';
    document.getElementById('recent-section').hidden = true;
  } else {
    const [latest, ...rest] = eps;
    featuredEl.innerHTML = renderFeatured(latest);
    document.getElementById('hero-latest').href = episodeUrl(latest);
    if (rest.length) recentEl.innerHTML = rest.slice(0, 3).map((e) => renderCard(e, { level: 3 })).join('');
    else document.getElementById('recent-section').hidden = true;
    imgFallback(document);
  }
} catch (e) {
  featuredEl.innerHTML = '<div class="empty">Impossible de charger les épisodes pour le moment. Recharge la page dans un instant.</div>';
  document.getElementById('recent-section').hidden = true;
}
