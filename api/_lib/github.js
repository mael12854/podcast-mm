// Accès au repo via l'API GitHub, avec GITHUB_TOKEN (jamais exposé au navigateur).
import { env, HttpError } from './auth.js';

const API = 'https://api.github.com';
export const DATA_PATH = 'data/episodes.json';
export const AVIS_PATH = 'data/avis.json';

function repo() {
  const r = env('GITHUB_REPO');
  if (!/^[\w.-]+\/[\w.-]+$/.test(r)) throw new HttpError(500, 'GITHUB_REPO doit être au format propriétaire/repo.', 'config');
  return r;
}
const branch = () => env('GITHUB_BRANCH');

// Erreur interne : la branche a bougé pendant notre commit (on réessaie).
class NotFastForward extends Error {}

async function gh(path, { method = 'GET', body, allow = [] } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${env('GITHUB_TOKEN')}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'double-m-admin',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.ok) return res.status === 204 ? null : res.json();
  if (allow.includes(res.status)) return { __status: res.status };
  let detail = '';
  try { detail = (await res.json()).message || ''; } catch { /* rien */ }
  if (res.status === 401) {
    throw new HttpError(502, 'GitHub refuse le token : GITHUB_TOKEN est invalide ou a expiré. Crée un nouveau token et mets-le à jour sur Vercel.', 'token');
  }
  if (res.status === 403 || res.status === 429) {
    if (res.headers.get('x-ratelimit-remaining') === '0' || res.status === 429) {
      throw new HttpError(503, 'GitHub limite le nombre de requêtes pour le moment. Réessaie dans quelques minutes.', 'github');
    }
    throw new HttpError(502, 'Le token GitHub n\'a pas le droit d\'écrire sur le repo. Vérifie la permission « Contents : Read and write » sur le repo.', 'token');
  }
  if (res.status === 404) {
    throw new HttpError(502, 'Repo ou branche introuvable. Vérifie GITHUB_REPO, GITHUB_BRANCH et que le token a bien accès à ce repo.', 'repo');
  }
  if (res.status === 409 || (res.status === 422 && /fast forward|fast-forward/i.test(detail))) throw new NotFastForward();
  console.error('GitHub', res.status, detail);
  throw new HttpError(502, `GitHub a répondu une erreur (${res.status}). Réessaie dans un instant.`, 'github');
}

export async function headSha() {
  const ref = await gh(`/repos/${repo()}/git/ref/heads/${encodeURIComponent(branch())}`);
  return ref.object.sha;
}

// Lit un fichier JSON (liste) tel qu'il est dans le commit donné.
export async function readJsonList(path, commitSha, label) {
  const file = await gh(`/repos/${repo()}/contents/${path}?ref=${commitSha}`, { allow: [404] });
  if (file.__status === 404) return { version: 'absent', list: [] };
  let list;
  try {
    list = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
  } catch {
    throw new HttpError(500, `Le fichier ${path} du repo est illisible (JSON invalide).`, 'data');
  }
  if (!Array.isArray(list)) throw new HttpError(500, `Le fichier ${path} doit contenir une liste${label ? ` ${label}` : ''}.`, 'data');
  return { version: file.sha, list };
}

// Version actuelle de episodes.json sur la branche (pas la version déployée, qui peut avoir du retard).
export async function readEpisodes() {
  const commitSha = await headSha();
  const { version, list } = await readJsonList(DATA_PATH, commitSha, "d'épisodes");
  return { commitSha, version, episodes: list };
}

export async function createBlob(base64) {
  const blob = await gh(`/repos/${repo()}/git/blobs`, { method: 'POST', body: { content: base64, encoding: 'base64' } });
  return blob.sha;
}

async function existingPaths(treeSha, paths) {
  if (!paths.length) return new Set();
  const tree = await gh(`/repos/${repo()}/git/trees/${treeSha}?recursive=1`);
  const all = new Set(tree.tree.filter((t) => t.type === 'blob').map((t) => t.path));
  return new Set(paths.filter((p) => all.has(p)));
}

// Un seul commit pour toute l'action. `prepare(baseCommitSha)` lit l'état du repo à ce commit et renvoie
// { files: { chemin: contenu texte }, add: [{ path, sha }], remove: [chemins], message, result }.
// Si la branche bouge entre-temps (par exemple un avis publié au même moment), on recommence sur la
// nouvelle version : prepare() refait ses vérifications, rien n'est écrasé.
export async function commitWithRetry(prepare, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const base = await headSha();
    const plan = await prepare(base);
    const baseCommit = await gh(`/repos/${repo()}/git/commits/${base}`);
    const toRemove = await existingPaths(baseCommit.tree.sha, plan.remove || []);
    const tree = [
      ...Object.entries(plan.files || {}).map(([path, content]) => ({ path, mode: '100644', type: 'blob', content })),
      ...(plan.add || []).map((f) => ({ path: f.path, mode: '100644', type: 'blob', sha: f.sha })),
      ...[...toRemove].map((p) => ({ path: p, mode: '100644', type: 'blob', sha: null })),
    ];
    const newTree = await gh(`/repos/${repo()}/git/trees`, { method: 'POST', body: { base_tree: baseCommit.tree.sha, tree } });
    const c = await gh(`/repos/${repo()}/git/commits`, { method: 'POST', body: { message: plan.message, tree: newTree.sha, parents: [base] } });
    try {
      await gh(`/repos/${repo()}/git/refs/heads/${encodeURIComponent(branch())}`, { method: 'PATCH', body: { sha: c.sha, force: false } });
      return plan.result;
    } catch (err) {
      if (!(err instanceof NotFastForward)) throw err;
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
    }
  }
  throw new HttpError(409, 'Le site reçoit plusieurs modifications en même temps. Réessaie dans un instant.', 'conflict');
}

export const serialize = (list) => JSON.stringify(list, null, 2) + '\n';
