// POST /api/upload { data: <JPG en base64> } → stocke l'image sur GitHub (sans commit) et renvoie son identifiant.
// Le commit se fait ensuite en une fois, avec l'épisode, dans /api/episodes.
import { handler, requireSession, readBody, send, HttpError } from './_lib/auth.js';
import { createBlob } from './_lib/github.js';

const MAX_BYTES = 3.2 * 1024 * 1024;

export default handler(['POST'], async (req, res) => {
  requireSession(req);
  const { data } = readBody(req);
  if (typeof data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(data)) throw new HttpError(400, 'Image illisible.', 'image');
  const buf = Buffer.from(data, 'base64');
  if (buf.length > MAX_BYTES) throw new HttpError(413, 'Image trop lourde, même après compression. Essaie avec un scan plus petit.', 'image');
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) throw new HttpError(400, 'Seules les images JPG compressées par l\'admin sont acceptées.', 'image');
  const sha = await createBlob(data);
  send(res, 200, { sha });
});
