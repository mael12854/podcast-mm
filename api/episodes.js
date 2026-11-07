// /api/episodes
//   GET                       → { episodes, version }
//   POST   { episode, version } → ajoute un épisode
//   PUT    ?id=… { episode, version } → modifie un épisode
//   DELETE ?id=… { version }   → supprime un épisode
// Chaque action = un commit (episodes.json + images/dessins/).
import crypto from 'node:crypto';
import { handler, requireSession, readBody, send, HttpError } from './_lib/auth.js';
import { readEpisodes, commit } from './_lib/github.js';

const CATS = ['chronique', 'parents', 'dessin'];
const SPOTIFY_RE = /^https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?episode\/[A-Za-z0-9]+/;

function slugify(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' et ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'episode';
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function validate(input, { id, existing }) {
  const errors = {};
  const ep = {
    id,
    numero: 0,
    titre: str(input.titre, 120).replace(/\s+/g, ' '),
    date: str(input.date, 10),
    categorie: input.categorie,
    description: typeof input.description === 'string' ? input.description.replace(/\r\n/g, '\n').trim().slice(0, 600) : '',
    spotifyUrl: str(input.spotifyUrl, 300),
  };
  if (!ep.titre) errors.titre = "Donne un titre à l'épisode.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ep.date) || Number.isNaN(Date.parse(ep.date))) errors.date = 'Choisis une date de diffusion.';
  if (!CATS.includes(ep.categorie)) errors.categorie = 'Choisis une catégorie.';
  if (!ep.description) errors.description = "Écris quelques lignes pour présenter l'épisode.";
  if (!SPOTIFY_RE.test(ep.spotifyUrl)) errors.spotifyUrl = 'Ce lien ne mène pas à un épisode. Il doit commencer par https://open.spotify.com/episode/';
  ep.spotifyUrl = ep.spotifyUrl.split('?')[0];
  const duree = str(input.duree, 20); if (duree) ep.duree = duree;
  const auteurs = str(input.auteurs, 80); if (auteurs) ep.auteurs = auteurs;

  const add = [];
  if (ep.categorie === 'dessin') {
    const list = Array.isArray(input.dessins) ? input.dessins : [];
    if (!list.length) errors.dessins = 'Ajoute au moins un dessin pour un épisode radio-dessiné.';
    if (list.length > 12) errors.dessins = '12 dessins maximum par épisode.';
    const allowed = new Set((existing?.dessins || []).map((d) => d.src));
    ep.dessins = list.slice(0, 12).map((d, i) => {
      const out = { src: '', legende: str(d.legende, 120) };
      if (!out.legende) errors.dessins = errors.dessins || 'Chaque dessin a besoin d\'une légende (elle décrit le dessin à ceux qui ne le voient pas).';
      const minutage = str(d.minutage, 8);
      if (minutage) {
        if (!/^\d{1,2}:[0-5]\d$/.test(minutage)) errors.dessins = errors.dessins || 'Le minutage s\'écrit en minutes:secondes, par exemple 06:40.';
        out.minutage = minutage;
      }
      const auteur = str(d.auteur, 40); if (auteur) out.auteur = auteur;
      if (typeof d.upload === 'string' && /^[0-9a-f]{40}$/.test(d.upload)) {
        out.src = `images/dessins/${id}/${String(i + 1).padStart(2, '0')}-${crypto.randomBytes(3).toString('hex')}.jpg`;
        add.push({ path: out.src, sha: d.upload });
      } else if (typeof d.src === 'string' && allowed.has(d.src)) {
        out.src = d.src;
      } else {
        errors.dessins = errors.dessins || 'Un des dessins est introuvable. Retire-le et ajoute-le à nouveau.';
      }
      return out;
    });
  }
  if (Object.keys(errors).length) {
    const e = new HttpError(422, Object.keys(errors).length > 1 ? `${Object.keys(errors).length} champs sont à corriger (en rouge).` : 'Un champ est à corriger (en rouge).', 'validation');
    e.fields = errors;
    throw e;
  }
  return { ep, add };
}

const serialize = (list) => JSON.stringify(list, null, 2) + '\n';
const sortList = (list) => [...list].sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.numero) - Number(a.numero));
const drawingPaths = (ep) => (ep?.dessins || []).map((d) => d.src).filter((s) => typeof s === 'string' && s.startsWith('images/dessins/'));

function checkVersion(current, version) {
  if (!version || version !== current.version) {
    throw new HttpError(409, 'Les épisodes ont changé depuis que tu as ouvert l\'admin (une autre publication ?). Recharge la liste, puis refais ta modification.', 'conflict');
  }
}

async function run(req, res) {
  requireSession(req);
  if (req.method === 'GET') {
    const { episodes, version } = await readEpisodes();
    return send(res, 200, { episodes: sortList(episodes), version });
  }

  const body = readBody(req);
  const current = await readEpisodes();
  checkVersion(current, body.version);
  const list = current.episodes;
  const id = typeof req.query.id === 'string' ? req.query.id : '';

  if (req.method === 'POST') {
    const input = body.episode || {};
    let base = slugify(input.titre || ''); let slug = base; let n = 2;
    while (list.some((e) => e.id === slug)) slug = `${base}-${n++}`;
    const { ep, add } = validate(input, { id: slug, existing: null });
    ep.numero = list.reduce((m, e) => Math.max(m, Number(e.numero) || 0), 0) + 1;
    const next = sortList([...list, ep]);
    await commit({ baseCommitSha: current.commitSha, json: serialize(next), add, message: `Ajout épisode : ${ep.titre}` });
    return send(res, 201, { episode: ep });
  }

  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) throw new HttpError(404, 'Cet épisode n\'existe plus (il a peut-être déjà été supprimé). Recharge la liste.', 'notfound');
  const old = list[idx];

  if (req.method === 'PUT') {
    const { ep, add } = validate(body.episode || {}, { id: old.id, existing: old });
    ep.numero = old.numero;
    const kept = new Set(drawingPaths(ep));
    const remove = drawingPaths(old).filter((p) => !kept.has(p));
    const next = list.slice(); next[idx] = ep;
    await commit({ baseCommitSha: current.commitSha, json: serialize(sortList(next)), add, remove, message: `Modification épisode : ${ep.titre}` });
    return send(res, 200, { episode: ep });
  }

  // DELETE
  const next = list.filter((e) => e.id !== id);
  await commit({ baseCommitSha: current.commitSha, json: serialize(next), remove: drawingPaths(old), message: `Suppression épisode : ${old.titre}` });
  return send(res, 200, { deleted: old.id, titre: old.titre });
}

export default handler(['GET', 'POST', 'PUT', 'DELETE'], run);
