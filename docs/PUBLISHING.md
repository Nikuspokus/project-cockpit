# Mise en ligne de Project Cockpit

Tout se déclenche en poussant un **tag** `vX.Y.Z`. Le workflow `.github/workflows/release.yml` :

1. installe, vérifie les types, lance les tests, construit le `.vsix` ;
2. génère le site (`scripts/make-site.mjs`) : page de présentation, `latest.json`, `project-cockpit-latest.vsix` ;
3. crée la **release GitHub** avec le `.vsix` ;
4. déploie **GitHub Pages** ;
5. publie sur **Open VSX** puis sur le **VS Marketplace**, si les secrets existent (sinon ces étapes sont ignorées avec un avertissement).

> Le tag doit être égal à `v` + la version de `package.json` (ex. version `0.1.0` → tag `v0.1.0`), sinon `make-site.mjs` échoue.

## 1. Configuration unique du dépôt GitHub

Compte **Nikuspokus**, dépôt `Nikuspokus/project-cockpit` (public : Pages gratuit l'exige).

1. **Pages** : Settings → Pages → *Build and deployment* → Source : **GitHub Actions**.
2. **Règle de tag** : Settings → Environments → `github-pages` (créé au premier déploiement, ou à créer à la main)
   → *Deployment branches and tags* → *Add deployment branch or tag rule* → type **Tag**, motif `v*`.
   Sans cette règle, le déploiement échoue avec « not allowed to deploy to github-pages ».
3. **Workflow** : Settings → Actions → General → vérifier que les workflows sont autorisés.

## 2. Publier une version

1. Mettre à jour `version` dans `package.json` et `CHANGELOG.md`, committer sur `main`.
2. Créer le tag, au choix :
   - ligne de commande : `git tag v0.1.0 && git push origin v0.1.0` ;
   - ou interface web : Releases → *Draft a new release* → *Choose a tag* → créer `v0.1.0` sur `main` → *Publish release*.
3. Onglet **Actions** : le workflow *Release* doit être vert (environ 1 minute).
4. Ouvrir https://nikuspokus.github.io/project-cockpit/ : la version affichée doit être la nouvelle.

Les extensions déjà installées **depuis un .vsix** proposent alors la mise à jour d'elles-mêmes (elles lisent `latest.json`).
Celles installées depuis un store sont mises à jour par VS Code.

## 3. Secrets de publication sur les stores

Les secrets sont lus par le workflow, jamais écrits dans le code. Ajoutez-les dans
Settings → Secrets and variables → Actions → *New repository secret*.
Tant qu'un secret est absent, la publication sur le store correspondant est simplement ignorée.

### `VSCE_PAT` — VS Marketplace (Microsoft)

Gratuit. Il faut un compte Microsoft.

1. Créer le **publisher** : https://marketplace.visualstudio.com/manage → *Create publisher* → ID **`nikuspokus`**
   (doit être identique au champ `publisher` de `package.json`).
2. Créer un **Personal Access Token (PAT)** sur Azure DevOps : https://dev.azure.com → icône utilisateur → *Personal access tokens*
   (une organisation Azure DevOps gratuite est nécessaire ; la créer si besoin).
   - *Organization* : **All accessible organizations**
   - *Scopes* : **Custom defined** → *Show all scopes* → **Marketplace → Manage**
   - Durée : 1 an maximum. **Notez la date d'expiration** : passé ce délai, la publication échoue jusqu'au renouvellement.
3. Copier le token dans le secret **`VSCE_PAT`**.

### `OVSX_PAT` — Open VSX (Cursor, Windsurf, VSCodium)

Gratuit.

1. Créer un compte sur https://open-vsx.org (connexion avec GitHub, compte **Nikuspokus**).
2. Lier un compte **Eclipse Foundation** (Settings → *Log in with Eclipse*) et signer le **Publisher Agreement**.
3. Settings → *Access Tokens* → *Generate New Token* ; copier le token dans le secret **`OVSX_PAT`**.
4. Créer le *namespace* une seule fois, depuis un terminal :
   `npx ovsx create-namespace nikuspokus --pat <token>`
   (le namespace est le champ `publisher`, en minuscules).

## 4. À prévoir avant la première publication sur les stores

- **Icône** : le VS Marketplace attend un PNG de 128×128 minimum (le SVG n'est pas accepté pour l'icône de l'extension).
  Ajouter `"icon": "media/icon.png"` dans `package.json` et `!media/icon.png` dans `.vscodeignore`.
- **Captures / GIF** : remplacer le GIF de démo en placeholder du README et de la page.
- Une fois publiée, ajouter les liens des stores dans le README et dans `scripts/make-site.mjs`.

## 5. Test local sans publier

```bash
npm run package                 # produit project-cockpit-<version>.vsix
node scripts/make-site.mjs      # génère site/ (TAG non défini : vérification de tag ignorée)
npx http-server site            # ou : python3 -m http.server -d site
```
