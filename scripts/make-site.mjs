// Génère le dossier site/ publié sur GitHub Pages :
//   site/index.html                    page de présentation + flux de mise à jour
//   site/latest.json                   lu par l'updater intégré de l'extension
//   site/<name>-latest.vsix            URL stable du dernier .vsix
// Usage : TAG=v0.1.0 node scripts/make-site.mjs   (après `npm run package`)
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const { name, version, displayName = name, description = '', homepage, repository } = pkg;

const fail = (message) => {
  console.error(`make-site : ${message}`);
  process.exit(1);
};

if (!homepage) fail('« homepage » est absent de package.json.');
const tag = process.env.TAG;
if (tag === undefined) console.warn('make-site : TAG non défini, vérification du tag ignorée (usage local).');
else if (tag !== `v${version}`) fail(`le tag « ${tag} » ne correspond pas à la version « v${version} » de package.json.`);

const vsix = join(root, `${name}-${version}.vsix`);
if (!existsSync(vsix)) fail(`${name}-${version}.vsix introuvable : lancez d'abord « npm run package ».`);

const base = homepage.replace(/\/$/, '');
const repoUrl = (typeof repository === 'string' ? repository : repository?.url ?? '').replace(/\.git$/, '');
const latestName = `${name}-latest.vsix`;
const sha256 = createHash('sha256').update(readFileSync(vsix)).digest('hex');

const site = join(root, 'site');
rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });
copyFileSync(vsix, join(site, latestName));
writeFileSync(join(site, '.nojekyll'), '');
writeFileSync(
  join(site, 'latest.json'),
  JSON.stringify({ name, version, url: `${base}/${latestName}`, sha256, date: new Date().toISOString() }, null, 2) + '\n',
);

const esc = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(displayName)} — extension VS Code</title>
<meta name="description" content="${esc(description)}">
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#1b1f24; --muted:#59636e; --card:#f6f8fa; --line:#d1d9e0; --accent:#0b6bcb; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0d1117; --fg:#e6edf3; --muted:#9198a1; --card:#151b23; --line:#30363d; --accent:#4493f8; } }
  * { box-sizing: border-box; }
  body { margin:0; font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif; background:var(--bg); color:var(--fg); }
  main { max-width:860px; margin:0 auto; padding:48px 20px 80px; }
  h1 { font-size:2.4rem; margin:0 0 8px; } h2 { margin:48px 0 12px; font-size:1.4rem; }
  p.lead { font-size:1.15rem; color:var(--muted); margin:0 0 24px; }
  a { color:var(--accent); } code, pre { font:0.9rem ui-monospace,SFMono-Regular,Menlo,monospace; }
  pre { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:12px 14px; overflow-x:auto; }
  .btn { display:inline-block; background:var(--accent); color:#fff; padding:10px 18px; border-radius:8px; text-decoration:none; font-weight:600; }
  .grid { display:grid; gap:14px; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; }
  .card h3 { margin:0 0 6px; font-size:1.05rem; }
  .demo { margin:24px 0; padding:48px 16px; text-align:center; color:var(--muted); border:2px dashed var(--line); border-radius:10px; }
  table { width:100%; border-collapse:collapse; } th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); }
  small, .muted { color:var(--muted); }
</style>
</head>
<body>
<main>
  <h1>${esc(displayName)}</h1>
  <p class="lead">${esc(description)}</p>
  <p><a class="btn" href="${esc(latestName)}" download>Télécharger v${esc(version)} (.vsix)</a>
     &nbsp;<a href="${esc(repoUrl)}/releases">Toutes les versions</a></p>

  <div class="demo" role="img" aria-label="Démonstration à venir">GIF de démonstration à venir</div>

  <h2>Ce que fait le Cockpit</h2>
  <div class="grid">
    <div class="card"><h3>Commandes</h3><p>Scripts npm, pnpm, yarn et bun, Maven, Gradle, Makefile et docker compose détectés automatiquement, monorepos compris. Un clic lance la commande dans un terminal dédié.</p></div>
    <div class="card"><h3>Ports</h3><p>Les ports TCP en écoute avec leur processus. Ceux du projet passent en premier ; « Libérer » demande confirmation avant d'arrêter un processus.</p></div>
    <div class="card"><h3>Environnement</h3><p>Compare votre <code>.env</code> à <code>.env.example</code> : variables manquantes, vides ou en trop. Les valeurs ne sont jamais affichées.</p></div>
  </div>

  <h2>Installation</h2>
  <ol>
    <li>Téléchargez le fichier <code>.vsix</code> ci-dessus.</li>
    <li>Dans VS Code : panneau Extensions → menu « … » → <em>Installer à partir de VSIX…</em></li>
  </ol>
  <p>Ou en ligne de commande :</p>
  <pre>code --install-extension ${esc(latestName)}</pre>
  <p class="muted">Compatible VS Code 1.90+ et les éditeurs basés sur Open VSX (Cursor, Windsurf, VSCodium).</p>

  <h2>Mise à jour</h2>
  <p>Installée depuis ce fichier, l'extension consulte <a href="latest.json"><code>latest.json</code></a> sur cette page au démarrage.
     Si une version plus récente existe, elle propose de la télécharger, <strong>vérifie son empreinte SHA-256</strong>, puis l'installe.
     Version en ligne : <strong>v${esc(version)}</strong>.</p>
  <p class="muted">Pour la désactiver : réglage <code>cockpit.checkUpdates</code> ou variable d'environnement <code>COCKPIT_UPDATE_CHECK=off</code>.
     Installée depuis un store (VS Marketplace, Open VSX), c'est VS Code qui gère les mises à jour.</p>

  <h2 id="pro">Gratuit et Pro</h2>
  <table>
    <tr><th>Fonction</th><th>Gratuit</th><th>Pro</th></tr>
    <tr><td>Commandes, ports, environnement</td><td>✓</td><td>✓</td></tr>
    <tr><td>Profils multi-projets / monorepo</td><td>—</td><td>✓</td></tr>
    <tr><td>Historique des ports</td><td>—</td><td>✓</td></tr>
    <tr><td>Config d'équipe partagée (<code>.cockpit.json</code>)</td><td>—</td><td>✓</td></tr>
  </table>
  <p class="muted">Le Pro n'est pas encore en vente. Suivez les nouveautés sur <a href="${esc(repoUrl)}">GitHub</a>.</p>

  <h2>Confidentialité</h2>
  <p>Aucune télémétrie. Le seul appel réseau est la vérification de mise à jour ci-dessus. Les valeurs de vos fichiers <code>.env</code> ne sont jamais lues au-delà de leur présence, affichées, journalisées ni transmises.</p>

  <p><small>${esc(displayName)} v${esc(version)} · <a href="${esc(repoUrl)}">Code source</a> · <a href="${esc(repoUrl)}/issues">Signaler un problème</a></small></p>
</main>
</body>
</html>
`;
writeFileSync(join(site, 'index.html'), html);
console.log(`make-site : site/ généré pour ${name} v${version} (sha256 ${sha256.slice(0, 12)}…).`);
