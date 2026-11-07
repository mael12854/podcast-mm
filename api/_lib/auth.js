// Session admin : cookie httpOnly signé (HMAC-SHA256 avec SESSION_SECRET), valable 4 heures.
import crypto from 'node:crypto';

const COOKIE = 'dm_session';
export const SESSION_HOURS = 4;
const MAX_AGE = SESSION_HOURS * 3600;

export class HttpError extends Error {
  constructor(status, message, code = 'error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function env(name) {
  const v = process.env[name];
  if (!v) throw new HttpError(500, `Configuration incomplète : la variable d'environnement ${name} n'est pas définie sur Vercel.`, 'config');
  return v;
}

function secret() {
  const s = env('SESSION_SECRET');
  if (s.length < 32) throw new HttpError(500, 'SESSION_SECRET est trop courte (32 caractères minimum).', 'config');
  return s;
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const hmac = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function checkPassword(given) {
  return safeEqual(given, env('ADMIN_PASSWORD'));
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

export function setSessionCookie(res) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = b64url(JSON.stringify({ exp, n: crypto.randomBytes(8).toString('hex') }));
  const token = `${payload}.${hmac(payload)}`;
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}`);
  return exp;
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

// Vérifiée à chaque appel de l'API : pas de session valide = 401.
export function requireSession(req) {
  const token = parseCookies(req)[COOKIE];
  const expired = new HttpError(401, 'Ta session a expiré. Reconnecte-toi pour continuer.', 'session');
  if (!token || !token.includes('.')) throw expired;
  const [payload, sig] = token.split('.');
  if (!safeEqual(sig, hmac(payload))) throw expired;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw expired; }
  if (!data.exp || data.exp < Date.now() / 1000) throw expired;
  return data;
}

// Les requêtes qui modifient quelque chose doivent venir du site lui-même.
export function checkSameOrigin(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (origin) {
    let ok = false;
    try { ok = new URL(origin).host === host; } catch { ok = false; }
    if (!ok) throw new HttpError(403, 'Requête refusée (origine inconnue).', 'origin');
  }
  if (req.headers['x-dm-admin'] !== '1') throw new HttpError(403, 'Requête refusée.', 'origin');
}

// Limitation des tentatives de connexion (par instance, au mieux).
const attempts = new Map();
export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '?').split(',')[0].trim();
}
export function checkRateLimit(ip) {
  const a = attempts.get(ip);
  if (a && a.until > Date.now()) {
    const min = Math.ceil((a.until - Date.now()) / 60000);
    throw new HttpError(429, `Trop d'essais. Attends ${min} minute${min > 1 ? 's' : ''} avant de réessayer.`, 'rate');
  }
}
export function recordFailure(ip) {
  const a = attempts.get(ip) || { count: 0, until: 0 };
  a.count += 1;
  if (a.count >= 5) { a.until = Date.now() + 10 * 60000; a.count = 0; }
  attempts.set(ip, a);
}
export function recordSuccess(ip) { attempts.delete(ip); }

export function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.status(status).json(body);
}

export function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch { throw new HttpError(400, 'Données illisibles.', 'body'); }
  }
  return {};
}

// Enveloppe commune : méthodes autorisées, origine, erreurs propres en JSON.
export function handler(methods, fn) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        throw new HttpError(405, 'Méthode non autorisée.', 'method');
      }
      checkSameOrigin(req);
      await fn(req, res);
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message, code: err.code, ...(err.fields ? { fields: err.fields } : {}) });
      console.error(err);
      send(res, 500, { error: 'Erreur inattendue côté serveur. Réessaie dans un instant.', code: 'server' });
    }
  };
}
