// Stockage des avis.
// - data/avis.json            : avis VALIDÉS (publics), chacun avec "approuve": true.
// - data/avis-en-attente.json : avis EN ATTENTE, chiffrés (AES-256-GCM). Le repo GitHub étant public,
//   on ne peut pas y écrire un avis non validé en clair. La clé est dérivée de SESSION_SECRET
//   et n'existe que côté serveur (fonctions api/).
import crypto from 'node:crypto';
import { env } from './auth.js';
import { readJsonList, AVIS_PATH } from './github.js';

export const ATTENTE_PATH = 'data/avis-en-attente.json';

function key() {
  return Buffer.from(crypto.hkdfSync('sha256', env('SESSION_SECRET'), 'double-m', 'avis-en-attente', 32));
}

export function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function open(token) {
  try {
    const [iv, tag, data] = String(token).split('.').map((s) => Buffer.from(s, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString('utf8'));
  } catch {
    return null; // clé changée ou entrée abîmée
  }
}

// Avis publiés (seuls ceux marqués validés ; les anciens sans champ sont considérés validés).
export async function readPublies(base) {
  const r = await readJsonList(AVIS_PATH, base, "d'avis");
  return { raw: r.list, list: r.list.filter((a) => a.approuve !== false) };
}

// Avis en attente, déchiffrés. Fichier : [{ id, enc }].
export async function readAttente(base) {
  const r = await readJsonList(ATTENTE_PATH, base, "d'avis en attente");
  const list = r.list.map((e) => {
    const a = open(e.enc);
    return a ? { ...a, id: e.id } : { id: e.id, illisible: true };
  });
  return { raw: r.list, list };
}
