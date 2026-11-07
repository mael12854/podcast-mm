// Visionneuse plein écran des dessins : <dialog> natif (focus piégé, Échap), flèches clavier.
import { imgSrc, imgSrcset } from './site.js';

const dlg = document.getElementById('lightbox');
const img = document.getElementById('lb-img');
const title = document.getElementById('lb-title');
const pos = document.getElementById('lb-pos');
let items = [];
let index = 0;
let opener = null;

function show(i) {
  index = (i + items.length) % items.length;
  const d = items[index];
  img.removeAttribute('srcset');
  img.alt = d.legende;
  const set = imgSrcset(d.src, [828, 1200, 2048]);
  if (set) { img.srcset = set; img.sizes = 'min(100vw, 820px)'; }
  img.src = imgSrc(d.src, 1200);
  img.onerror = () => { img.onerror = null; img.removeAttribute('srcset'); img.src = '/' + d.src.replace(/^\/+/, ''); };
  title.textContent = d.legende;
  pos.textContent = [`${index + 1} / ${items.length}`, d.minutage ? `▶ ${d.minutage}` : '', d.auteur ? `Dessin de ${d.auteur}` : ''].filter(Boolean).join(' · ');
  dlg.querySelectorAll('.lightbox__arrow').forEach((b) => { b.hidden = items.length < 2; });
}

export function openLightbox(list, i, from) {
  items = list;
  opener = from || null;
  show(i);
  dlg.showModal();
  dlg.querySelector('[data-lb="close"]').focus();
}

dlg.addEventListener('click', (e) => {
  const action = e.target.closest('[data-lb]')?.dataset.lb;
  if (action === 'close') dlg.close();
  else if (action === 'prev') show(index - 1);
  else if (action === 'next') show(index + 1);
  else if (e.target === dlg || e.target.classList.contains('lightbox__inner')) dlg.close();
});
dlg.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
});
dlg.addEventListener('close', () => { if (opener) opener.focus(); });
