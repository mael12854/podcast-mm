// /api/avis
//   GET    ?episode=<id>  (public)  → { avis, total, moyenne } pour un épisode
//   GET    ?all=1         (admin)   → { avis } : tous les avis
//   POST   { episodeId, prenom, note, message } (public) → publie l'avis tout de suite
//   DELETE ?id=<id>       (admin)   → supprime un avis
// Les avis sont stockés dans data/avis.json (un commit par avis). Ces commits ne redéploient pas
// le site (voir ignoreCommand dans vercel.json) : les avis sont lus en direct par cette fonction.
import crypto from 'node:crypto';
import { handler, requireSession, readBody, send, HttpError, clientIp } from './_lib/auth.js';
import { headSha, readJsonList, commitWithRetry, serialize, DATA_PATH, AVIS_PATH } from './_lib/github.js';

const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|fr|net|org|io|be|ch|ly|gg|xyz)\b)/i;

// Garde-fou anti-abus : 3 avis maximum par personne toutes les 10 minutes (par instance, au mieux).
const recent = new Map();
function checkRate(ip) {
  const now = Date.now();
  const list = (recent.get(ip) || []).filter((t) => now - t < 10 * 60000);
  if (list.length >= 3) throw new HttpError(429, 'Tu as déjà donné plusieurs avis. Attends quelques minutes avant d\'en écrire un autre.', 'rate');
  list.push(now);
  recent.set(ip, list);
}

const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const publicAvis = (a) => ({ id: a.id, prenom: a.prenom, note: a.note, message: a.message, date: a.date });
const byDate = (a, b) => String(b.date).localeCompare(String(a.date));

function summary(list, episodeId) {
  const avis = list.filter((a) => a.episodeId === episodeId).sort(byDate).map(publicAvis);
  const moyenne = avis.length ? Math.round((avis.reduce((s, a) => s + a.note, 0) / avis.length) * 10) / 10 : null;
  return { avis, total: avis.length, moyenne };
}

function validate(body) {
  const fields = {};
  const prenom = clean(body.prenom, 30);
  const message = clean(body.message, 300);
  const note = Number(body.note);
  if (!prenom) fields.prenom = 'Écris ton prénom (ou un pseudo).';
  else if (LINK_RE.test(prenom)) fields.prenom = 'Pas de lien dans le prénom.';
  if (!Number.isInteger(note) || note < 1 || note > 5) fields.note = 'Choisis une note, de 1 à 5 étoiles.';
  if (message.length < 3) fields.message = 'Écris quelques mots sur l\'épisode.';
  else if (LINK_RE.test(message)) fields.message = 'Les liens ne sont pas acceptés dans les avis.';
  if (Object.keys(fields).length) {
    const e = new HttpError(422, Object.keys(fields).length > 1 ? `${Object.keys(fields).length} champs sont à corriger.` : 'Un champ est à corriger.', 'validation');
    e.fields = fields;
    throw e;
  }
  return { prenom, note, message };
}

async function run(req, res) {
  if (req.method === 'GET') {
    if (req.query.all) {
      requireSession(req);
      const { list } = await readJsonList(AVIS_PATH, await headSha(), "d'avis");
      return send(res, 200, { avis: [...list].sort(byDate) });
    }
    const episodeId = typeof req.query.episode === 'string' ? req.query.episode : '';
    if (!episodeId) throw new HttpError(400, 'Épisode manquant.', 'body');
    const { list } = await readJsonList(AVIS_PATH, await headSha(), "d'avis");
    // Petit cache côté Vercel (5 s) pour ménager l'API GitHub ; jamais de cache dans le navigateur,
    // pour qu'un visiteur voie tout de suite son avis s'il recharge la page.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'max-age=5');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.status(200).json(summary(list, episodeId));
  }

  if (req.method === 'POST') {
    const body = readBody(req);
    // Piège à robots : un champ caché que les humains ne remplissent pas, et un formulaire envoyé en moins de 3 s.
    if (clean(body.site, 200) || (Number(body.t) > 0 && Number(body.t) < 3000)) {
      return send(res, 200, { ok: true, avis: [], total: 0, moyenne: null });
    }
    const { prenom, note, message } = validate(body);
    const episodeId = typeof body.episodeId === 'string' ? body.episodeId : '';
    checkRate(clientIp(req));
    const item = { id: crypto.randomBytes(6).toString('hex'), episodeId, prenom, note, message, date: new Date().toISOString() };
    const result = await commitWithRetry(async (base) => {
      const eps = await readJsonList(DATA_PATH, base, "d'épisodes");
      const ep = eps.list.find((e) => e.id === episodeId);
      if (!ep) throw new HttpError(404, 'Cet épisode n\'existe plus.', 'notfound');
      const avis = await readJsonList(AVIS_PATH, base, "d'avis");
      const next = [...avis.list, item];
      return { files: { [AVIS_PATH]: serialize(next) }, message: `Avis sur « ${ep.titre} » : ${prenom}`, result: summary(next, episodeId) };
    });
    return send(res, 201, { ok: true, ...result });
  }

  // DELETE (admin)
  requireSession(req);
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  const removed = await commitWithRetry(async (base) => {
    const avis = await readJsonList(AVIS_PATH, base, "d'avis");
    const a = avis.list.find((x) => x.id === id);
    if (!a) throw new HttpError(404, 'Cet avis a déjà été supprimé. Recharge la liste.', 'notfound');
    return { files: { [AVIS_PATH]: serialize(avis.list.filter((x) => x.id !== id)) }, message: `Suppression avis : ${a.prenom}`, result: a };
  });
  return send(res, 200, { deleted: removed.id });
}

export default handler(['GET', 'POST', 'DELETE'], run);
