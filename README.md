# Double M · le site

Le site de **Double M**, la radio de Maël et Marin (La Compagnie M&M) : les épisodes, les dessins radio-dessinés, l'équipe, et un espace admin pour publier depuis un téléphone.

- HTML / CSS / JS vanilla, sans framework ni étape de build.
- Hébergé sur **Vercel**. Chaque push sur `main` redéploie le site automatiquement.
- Les données sont dans le repo : `data/episodes.json` et les dessins dans `images/dessins/`.
- L'admin (`/admin`) passe par des fonctions serverless (`api/`), qui écrivent dans le repo avec l'API GitHub.

---

## 1. Créer le token GitHub

L'admin a besoin d'un token pour faire des commits sur le repo. Le token reste sur Vercel : il n'apparaît jamais dans le navigateur ni dans le code.

1. Va sur GitHub › photo de profil › **Settings** › **Developer settings** › **Personal access tokens** › **Fine-grained tokens** › **Generate new token**.
   (Lien direct : <https://github.com/settings/personal-access-tokens/new>)
2. **Token name** : `double-m-admin` (par exemple).
3. **Expiration** : choisis une durée (1 an, par exemple). Note la date : il faudra le renouveler.
4. **Resource owner** : ton compte (`mael12854`).
5. **Repository access** : **Only select repositories** › choisis **uniquement** `mael12854/podcast-mm`.
6. **Permissions** › **Repository permissions** › **Contents** : **Read and write**.
   (GitHub ajoute tout seul *Metadata : Read-only*, c'est normal. Ne coche rien d'autre.)
7. **Generate token**, puis copie le token (il commence par `github_pat_…`). Tu ne pourras plus le revoir ensuite.
8. Colle-le sur Vercel dans la variable `GITHUB_TOKEN` (voir ci-dessous). Ne le mets nulle part ailleurs : ni dans le code, ni dans un message.

**Quand le token expire**, l'admin affiche « GitHub refuse le token ». Crée un nouveau token de la même façon, remplace la valeur de `GITHUB_TOKEN` sur Vercel, puis redéploie (Vercel › Deployments › ⋯ › Redeploy).

---

## 2. Variables d'environnement sur Vercel

Vercel › projet **podcast-mm** › **Settings** › **Environment Variables**.

| Variable | Qui la met | À quoi elle sert |
|---|---|---|
| `GITHUB_REPO` | déjà configurée | Le repo où l'admin écrit : `mael12854/podcast-mm`. |
| `GITHUB_BRANCH` | déjà configurée | La branche où l'admin fait ses commits : `main`. |
| `SESSION_SECRET` | déjà configurée | Une longue clé aléatoire qui signe le cookie de connexion. Si tu la changes, tout le monde est déconnecté. |
| `GITHUB_TOKEN` | **toi** | Le token fine-grained de l'étape 1. Seules les fonctions `api/` l'utilisent. |
| `ADMIN_PASSWORD` | **toi** | Le mot de passe de l'espace admin. Choisis-le long (une phrase de 4 ou 5 mots, par exemple). |

Après avoir ajouté ou modifié une variable, **redéploie** pour qu'elle soit prise en compte (Deployments › ⋯ › Redeploy).

Côté sécurité :
- le mot de passe est vérifié **côté serveur** ; ensuite, un cookie `httpOnly` signé garde la session **4 heures** ;
- chaque appel à `api/` revérifie ce cookie ;
- après 5 essais ratés, la connexion est bloquée 10 minutes ;
- `/admin` et `/api` ne sont pas indexés par les moteurs de recherche (`robots.txt` + en-tête `X-Robots-Tag`).

---

## 3. Ajouter un épisode depuis l'admin

1. Va sur **/admin** (lien « Espace admin » en bas de chaque page) et entre le mot de passe.
2. Appuie sur **+ NOUVEL ÉPISODE**.
3. Remplis :
   - **Titre** : il raconte, il ne résume pas (« Papa, la 2CV et le col du Galibier », pas « Épisode 13 »). Pas de numéro ni de point final.
   - **Date de diffusion**. Le **numéro** se calcule tout seul.
   - **Durée** et **Qui parle** : facultatifs (ex. « 18 min », « Maël & Marin »).
   - **Catégorie** : Chronique, Chronique des parents ou Dessin radio-dessiné.
   - **Description** : une ligne vide crée un nouveau paragraphe. La première phrase sert de résumé sur les cartes.
   - **Lien Spotify** : dans Spotify, ⋯ › Partager › Copier le lien de l'épisode. Il doit commencer par `https://open.spotify.com/episode/`.
4. Pour un **dessin radio-dessiné** :
   - ajoute les dessins (JPG ou PNG, 10 Mo max, 12 max). Ils sont compressés dans le téléphone avant l'envoi (2000 px, JPG qualité 85) et tu vois l'aperçu tout de suite ;
   - donne une **légende** à chaque dessin (obligatoire : elle décrit le dessin à ceux qui ne le voient pas) ;
   - le **minutage** (ex. `06:40`) et l'**auteur** sont facultatifs ;
   - change l'ordre avec ↑ ↓, ou en glissant les vignettes.
5. Appuie sur **PUBLIER**. L'admin envoie les dessins, puis fait **un seul commit** (« Ajout épisode : <titre> »). L'écran « Publié ! » indique quand l'épisode est en ligne, en général au bout d'une minute environ.

**Modifier** ou **supprimer** un épisode se fait depuis la liste. Une suppression retire l'épisode et ses dessins du site, pas de Spotify.

### Si ça ne marche pas

| Message | Quoi faire |
|---|---|
| « Ce n'est pas le bon mot de passe » | Vérifie `ADMIN_PASSWORD` sur Vercel. |
| « Ta session a expiré » | Reconnecte-toi : le formulaire en cours est gardé. |
| « GitHub refuse le token » | Le token est invalide ou expiré : refais l'étape 1. |
| « Le token GitHub n'a pas le droit d'écrire » | Vérifie la permission *Contents : Read and write* sur `podcast-mm`. |
| « Les épisodes ont changé depuis que tu as ouvert l'admin » | Quelqu'un a publié entre-temps. Appuie sur « Recharger les épisodes », puis republie. |
| « Configuration incomplète : la variable … » | Une variable manque sur Vercel : ajoute-la et redéploie. |

---

## Organisation des fichiers

```
index.html, episodes.html, episode.html, qui-sommes-nous.html, 404.html
admin/index.html        espace admin (connexion, liste, formulaire, publié)
css/tokens.css          design tokens des brand guidelines (+ « Compléments maquette »)
css/base.css            reset, typo, boutons, badges, ondes
css/components.css      header, footer, cartes, galerie, visionneuse
css/pages.css           styles propres à chaque page
css/admin.css           styles de l'admin
js/site.js              outils communs (chargement des épisodes, cartes, menu mobile)
js/home.js, episodes.js, episode.js, about.js, lightbox.js
js/admin.js             logique de l'admin
js/image-compress.js    compression des dessins avant l'envoi
api/login.js, logout.js, session.js
api/upload.js           envoie une image sur GitHub (sans commit)
api/episodes.js         lit, ajoute, modifie, supprime (un commit par action)
api/_lib/               session signée + client GitHub
data/episodes.json      les épisodes
images/dessins/<id>/    les dessins de chaque épisode
images/logo/            logo SVG (contours Poppins Bold), favicon, pochette
audio/                  jingles (le court joue sur « Écouter les 5 notes »)
vercel.json, robots.txt
```

### Format d'un épisode (`data/episodes.json`)

```json
{
  "id": "le-dragon-qui-avait-peur-du-noir",
  "numero": 14,
  "titre": "Le dragon qui avait peur du noir",
  "date": "2026-10-30",
  "categorie": "dessin",
  "description": "Première phrase = résumé.\n\nDeuxième paragraphe…",
  "spotifyUrl": "https://open.spotify.com/episode/…",
  "duree": "18 min",
  "auteurs": "Maël & Marin",
  "dessins": [
    { "src": "images/dessins/le-dragon-qui-avait-peur-du-noir/01-a1b2c3.jpg", "legende": "Le dragon dans sa grotte", "minutage": "01:05", "auteur": "Marin" }
  ]
}
```

- Obligatoires : `id`, `numero`, `titre`, `date`, `categorie` (`chronique`, `parents` ou `dessin`), `description`, `spotifyUrl`.
- Facultatifs : `duree`, `auteurs`, `dessins`.
- Pour chaque dessin, `src` et `legende` sont obligatoires ; `minutage` et `auteur` sont facultatifs. L'ordre de la galerie suit l'ordre de la liste, et l'orientation se lit sur l'image.
- L'épisode n° 1 porte la bande « 1ER ÉPISODE », le plus récent la bande « NOUVEL ÉPISODE ».

### Tester en local

Les pages publiques marchent avec n'importe quel serveur statique, par exemple `npx serve .` à la racine. Pour l'admin et `api/`, utilise `npx vercel dev`, avec les mêmes variables d'environnement dans un fichier `.env` qui ne doit jamais être commité.
