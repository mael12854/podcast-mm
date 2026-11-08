// /api/avis
//   GET    ?episode=<id>  (public) → { avis, total, moyenne } : avis VALIDÉS de l'épisode, rien d'autre
//   POST   { episodeId, prenom, note, message } (public) → enregistre l'avis EN ATTENTE (chiffré), ne renvoie aucun avis
//   GET    ?attente=1     (admin)  → { avis } : avis en attente, déchiffrés
//   GET    ?all=1         (admin)  → { avis } : avis publiés
//   PATCH  ?id=<id>       (admin)  → publie un avis en attente
//   DELETE ?id=<id>       (admin)  → supprime un avis (en attente ou publié)
// Chaque action = un commit GitHub. Ces commits ne redéploient pas le site (ignoreCommand dans vercel.json).
import crypto from 'node:crypto';
import { handler, requireSession, readBody, send, HttpError, clientIp } from './_lib/auth.js';
import { headSha, readJsonList, commitWithRetry, serialize, DATA_PATH, AVIS_PATH } from './_lib/github.js';
import { ATTENTE_PATH, seal, readPublies, readAttente } from './_lib/avis-store.js';

const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|fr|net|org|io|be|ch|ly|gg|xyz)\b)/i;

// Garde-fou anti-abus : 3 avis maximum par personne toutes les 10 minutes (par instance, au mieux).
const recent = new Map();
function checkRate(ip) {
  const now = Date.now();
  const list = (recent.get(ip) || []).filter((t) => now - t < 10 * 60000);
  if (list.length >= 3) throw new HttpError(429, 'Tu as déjà envoyé plusieurs avis. Attends quelques minutes avant d\'en écrire un autre.', 'rate');
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
  const id = typeof req.query.id === 'string' ? req.query.id : '';

  if (req.method === 'GET') {
    if (req.query.attente) {
      requireSession(req);
      const { list } = await readAttente(await headSha());
      return send(res, 200, { avis: [...list].sort(byDate) });
    }
    if (req.query.all) {
      requireSession(req);
      const { list } = await readPublies(await headSha());
      return send(res, 200, { avis: [...list].sort(byDate) });
    }
    const episodeId = typeof req.query.episode === 'string' ? req.query.episode : '';
    if (!episodeId) throw new HttpError(400, 'Épisode manquant.', 'body');
    const { list } = await readPublies(await headSha());
    // Petit cache côté Vercel (5 s) pour ménager l'API GitHub ; jamais de cache dans le navigateur.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'max-age=5');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.status(200).json(summary(list, episodeId));
  }

  if (req.method === 'POST') {
    const body = readBody(req);
    // Piège à robots : champ caché « Ne pas remplir », ou formulaire envoyé en moins de 3 s.
    if (clean(body.site, 200) || (Number(body.t) > 0 && Number(body.t) < 3000)) {
      return send(res, 202, { ok: true, enAttente: true });
    }
    const { prenom, note, message } = validate(body);
    const episodeId = typeof body.episodeId === 'string' ? body.episodeId : '';
    checkRate(clientIp(req));
    const avisId = crypto.randomBytes(6).toString('hex');
    const item = { episodeId, prenom, note, message, date: new Date().toISOString(), approuve: false };
    await commitWithRetry(async (base) => {
      const eps = await readJsonList(DATA_PATH, base, "d'épisodes");
      if (!eps.list.some((e) => e.id === episodeId)) throw new HttpError(404, 'Cet épisode n\'existe plus.', 'notfound');
      const attente = await readJsonList(ATTENTE_PATH, base, "d'avis en attente");
      // Message de commit neutre : le repo est public, rien de l'avis ne doit y apparaître en clair.
      return { files: { [ATTENTE_PATH]: serialize([...attente.list, { id: avisId, enc: seal(item) }]) }, message: 'Nouvel avis en attente de validation', result: true };
    });
    return send(res, 202, { ok: true, enAttente: true });
  }

  // Tout ce qui suit est réservé à l'admin : la session est vérifiée ici, côté serveur.
  requireSession(req);

  if (req.method === 'PATCH') {
    const published = await commitWithRetry(async (base) => {
      const attente = await readAttente(base);
      const a = attente.list.find((x) => x.id === id);
      if (!a) throw new HttpError(404, 'Cet avis n\'est plus en attente (déjà publié ou supprimé). Recharge la liste.', 'notfound');
      if (a.illisible) throw new HttpError(409, 'Cet avis est illisible (la clé SESSION_SECRET a changé). Supprime-le.', 'illisible');
      const eps = await readJsonList(DATA_PATH, base, "d'épisodes");
      const ep = eps.list.find((e) => e.id === a.episodeId);
      const pub = await readPublies(base);
      const avis = { id: a.id, episodeId: a.episodeId, prenom: a.prenom, note: a.note, message: a.message, date: a.date, approuve: true };
      return {
        files: {
          [AVIS_PATH]: serialize([...pub.raw, avis]),
          [ATTENTE_PATH]: serialize(attente.raw.filter((x) => x.id !== id)),
        },
        message: `Avis publié sur « ${ep ? ep.titre : a.episodeId} » : ${a.prenom}`,
        result: avis,
      };
    });
    return send(res, 200, { publie: published.id });
  }

  // DELETE : avis en attente ou déjà publié
  const removed = await commitWithRetry(async (base) => {
    const attente = await readJsonList(ATTENTE_PATH, base, "d'avis en attente");
    if (attente.list.some((x) => x.id === id)) {
      return { files: { [ATTENTE_PATH]: serialize(attente.list.filter((x) => x.id !== id)) }, message: 'Avis en attente supprimé', result: id };
    }
    const pub = await readJsonList(AVIS_PATH, base, "d'avis");
    const a = pub.list.find((x) => x.id === id);
    if (!a) throw new HttpError(404, 'Cet avis a déjà été supprimé. Recharge la liste.', 'notfound');
    return { files: { [AVIS_PATH]: serialize(pub.list.filter((x) => x.id !== id)) }, message: `Suppression avis : ${a.prenom}`, result: id };
  });
  return send(res, 200, { deleted: removed });
}

export default handler(['GET', 'POST', 'PATCH', 'DELETE'], run);
