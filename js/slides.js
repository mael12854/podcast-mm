// Slides d'un épisode : une slide à la fois (16:9), flèches, « 3 / 7 », légende.
// Clavier (← →), swipe sur mobile, clic = visionneuse plein écran (lightbox.js).
import { esc, imgSrc, imgSrcset } from './site.js';
import { openLightbox } from './lightbox.js';

const WIDTHS = [640, 1080, 1600, 2048];
const SIZES = '(min-width: 1120px) 1040px, 92vw';

export function slidesSection(ep) {
  const list = (ep.slides || []).filter((s) => s && s.src);
  if (!list.length) return '';
  const first = list[0];
  const set = imgSrcset(first.src, WIDTHS);
  return `
  <section class="container container--wide" style="padding-top:clamp(48px,6vw,80px)" aria-labelledby="slides-title">
    <div class="drawings-block slides-block">
      <div class="drawings-block__head">
        <h2 class="h2" id="slides-title">LES SLIDES</h2>
        <p>Fais défiler les slides de l’émission avec les flèches. Touche une slide pour l’agrandir.</p>
      </div>
      <div class="slider" id="slider" role="region" aria-roledescription="carrousel" aria-label="Slides de l’épisode" tabindex="0">
        <button class="slider__stage" type="button" id="slider-stage">
          <span class="paper slider__paper">
            <img class="slider__img" id="slider-img" src="${esc(imgSrc(first.src, 1080))}" ${set ? `srcset="${esc(set)}" sizes="${SIZES}"` : ''}
              data-src="${esc(first.src)}" alt="${esc(first.legende)}" width="2000" height="1125" decoding="async">
          </span>
        </button>
        <div class="slider__bar">
          <button class="slider__arrow" type="button" data-dir="-1" aria-label="Slide précédente">←</button>
          <p class="slider__pos" id="slider-pos" aria-hidden="true">1 / ${list.length}</p>
          <button class="slider__arrow" type="button" data-dir="1" aria-label="Slide suivante">→</button>
        </div>
        <p class="slider__caption" id="slider-caption" aria-live="polite"></p>
      </div>
    </div>
  </section>`;
}

export function initSlides(root, ep) {
  const list = (ep.slides || []).filter((s) => s && s.src);
  const slider = root.querySelector('#slider');
  if (!slider || !list.length) return;
  const stage = slider.querySelector('#slider-stage');
  const img = slider.querySelector('#slider-img');
  const pos = slider.querySelector('#slider-pos');
  const caption = slider.querySelector('#slider-caption');
  const prev = slider.querySelector('[data-dir="-1"]');
  const next = slider.querySelector('[data-dir="1"]');
  let i = 0;

  const preload = (k) => {
    if (k < 0 || k >= list.length) return;
    const pre = new Image();
    const set = imgSrcset(list[k].src, WIDTHS);
    if (set) { pre.sizes = SIZES; pre.srcset = set; }
    pre.src = imgSrc(list[k].src, 1080);
  };

  function show(k) {
    i = Math.max(0, Math.min(list.length - 1, k));
    const s = list[i];
    const set = imgSrcset(s.src, WIDTHS);
    img.removeAttribute('srcset');
    if (set) img.srcset = set;
    img.src = imgSrc(s.src, 1080);
    img.dataset.src = s.src;
    img.alt = s.legende;
    pos.textContent = `${i + 1} / ${list.length}`;
    caption.textContent = `Slide ${i + 1} sur ${list.length} : ${s.legende}`;
    stage.setAttribute('aria-label', `Agrandir la slide ${i + 1} : ${s.legende}`);
    prev.disabled = i === 0;
    next.disabled = i === list.length - 1;
    preload(i + 1);
    preload(i - 1);
  }

  // Si l'optimiseur d'images échoue, on retombe sur le fichier d'origine.
  img.addEventListener('error', () => {
    if (img.dataset.fellback === img.dataset.src) return;
    img.dataset.fellback = img.dataset.src;
    img.removeAttribute('srcset');
    img.src = '/' + img.dataset.src.replace(/^\/+/, '');
  });

  prev.addEventListener('click', () => { show(i - 1); if (prev.disabled) next.focus(); });
  next.addEventListener('click', () => { show(i + 1); if (next.disabled) prev.focus(); });

  slider.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(i - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); show(i + 1); }
    else if (e.key === 'Home') { e.preventDefault(); show(0); }
    else if (e.key === 'End') { e.preventDefault(); show(list.length - 1); }
  });

  // Swipe (tactile) : un geste horizontal de plus de 40 px change de slide, sans ouvrir la visionneuse.
  let startX = null; let startY = null; let swiped = false;
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    startX = e.clientX; startY = e.clientY; swiped = false;
  });
  stage.addEventListener('pointerup', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    startX = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { swiped = true; show(i + (dx < 0 ? 1 : -1)); }
  });
  stage.addEventListener('pointercancel', () => { startX = null; });
  stage.addEventListener('click', (e) => {
    if (swiped) { swiped = false; e.preventDefault(); return; }
    openLightbox(list.map((s) => ({ src: s.src, legende: s.legende })), i, stage);
  });

  show(0);
}
