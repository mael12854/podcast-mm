// POST /api/logout → efface le cookie de session.
import { handler, clearSessionCookie, send } from './_lib/auth.js';

export default handler(['POST'], async (req, res) => {
  clearSessionCookie(res);
  send(res, 200, { ok: true });
});
