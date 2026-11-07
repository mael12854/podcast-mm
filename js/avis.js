// Avis des auditeurs sur la page épisode : liste, moyenne et formulaire (publication immédiate).
import { esc, fmtDate } from './site.js';

const SHOW_FIRST = 5;

function stars(note) {
  const n = Math.round(note);
  return `<span class="stars" role="img" aria-label="${note.toString().replace('.', ',')} étoile${note > 1 ? 's' : ''} sur 5">${
    [1, 2, 3, 4, 5].map((i) => `<span class="${i <= n ? 'on' : 'off'}" aria-hidden="true">★</span>`).join('')}</span>`;
}

function reviewItem(a, isNew = false) {
  return `
    <li class="review ${isNew ? 'review--new' : ''}">
      <div class="review__top"><span class="review__name">${esc(a.prenom)}</span>${stars(a.note)}</div>
      <p class="review__msg">${esc(a.message)}</p>
      <span class="meta">${esc(fmtDate(a.date, true))}</span>
    </li>`;
}

export function initReviews(section, ep) {
  let data = { avis: [], total: 0, moyenne: null };
  let showAll = false;
  let newId = null;
  const shownAt = Date.now();

  section.innerHTML = `
    <div class="reviews__head">
      <h2 id="reviews-title">LES AVIS</h2>
      <div class="reviews__avg" id="reviews-avg" aria-live="polite"></div>
    </div>
    <div class="reviews__grid">
      <div>
        <ul class="reviews__list" id="reviews-list"><li class="loading-note">Chargement des avis…</li></ul>
      </div>
      <form class="review-form" id="review-form" novalidate aria-labelledby="review-form-title">
        <h3 id="review-form-title">Donne ton avis</h3>
        <p>Ton avis est publié tout de suite sous l'épisode. Pas de lien, et reste sympa : Maël et Marin le liront.</p>
        <div class="field">
          <label class="field__label" for="r-prenom">Ton prénom</label>
          <input class="input" id="r-prenom" name="prenom" maxlength="30" autocomplete="given-name" placeholder="Ex. : Léa" aria-describedby="re-prenom">
          <p class="err" id="re-prenom" hidden></p>
        </div>
        <fieldset class="field" aria-describedby="re-note">
          <legend class="field__label">Ta note</legend>
          <div class="star-input" role="radiogroup">
            ${[1, 2, 3, 4, 5].map((i) => `<label><input type="radio" name="note" value="${i}"><span aria-hidden="true">★</span><span class="sr-only">${i} étoile${i > 1 ? 's' : ''} sur 5</span></label>`).join('')}
          </div>
          <p class="err" id="re-note" hidden></p>
        </fieldset>
        <div class="field">
          <label class="field__label" for="r-message">Ton message <span class="field__count" id="r-count" aria-hidden="true">0 / 300</span></label>
          <textarea class="input" id="r-message" name="message" rows="4" maxlength="300" placeholder="Qu'est-ce qui t'a fait rire, ou appris quelque chose ?" aria-describedby="re-message" style="min-height:120px"></textarea>
          <p class="err" id="re-message" hidden></p>
        </div>
        <div class="hp" aria-hidden="true">
          <label for="r-site">Ne pas remplir</label>
          <input id="r-site" name="site" tabindex="-1" autocomplete="off">
        </div>
        <button class="btn btn--outline" type="submit" id="r-submit">PUBLIER MON AVIS</button>
        <p class="review-form__status" id="r-status" role="status" tabindex="-1"></p>
      </form>
    </div>`;

  const list = section.querySelector('#reviews-list');
  const avg = section.querySelector('#reviews-avg');
  const form = section.querySelector('#review-form');
  const status = section.querySelector('#r-status');
  const btn = section.querySelector('#r-submit');

  function render() {
    avg.innerHTML = data.total
      ? `${stars(data.moyenne)}<strong>${String(data.moyenne).replace('.', ',')}</strong><span>/ 5 · ${data.total} avis</span>`
      : '';
    if (!data.total) {
      list.innerHTML = '<li class="empty">Pas encore d\'avis sur cet épisode. Sois le premier à donner le tien !</li>';
      return;
    }
    const shown = showAll ? data.avis : data.avis.slice(0, SHOW_FIRST);
    list.innerHTML = shown.map((a) => reviewItem(a, a.id === newId)).join('')
      + (data.total > shown.length ? `<li><button class="btn btn--text reviews__more" type="button" id="r-more">VOIR LES ${data.total} AVIS →</button></li>` : '');
    section.querySelector('#r-more')?.addEventListener('click', () => { showAll = true; render(); });
  }

  // Étoiles : on allume jusqu'à la note choisie
  const starLabels = [...form.querySelectorAll('.star-input label')];
  const paintStars = () => {
    const v = Number((form.querySelector('input[name="note"]:checked') || {}).value || 0);
    starLabels.forEach((l, i) => l.classList.toggle('on', i < v));
  };
  form.addEventListener('change', (e) => { if (e.target.name === 'note') { paintStars(); fieldErr('note', null); } });
  form.addEventListener('input', (e) => {
    if (e.target.name === 'message') section.querySelector('#r-count').textContent = `${e.target.value.length} / 300`;
    if (e.target.name === 'prenom' || e.target.name === 'message') fieldErr(e.target.name, null);
  });

  function fieldErr(name, msg) {
    const p = section.querySelector(`#re-${name}`);
    if (!p) return;
    p.textContent = msg || '';
    p.hidden = !msg;
    const input = form.elements[name];
    if (input && input.setAttribute) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = '';
    const payload = {
      episodeId: ep.id,
      prenom: form.elements.prenom.value.trim(),
      note: Number((form.querySelector('input[name="note"]:checked') || {}).value || 0),
      message: form.elements.message.value.trim(),
      site: form.elements.site.value,
      t: Date.now() - shownAt,
    };
    const errs = {};
    if (!payload.prenom) errs.prenom = 'Écris ton prénom (ou un pseudo).';
    if (!payload.note) errs.note = 'Choisis une note, de 1 à 5 étoiles.';
    if (payload.message.length < 3) errs.message = 'Écris quelques mots sur l\'épisode.';
    ['prenom', 'note', 'message'].forEach((k) => fieldErr(k, errs[k]));
    if (Object.keys(errs).length) { form.querySelector('[aria-invalid="true"], input[name="note"]')?.focus(); return; }

    btn.disabled = true; btn.textContent = 'PUBLICATION…';
    try {
      const res = await fetch('/api/avis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-DM-Admin': '1' },
        body: JSON.stringify(payload),
      });
      let body = {};
      try { body = await res.json(); } catch { /* vide */ }
      if (!res.ok) {
        if (body.fields) { Object.entries(body.fields).forEach(([k, v]) => fieldErr(k, v)); return; }
        throw new Error(body.error || 'Ton avis n\'a pas pu être publié. Réessaie dans un instant.');
      }
      if (body.total) {
        data = { avis: body.avis, total: body.total, moyenne: body.moyenne };
        newId = body.avis.find((a) => a.prenom === payload.prenom && a.message === payload.message)?.id || null;
        showAll = false;
        render();
      }
      form.reset(); paintStars();
      section.querySelector('#r-count').textContent = '0 / 300';
      status.textContent = 'Merci ! Ton avis est publié.';
      status.focus();
    } catch (err) {
      status.innerHTML = `<span class="err">${esc(err.message === 'Failed to fetch' ? 'La connexion a coupé. Vérifie ton réseau et réessaie.' : err.message)}</span>`;
    } finally {
      btn.disabled = false; btn.textContent = 'PUBLIER MON AVIS';
    }
  });

  fetch(`/api/avis?episode=${encodeURIComponent(ep.id)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((d) => { data = d; render(); })
    .catch(() => { list.innerHTML = '<li class="empty">Les avis ne sont pas disponibles pour le moment.</li>'; });
}
