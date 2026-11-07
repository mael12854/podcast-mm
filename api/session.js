// GET /api/session → 200 si la session est valide, sinon 401.
import { handler, requireSession, send } from './_lib/auth.js';

export default handler(['GET'], async (req, res) => {
  const s = requireSession(req);
  send(res, 200, { ok: true, exp: s.exp });
});
