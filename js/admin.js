// Double M — espace admin.
// L'admin ne parle jamais à GitHub : elle appelle /api, qui vérifie la session à chaque requête.
import { compressImage, blobToBase64 } from './image-compress.js';

const CATS = {
  chronique: { up: 'CHRONIQUE' },
  parents: { up: 'CHRONIQUE DES PARENTS' },
  dessin: { up: '✎ DESSIN RADIO-DESSINÉ' },
};
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const SPOTIFY_RE = /^https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?episode\/[A-Za-z0-9]+/;
const MAX_FILES = 12;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ''; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const badge = (cat, size = 'list') => `<span class="badge badge--${CATS[cat] ? cat : 'chronique'} badge--${size}">${esc((CATS[cat] || CATS.chronique).up)}</span>`;

const state = {
  episodes: [],
  avis: [],
  openAvisId: null,
  confirmAvisId: null,
  version: null,
  view: null,
  confirmId: null,
  editId: null,
  drawings: [],
  cover: null,
  busy: false,
  dirty: false,
  resumeForm: false,
  pollTimer: null,
};

// ---------- Appels à l'API ----------
function onSessionLost() {
  if (!state.view || state.view === 'login') return; // au démarrage, l'écran de connexion s'affiche sans message
  state.resumeForm = state.view === 'form';
  showLogin(state.resumeForm
    ? 'Ta session a expiré. Reconnecte-toi : ton formulaire est gardé.'
    : 'Ta session a expiré. Reconnecte-toi pour continuer.');
}

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'X-DM-Admin': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw { code: 'network', error: 'La connexion a coupé. Vérifie ton réseau.' };
  }
  let data = {};
  try { data = await res.json(); } catch { /* réponse vide */ }
  if (!res.ok) {
    const err = { status: res.status, code: data.code || 'server', error: data.error || `Le serveur a répondu une erreur (${res.status}).`, fields: data.fields };
    if (res.status === 401 && err.code === 'session') onSessionLost();
    throw err;
  }
  return data;
}

function uploadDrawing(d) {
  return new Promise((resolve, reject) => {
    blobToBase64(d.blob).then((data) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('X-DM-Admin', '1');
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(d, Math.round((e.loaded / e.total) * 95)); };
      xhr.onload = () => {
        let body = {};
        try { body = JSON.parse(xhr.responseText); } catch { /* vide */ }
        if (xhr.status >= 200 && xhr.status < 300 && body.sha) { setProgress(d, 100); resolve(body.sha); return; }
        const err = { status: xhr.status, code: body.code || 'server', error: body.error || `L'envoi d'un dessin a échoué (${xhr.status}).` };
        if (xhr.status === 401 && err.code === 'session') onSessionLost();
        reject(err);
      };
      xhr.onerror = () => reject({ code: 'network', error: 'La connexion a coupé pendant l\'envoi.' });
      xhr.send(JSON.stringify({ data }));
    }, () => reject({ code: 'image', error: 'Impossible de lire un des dessins.' }));
  });
}

// ---------- Navigation entre écrans ----------
function show(view) {
  state.view = view;
  $('#view-login').hidden = view !== 'login';
  $('#admin-header').hidden = view === 'login';
  $('#view-list').hidden = view !== 'list';
  $('#view-form').hidden = view !== 'form';
  $('#view-done').hidden = view !== 'done';
  window.scrollTo(0, 0);
  const focus = { list: '#list-title', form: '#form-title', done: '#done-title', login: '#pwd' }[view];
  if (focus) setTimeout(() => $(focus)?.focus(), 30);
  document.title = { login: 'Connexion', list: 'Épisodes', form: state.editId ? "Modifier l'épisode" : 'Nouvel épisode', done: 'Publié' }[view] + ' · Admin Double M';
}

function leaveFormOk() {
  if (state.view !== 'form' || !state.dirty || state.busy) return !state.busy;
  return window.confirm('Quitter sans publier ? Tes modifications seront perdues.');
}

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]')?.dataset.go;
  if (!go) return;
  e.preventDefault();
  if (!leaveFormOk()) return;
  if (go === 'list') { stopPolling(); show('list'); loadList(); }
  if (go === 'new') { stopPolling(); openForm(null); }
});

window.addEventListener('beforeunload', (e) => {
  if (state.busy || (state.view === 'form' && state.dirty)) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- Connexion ----------
function showLogin(message) {
  show('login');
  const err = $('#pwd-err');
  if (message) { err.textContent = message; err.hidden = false; } else { err.hidden = true; }
  $('#pwd').setAttribute('aria-invalid', 'false');
}

$('#pwd-toggle').addEventListener('click', () => {
  const input = $('#pwd');
  const showIt = input.type === 'password';
  input.type = showIt ? 'text' : 'password';
  $('#pwd-toggle').textContent = showIt ? 'Masquer' : 'Afficher';
  $('#pwd-toggle').setAttribute('aria-pressed', String(showIt));
});

$('#pwd').addEventListener('input', () => { $('#pwd-err').hidden = true; $('#pwd').setAttribute('aria-invalid', 'false'); });

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#pwd');
  const err = $('#pwd-err');
  const fail = (msg) => { err.textContent = msg; err.hidden = false; input.setAttribute('aria-invalid', 'true'); input.focus(); };
  if (!input.value) return fail('Entre le mot de passe pour continuer.');
  const btn = $('#login-btn');
  btn.disabled = true; btn.textContent = 'CONNEXION…';
  try {
    await api('POST', '/api/login', { password: input.value });
    input.value = '';
    if (state.resumeForm) {
      state.resumeForm = false;
      show('form');
      formError('Tu es reconnecté. Ton formulaire est intact : tu peux republier.', null, true);
    } else {
      show('list');
      loadList();
    }
  } catch (ex) {
    fail(ex.error);
  } finally {
    btn.disabled = false; btn.textContent = 'SE CONNECTER';
  }
});

$('#logout-btn').addEventListener('click', async () => {
  if (!leaveFormOk()) return;
  stopPolling();
  try { await api('POST', '/api/logout'); } catch { /* on déconnecte l'écran quand même */ }
  state.dirty = false;
  showLogin();
});

// ---------- Liste ----------
function listNotice(kind, html) {
  const box = $('#list-notice');
  if (!kind) { box.innerHTML = ''; return; }
  box.innerHTML = `
    <div class="notice notice--${kind}" role="${kind === 'err' ? 'alert' : 'status'}">
      <span class="notice__icon" aria-hidden="true">${kind === 'ok' ? '✓' : '!'}</span>
      <div class="notice__text">${html}</div>
      <button class="notice__close" type="button" aria-label="Fermer le message">✕</button>
    </div>`;
  $('.notice__close', box).addEventListener('click', () => listNotice(null));
}

async function loadList() {
  $('#rows').innerHTML = '<li class="loading-note">Chargement des épisodes…</li>';
  try {
    const [data, avis] = await Promise.all([
      api('GET', '/api/episodes'),
      api('GET', '/api/avis?all=1').catch((e) => { if (e.code === 'session') throw e; return { avis: [] }; }),
    ]);
    state.episodes = data.episodes;
    state.version = data.version;
    state.avis = avis.avis || [];
    renderList();
  } catch (ex) {
    if (ex.code === 'session') return;
    $('#rows').innerHTML = '';
    listNotice('err', `<strong>Impossible de charger les épisodes.</strong><span>${esc(ex.error)} <button class="inline-link" type="button" id="retry-list">Réessayer</button></span>`);
    $('#retry-list')?.addEventListener('click', () => { listNotice(null); loadList(); });
  }
}

function renderList() {
  const n = state.episodes.length;
  $('#list-count').textContent = n === 0 ? 'Aucun épisode publié' : `${n} épisode${n > 1 ? 's' : ''} publié${n > 1 ? 's' : ''}`;
  if (!n) {
    $('#rows').innerHTML = '<li class="empty">Pas encore d\'épisode. Appuie sur « Nouvel épisode » pour publier le premier.</li>';
    return;
  }
  $('#rows').innerHTML = state.episodes.map((ep) => {
    const confirm = state.confirmId === ep.id;
    const nDraw = (ep.dessins || []).length;
    const epAvis = state.avis.filter((a) => a.episodeId === ep.id);
    const avisOpen = state.openAvisId === ep.id && epAvis.length;
    return `
    <li class="row ${confirm ? 'row--confirm' : ''}" data-id="${esc(ep.id)}">
      <div class="row__main">
        <span class="num-tile num-tile--sm" aria-hidden="true">${esc(ep.numero)}</span>
        <div class="row__info">
          <strong class="row__title"><span class="sr-only">N° ${esc(ep.numero)} : </span>${esc(ep.titre)}</strong>
          <div class="row__meta">${badge(ep.categorie)}<span>${esc(fmtDate(ep.date))}</span>${ep.categorie === 'dessin' ? `<span>· ${nDraw} dessin${nDraw > 1 ? 's' : ''}</span>` : ''}${epAvis.length ? `<span>· ${epAvis.length} avis</span>` : ''}</div>
        </div>
      </div>
      ${confirm ? `
      <div class="confirm" role="alertdialog" aria-labelledby="confirm-${esc(ep.id)}">
        <p id="confirm-${esc(ep.id)}">Supprimer cet épisode du site ? Il restera sur Spotify.</p>
        <div class="confirm__actions">
          <button class="pill-btn pill-btn--white" type="button" data-act="cancel">Annuler</button>
          <button class="pill-btn pill-btn--solid-danger" type="button" data-act="delete">Oui, supprimer</button>
        </div>
      </div>` : `
      <div class="row__actions">
        ${epAvis.length ? `<button class="pill-btn pill-btn--ghost" type="button" data-act="avis" aria-expanded="${avisOpen ? 'true' : 'false'}">Avis (${epAvis.length})</button>` : ''}
        <a class="pill-btn pill-btn--ghost" href="/episode?id=${encodeURIComponent(ep.id)}" target="_blank" rel="noopener">Voir<span class="sr-only"> « ${esc(ep.titre)} » (nouvel onglet)</span></a>
        <button class="pill-btn pill-btn--lav" type="button" data-act="edit"><span aria-hidden="true">✎ </span>Modifier<span class="sr-only"> « ${esc(ep.titre)} »</span></button>
        <button class="pill-btn pill-btn--danger" type="button" data-act="ask">Supprimer<span class="sr-only"> « ${esc(ep.titre)} »</span></button>
      </div>`}
      ${avisOpen ? `
      <ul class="avis-admin" aria-label="Avis sur « ${esc(ep.titre)} »">
        ${epAvis.map((a) => `
        <li class="avis-admin__item" data-avis="${esc(a.id)}">
          <div class="avis-admin__top"><strong>${esc(a.prenom)}</strong><span class="avis-admin__stars" aria-label="${a.note} sur 5">${'★'.repeat(a.note)}<span>${'★'.repeat(5 - a.note)}</span></span><span class="meta">${esc(fmtDate(a.date))}</span></div>
          <p>${esc(a.message)}</p>
          <button class="pill-btn ${state.confirmAvisId === a.id ? 'pill-btn--solid-danger' : 'pill-btn--danger'}" type="button" data-act="del-avis">${state.confirmAvisId === a.id ? 'Oui, supprimer cet avis' : 'Supprimer l\'avis'}<span class="sr-only"> de ${esc(a.prenom)}</span></button>
        </li>`).join('')}
      </ul>` : ''}
    </li>`;
  }).join('');
}

$('#rows').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('.row').dataset.id;
  const ep = state.episodes.find((x) => x.id === id);
  const act = btn.dataset.act;
  if (act === 'edit') return openForm(ep);
  if (act === 'avis') { state.openAvisId = state.openAvisId === id ? null : id; state.confirmAvisId = null; renderList(); $(`.row[data-id="${CSS.escape(id)}"] [data-act="avis"]`)?.focus(); return; }
  if (act === 'del-avis') {
    const avisId = btn.closest('[data-avis]').dataset.avis;
    if (state.confirmAvisId !== avisId) { state.confirmAvisId = avisId; renderList(); $(`[data-avis="${CSS.escape(avisId)}"] [data-act="del-avis"]`)?.focus(); return; }
    btn.disabled = true; btn.textContent = 'Suppression…';
    try {
      await api('DELETE', `/api/avis?id=${encodeURIComponent(avisId)}`);
      state.avis = state.avis.filter((a) => a.id !== avisId);
      state.confirmAvisId = null;
      if (!state.avis.some((a) => a.episodeId === id)) state.openAvisId = null;
      listNotice('ok', 'L\'avis a été supprimé. Il a disparu du site.');
      renderList();
    } catch (ex) {
      state.confirmAvisId = null;
      if (ex.code !== 'session') { listNotice('err', `<strong>La suppression n'a pas marché.</strong><span>${esc(ex.error)}</span>`); renderList(); }
    }
    return;
  }
  if (act === 'ask') { state.confirmId = id; listNotice(null); renderList(); $(`.row[data-id="${CSS.escape(id)}"] [data-act="cancel"]`)?.focus(); return; }
  if (act === 'cancel') { state.confirmId = null; renderList(); $(`.row[data-id="${CSS.escape(id)}"] [data-act="ask"]`)?.focus(); return; }
  if (act === 'delete') {
    btn.disabled = true; btn.textContent = 'Suppression…';
    state.busy = true;
    try {
      await api('DELETE', `/api/episodes?id=${encodeURIComponent(id)}`, { version: state.version });
      state.confirmId = null;
      listNotice('ok', `« ${esc(ep.titre)} » a été retiré du site. Le site sera à jour dans environ 1 minute.`);
      await loadList();
      $('#list-title').focus();
    } catch (ex) {
      state.confirmId = null;
      if (ex.code !== 'session') {
        listNotice('err', `<strong>La suppression n'a pas marché.</strong><span>${esc(ex.error)}</span>`);
        if (ex.code === 'conflict' || ex.code === 'notfound') await loadList(); else renderList();
      }
    } finally {
      state.busy = false;
    }
  }
});

// ---------- Formulaire ----------
const form = $('#ep-form');
const F = (name) => form.elements[name];

function setCategory(cat) {
  $$('input[name="categorie"]', form).forEach((r) => { r.checked = r.value === cat; });
  $('#drawings-field').hidden = cat !== 'dessin';
}

function openForm(ep) {
  state.editId = ep ? ep.id : null;
  state.drawings.forEach((d) => d.file && URL.revokeObjectURL(d.url));
  state.drawings = (ep?.dessins || []).map((d, i) => ({ key: `e${i}-${Date.now()}`, src: d.src, url: '/' + d.src, legende: d.legende || '', minutage: d.minutage || '', auteur: d.auteur || '' }));
  if (state.cover && state.cover.blob) URL.revokeObjectURL(state.cover.url);
  state.cover = ep?.pochette ? { src: ep.pochette, url: '/' + ep.pochette } : null;
  form.reset();
  F('titre').value = ep?.titre || '';
  F('date').value = ep?.date || today();
  F('duree').value = ep?.duree || '';
  F('auteurs').value = ep?.auteurs || '';
  F('description').value = ep?.description || '';
  F('spotifyUrl').value = ep?.spotifyUrl || '';
  setCategory(ep?.categorie || 'chronique');
  const next = state.episodes.reduce((m, x) => Math.max(m, Number(x.numero) || 0), 0) + 1;
  $('#f-num').textContent = `${ep ? ep.numero : next} (automatique)`;
  $('#form-title').textContent = ep ? "MODIFIER L'ÉPISODE" : 'NOUVEL ÉPISODE';
  $('#publish-btn').textContent = ep ? 'ENREGISTRER' : 'PUBLIER';
  clearErrors();
  formError(null);
  updateDescCount();
  renderDrawings();
  renderCover();
  state.dirty = false;
  show('form');
}

form.addEventListener('input', (e) => {
  state.dirty = true;
  if (e.target.name === 'description') updateDescCount();
  if (e.target.name && e.target.getAttribute('aria-invalid') === 'true') fieldError(e.target.name === 'categorie' ? 'categorie' : e.target.name, null);
});
form.addEventListener('change', (e) => {
  if (e.target.name === 'categorie') { setCategory(e.target.value); fieldError('categorie', null); }
});

function updateDescCount() { $('#desc-count').textContent = `${F('description').value.length} / 600`; }

function fieldError(name, msg) {
  const p = $(`#e-${name}`);
  if (!p) return;
  p.textContent = msg || '';
  p.hidden = !msg;
  const input = { titre: F('titre'), date: F('date'), description: F('description'), spotifyUrl: F('spotifyUrl') }[name];
  if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  if (name === 'spotifyUrl') $('#spotify-help').hidden = !!msg;
}

function clearErrors() { ['titre', 'date', 'categorie', 'description', 'spotifyUrl', 'pochette', 'dessins'].forEach((n) => fieldError(n, null)); $$('.dr .input').forEach((i) => i.setAttribute('aria-invalid', 'false')); }

function formError(message, actionLabel, soft) {
  const box = $('#form-error');
  if (!message) { box.hidden = true; return; }
  $('strong', box).textContent = soft ? 'C\'est reparti.' : 'Oups, ça n\'a pas marché.';
  const msg = $('#form-error-msg');
  msg.textContent = message + ' ';
  if (actionLabel) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'inline-link'; b.textContent = actionLabel.label;
    b.addEventListener('click', actionLabel.run);
    msg.appendChild(b);
  }
  box.classList.toggle('notice--ok', !!soft);
  box.classList.toggle('notice--err', !soft);
  $('.notice__icon', box).textContent = soft ? '✓' : '!';
  box.hidden = false;
  box.focus();
}

function collect() {
  return {
    titre: F('titre').value.trim(),
    date: F('date').value,
    categorie: ($$('input[name="categorie"]', form).find((r) => r.checked) || {}).value,
    description: F('description').value.trim(),
    spotifyUrl: F('spotifyUrl').value.trim(),
    duree: F('duree').value.trim(),
    auteurs: F('auteurs').value.trim(),
  };
}

function validate(ep) {
  const errs = {};
  if (!ep.titre) errs.titre = "Donne un titre à l'épisode.";
  if (!ep.date) errs.date = 'Choisis une date de diffusion.';
  if (!ep.categorie) errs.categorie = 'Choisis une catégorie.';
  if (!ep.description) errs.description = "Écris quelques lignes pour présenter l'épisode.";
  if (!SPOTIFY_RE.test(ep.spotifyUrl)) errs.spotifyUrl = 'Ce lien ne mène pas à un épisode. Il doit commencer par https://open.spotify.com/episode/';
  if (state.cover && state.cover.status === 'prep') errs.pochette = 'Attends la fin de la préparation de la pochette.';
  if (ep.categorie === 'dessin') {
    if (!state.drawings.length) errs.dessins = 'Ajoute au moins un dessin pour un épisode radio-dessiné.';
    else if (state.drawings.some((d) => d.status === 'prep')) errs.dessins = 'Attends la fin de la préparation des dessins.';
    else if (state.drawings.some((d) => !d.legende.trim())) errs.dessins = 'Chaque dessin a besoin d\'une légende (elle décrit le dessin à ceux qui ne le voient pas).';
    else if (state.drawings.some((d) => d.minutage.trim() && !/^\d{1,2}:[0-5]\d$/.test(d.minutage.trim()))) errs.dessins = 'Le minutage s\'écrit en minutes:secondes, par exemple 06:40.';
  }
  return errs;
}

function showErrors(errs) {
  clearErrors();
  Object.entries(errs).forEach(([k, v]) => fieldError(k, v));
  if (errs.dessins) {
    state.drawings.forEach((d) => {
      const li = $(`.dr[data-key="${d.key}"]`);
      if (!li) return;
      $('[data-f="legende"]', li).setAttribute('aria-invalid', d.legende.trim() ? 'false' : 'true');
      $('[data-f="minutage"]', li).setAttribute('aria-invalid', d.minutage.trim() && !/^\d{1,2}:[0-5]\d$/.test(d.minutage.trim()) ? 'true' : 'false');
    });
  }
  const n = Object.keys(errs).length;
  formError(`${n > 1 ? `${n} champs sont à corriger` : 'Un champ est à corriger'} (en rouge). Rien n'est perdu, corrige et republie.`);
}

function setBusy(on, message) {
  state.busy = on;
  form.classList.toggle('is-busy', on);
  form.setAttribute('aria-busy', String(on));
  $('#form-loading').hidden = !on;
  if (message) $('#loading-msg').textContent = message;
  const btn = $('#publish-btn');
  btn.disabled = on;
  btn.innerHTML = on ? '<span class="spinner" aria-hidden="true"></span>PUBLICATION…' : (state.editId ? 'ENREGISTRER' : 'PUBLIER');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.busy) return;
  formError(null);
  const ep = collect();
  const errs = validate(ep);
  if (Object.keys(errs).length) return showErrors(errs);
  clearErrors();

  const isDessin = ep.categorie === 'dessin';
  const toUpload = isDessin ? state.drawings.filter((d) => d.blob && !d.upload) : [];
  const coverToUpload = state.cover && state.cover.blob && !state.cover.upload ? state.cover : null;
  const n = toUpload.length;
  setBusy(true, n
    ? `On envoie ${n} dessin${n > 1 ? 's' : ''}${coverToUpload ? ' et la pochette' : ''}, ne ferme pas la page.`
    : (coverToUpload ? 'On envoie la pochette, ne ferme pas la page.' : 'Ça prend quelques secondes.'));
  try {
    if (coverToUpload) coverToUpload.upload = await uploadDrawing(coverToUpload);
    for (const d of toUpload) {
      setProgress(d, 2);
      d.upload = await uploadDrawing(d); // gardé : en cas de nouvel essai, on ne renvoie pas l'image
    }
    $('#loading-msg').textContent = 'On enregistre l\'épisode…';
    ep.pochette = state.cover ? (state.cover.upload ? { upload: state.cover.upload } : { src: state.cover.src }) : null;
    ep.dessins = isDessin ? state.drawings.map((d) => ({
      ...(d.upload ? { upload: d.upload } : { src: d.src }),
      legende: d.legende.trim(), minutage: d.minutage.trim(), auteur: d.auteur.trim(),
    })) : [];
    const res = state.editId
      ? await api('PUT', `/api/episodes?id=${encodeURIComponent(state.editId)}`, { episode: ep, version: state.version })
      : await api('POST', '/api/episodes', { episode: ep, version: state.version });
    setBusy(false);
    state.dirty = false;
    showDone(res.episode, !state.editId);
  } catch (ex) {
    setBusy(false);
    state.drawings.forEach((d) => setProgress(d, null));
    if (ex.code === 'session') return;
    if (ex.fields) { showErrors(ex.fields); return; }
    if (ex.code === 'network') {
      formError('La connexion a coupé pendant l\'envoi. Rien n\'est perdu :', { label: 'réessayer', run: () => form.requestSubmit() });
    } else if (ex.code === 'conflict') {
      formError(ex.error + ' Ton formulaire est gardé.', { label: 'Recharger les épisodes', run: refreshVersion });
    } else {
      formError(ex.error + ' Rien n\'est perdu.');
    }
  }
});

async function refreshVersion() {
  try {
    const data = await api('GET', '/api/episodes');
    state.episodes = data.episodes;
    state.version = data.version;
    if (state.editId && !data.episodes.some((x) => x.id === state.editId)) {
      formError('Cet épisode a été supprimé entre-temps. Tu peux le recréer avec « Nouvel épisode ».');
      return;
    }
    formError('Les épisodes sont à jour. Vérifie ton formulaire, puis republie.', null, true);
  } catch (ex) {
    if (ex.code !== 'session') formError(ex.error);
  }
}

// ---------- Pochette carrée ----------
const coverInput = $('#f-cover');
function renderCover() {
  const box = $('#cover-preview');
  const c = state.cover;
  box.classList.toggle('has-img', !!(c && c.url));
  box.innerHTML = c && c.url ? `<img src="${esc(c.url)}" alt="">` : `<span class="cover-field__empty">${c && c.status === 'prep' ? 'Préparation…' : 'Pas de pochette'}</span>`;
  $('#cover-remove').hidden = !c;
  $('#cover-pick-label').textContent = c ? 'Changer l\'image' : 'Choisir une image';
}
coverInput.addEventListener('change', async () => {
  const file = coverInput.files[0];
  coverInput.value = '';
  if (!file) return;
  if (!/^image\/(jpeg|png)$/.test(file.type)) return fieldError('pochette', 'La pochette doit être en JPG ou en PNG.');
  if (file.size > MAX_FILE_BYTES) return fieldError('pochette', 'Cette image fait plus de 10 Mo. Choisis une version plus légère.');
  fieldError('pochette', null);
  if (state.cover && state.cover.blob) URL.revokeObjectURL(state.cover.url);
  const item = { status: 'prep', url: '' };
  state.cover = item; state.dirty = true; renderCover();
  try {
    const out = await compressImage(file, { square: true, maxSide: 1400 });
    if (state.cover !== item) return; // remplacée entre-temps
    item.blob = out.blob; item.url = URL.createObjectURL(out.blob); item.status = 'ready';
  } catch {
    if (state.cover === item) state.cover = null;
    fieldError('pochette', 'Impossible de lire cette image. Essaie avec un autre fichier.');
  }
  renderCover();
});
$('#cover-remove').addEventListener('click', () => {
  if (state.cover && state.cover.blob) URL.revokeObjectURL(state.cover.url);
  state.cover = null; state.dirty = true; fieldError('pochette', null); renderCover();
  coverInput.focus();
});

// ---------- Dessins : ajout, aperçu, compression, ordre ----------
const drop = $('#drop');
const fileInput = $('#f-files');

function renderDrawings() {
  $('#draw-count').textContent = `${state.drawings.length} / ${MAX_FILES}`;
  const n = state.drawings.length;
  $('#drawings').innerHTML = state.drawings.map((d, i) => `
    <li class="dr" data-key="${d.key}">
      <div class="dr__thumb" draggable="true" title="Glisse pour changer l'ordre">
        ${d.url ? `<img src="${esc(d.url)}" alt="">` : '<div class="paper__hatch"></div>'}
        <span class="dr__n" aria-hidden="true">${i + 1}</span>
        <button class="dr__remove" type="button" data-dr="remove" aria-label="Retirer le dessin ${i + 1}">✕</button>
        <div class="dr__progress" ${d.status === 'prep' || d.pct != null ? '' : 'hidden'}>
          <span class="dr__bar"><i style="width:${d.pct || 0}%"></i></span>
          <span class="dr__pct">${d.status === 'prep' ? 'Préparation…' : `${d.pct || 0} %`}</span>
        </div>
      </div>
      <div class="dr__fields">
        <div class="field">
          <label class="field__label" for="leg-${d.key}">Légende du dessin ${i + 1}</label>
          <input class="input input--sm" id="leg-${d.key}" data-f="legende" maxlength="120" value="${esc(d.legende)}" placeholder="Ex. : Le dragon dans sa grotte">
        </div>
        <div class="grid-2">
          <div class="field">
            <label class="field__label" for="min-${d.key}">Minutage <span class="opt">facultatif</span></label>
            <input class="input input--sm" id="min-${d.key}" data-f="minutage" maxlength="5" inputmode="numeric" value="${esc(d.minutage)}" placeholder="06:40">
          </div>
          <div class="field">
            <label class="field__label" for="aut-${d.key}">Auteur <span class="opt">facultatif</span></label>
            <input class="input input--sm" id="aut-${d.key}" data-f="auteur" maxlength="40" value="${esc(d.auteur)}" placeholder="Marin">
          </div>
        </div>
        <div class="dr__order">
          <button type="button" data-dr="up" aria-label="Monter le dessin ${i + 1}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" data-dr="down" aria-label="Descendre le dessin ${i + 1}" ${i === n - 1 ? 'disabled' : ''}>↓</button>
        </div>
      </div>
    </li>`).join('');
}

function setProgress(d, pct) {
  d.pct = pct;
  const li = $(`.dr[data-key="${d.key}"]`);
  if (!li) return;
  const box = $('.dr__progress', li);
  box.hidden = pct == null && d.status !== 'prep';
  $('.dr__bar i', li).style.width = `${pct || 0}%`;
  $('.dr__pct', li).textContent = d.status === 'prep' ? 'Préparation…' : `${pct || 0} %`;
}

async function addFiles(list) {
  const files = [...(list || [])];
  const rejected = [];
  const room = MAX_FILES - state.drawings.length;
  const ok = [];
  for (const f of files) {
    if (!/^image\/(jpeg|png)$/.test(f.type)) rejected.push(`${f.name} (ni JPG ni PNG)`);
    else if (f.size > MAX_FILE_BYTES) rejected.push(`${f.name} (plus de 10 Mo)`);
    else if (ok.length >= room) rejected.push(`${f.name} (12 dessins maximum)`);
    else ok.push(f);
  }
  fieldError('dessins', rejected.length ? `Pas ajouté : ${rejected.join(', ')}.` : null);
  if (!ok.length) return;
  state.dirty = true;
  const items = ok.map((file, i) => ({ key: `n${Date.now()}-${i}`, file, url: '', legende: '', minutage: '', auteur: '', status: 'prep' }));
  state.drawings.push(...items);
  renderDrawings();
  for (const d of items) {
    try {
      const out = await compressImage(d.file);
      d.blob = out.blob;
      d.url = URL.createObjectURL(out.blob); // aperçu = l'image exacte qui sera envoyée
      d.status = 'ready';
    } catch {
      state.drawings = state.drawings.filter((x) => x !== d);
      fieldError('dessins', `Impossible de lire ${d.file.name}. Essaie avec un autre fichier.`);
    }
    // on remet à jour seulement la vignette, pour ne pas perdre la saisie en cours
    const li = $(`.dr[data-key="${d.key}"]`);
    if (li && d.url) {
      $('.dr__thumb', li).insertAdjacentHTML('afterbegin', `<img src="${esc(d.url)}" alt="">`);
      $('.paper__hatch', li)?.remove();
      setProgress(d, null);
    } else if (!li || !d.url) {
      renderDrawings();
    }
  }
}

fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
drop.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); drop.classList.add('is-over'); } });
drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
drop.addEventListener('drop', (e) => {
  if (!e.dataTransfer.files.length) return;
  e.preventDefault(); drop.classList.remove('is-over'); addFiles(e.dataTransfer.files);
});

function move(from, to, focusSel) {
  if (to < 0 || to >= state.drawings.length) return;
  const [d] = state.drawings.splice(from, 1);
  state.drawings.splice(to, 0, d);
  state.dirty = true;
  renderDrawings();
  if (focusSel) {
    const li = $(`.dr[data-key="${d.key}"]`);
    const target = $(focusSel, li);
    (target && !target.disabled ? target : $('[data-dr="up"]:not(:disabled), [data-dr="down"]:not(:disabled)', li))?.focus();
  }
}

const drawingsEl = $('#drawings');
drawingsEl.addEventListener('input', (e) => {
  const f = e.target.dataset.f;
  if (!f) return;
  const d = state.drawings.find((x) => x.key === e.target.closest('.dr').dataset.key);
  if (d) d[f] = e.target.value;
  e.target.setAttribute('aria-invalid', 'false');
});
drawingsEl.addEventListener('click', (e) => {
  const act = e.target.closest('[data-dr]')?.dataset.dr;
  if (!act) return;
  const key = e.target.closest('.dr').dataset.key;
  const i = state.drawings.findIndex((x) => x.key === key);
  if (act === 'remove') {
    const [d] = state.drawings.splice(i, 1);
    if (d.file && d.url) URL.revokeObjectURL(d.url);
    state.dirty = true;
    renderDrawings();
    const next = $$('.dr')[Math.min(i, state.drawings.length - 1)];
    (next ? $('[data-dr="remove"]', next) : fileInput).focus();
  }
  if (act === 'up') move(i, i - 1, '[data-dr="up"]');
  if (act === 'down') move(i, i + 1, '[data-dr="down"]');
});

// Glisser-déposer pour réordonner (souris / tablette)
let dragKey = null;
drawingsEl.addEventListener('dragstart', (e) => {
  const li = e.target.closest('.dr');
  if (!li) return;
  dragKey = li.dataset.key;
  li.classList.add('is-dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragKey);
});
drawingsEl.addEventListener('dragover', (e) => {
  if (!dragKey) return;
  e.preventDefault();
  $$('.dr.is-target').forEach((x) => x.classList.remove('is-target'));
  e.target.closest('.dr')?.classList.add('is-target');
});
drawingsEl.addEventListener('drop', (e) => {
  if (!dragKey) return;
  e.preventDefault();
  const target = e.target.closest('.dr');
  const from = state.drawings.findIndex((x) => x.key === dragKey);
  const to = target ? state.drawings.findIndex((x) => x.key === target.dataset.key) : state.drawings.length - 1;
  dragKey = null;
  move(from, to);
});
drawingsEl.addEventListener('dragend', () => { dragKey = null; $$('.dr').forEach((x) => x.classList.remove('is-dragging', 'is-target')); });

// ---------- Publié ----------
function stopPolling() { clearTimeout(state.pollTimer); state.pollTimer = null; }

function showDone(ep, isNew) {
  const n = (ep.dessins || []).length;
  $('#done-title').textContent = 'Publié !';
  $('#done-text').textContent = `« ${ep.titre} » est ${isNew ? 'publié' : 'enregistré'}${ep.categorie === 'dessin' && n ? ` avec ${n} dessin${n > 1 ? 's' : ''}` : ''}. Le site sera à jour dans environ 1 minute.`;
  $('#done-recap').innerHTML = `
    <span class="num-tile num-tile--sm" aria-hidden="true">${esc(ep.numero)}</span>
    <div>${badge(ep.categorie)}<span class="meta">${esc(fmtDate(ep.date))} · N° ${esc(ep.numero)}</span></div>`;
  $('#done-view').href = `/episode?id=${encodeURIComponent(ep.id)}`;
  const live = $('#done-live');
  live.classList.remove('is-live');
  live.textContent = 'Mise en ligne en cours…';
  show('done');

  // On surveille le site public jusqu'à ce que l'épisode y apparaisse.
  stopPolling();
  const started = Date.now();
  const check = async () => {
    try {
      const res = await fetch(`/data/episodes.json?t=${Date.now()}`, { cache: 'no-store' });
      const list = await res.json();
      const found = list.find((x) => x.id === ep.id);
      if (found && JSON.stringify(found) === JSON.stringify(ep)) {
        live.textContent = '✓ C\'est en ligne ! Tu peux aller voir.';
        live.classList.add('is-live');
        $('#done-title').textContent = 'C\'est en ligne !';
        return;
      }
    } catch { /* on réessaie */ }
    if (Date.now() - started > 5 * 60000) { live.textContent = 'Ça prend plus longtemps que d\'habitude. Regarde à nouveau dans quelques minutes.'; return; }
    state.pollTimer = setTimeout(check, 8000);
  };
  state.pollTimer = setTimeout(check, 15000);
}

// ---------- Démarrage ----------
(async () => {
  try {
    await api('GET', '/api/session');
    show('list');
    loadList();
  } catch (ex) {
    showLogin(ex.code === 'config' || ex.code === 'server' ? ex.error : null);
  }
})();
