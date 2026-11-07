// POST /api/login { password } → pose le cookie de session.
import { handler, readBody, checkPassword, setSessionCookie, send, HttpError, clientIp, checkRateLimit, recordFailure, recordSuccess } from './_lib/auth.js';

export default handler(['POST'], async (req, res) => {
  const ip = clientIp(req);
  checkRateLimit(ip);
  const { password } = readBody(req);
  if (!password || typeof password !== 'string') throw new HttpError(400, 'Entre le mot de passe pour continuer.', 'empty');
  if (!checkPassword(password)) {
    recordFailure(ip);
    await new Promise((r) => setTimeout(r, 600)); // ralentit les essais en série
    throw new HttpError(401, "Ce n'est pas le bon mot de passe. Réessaie.", 'password');
  }
  recordSuccess(ip);
  const exp = setSessionCookie(res);
  send(res, 200, { ok: true, exp });
});
