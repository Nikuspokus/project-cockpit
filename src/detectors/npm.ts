import type { DetectedCommand, PackageManager } from './types';

// Premier lockfile trouvé dans cet ordre = gestionnaire retenu (déterministe si plusieurs coexistent).
const LOCKFILES: ReadonlyArray<readonly [string, PackageManager]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
];

// Noms de scripts sûrs à coller dans un shell sans quoting (évite l'injection via un nom de script).
const SAFE_SCRIPT_NAME = /^[A-Za-z0-9_][A-Za-z0-9_:.\-@]*$/;

/**
 * Déduit le gestionnaire de paquets : lockfile d'abord, puis champ « packageManager »
 * de package.json (ex. "pnpm@9.1.0"), sinon npm.
 */
export function detectPackageManager(
  fileNames: readonly string[],
  packageJson?: string,
): PackageManager {
  for (const [lockfile, manager] of LOCKFILES) {
    if (fileNames.includes(lockfile)) return manager;
  }
  if (packageJson) {
    try {
      const field = (JSON.parse(packageJson) as { packageManager?: unknown }).packageManager;
      if (typeof field === 'string') {
        const name = field.split('@')[0];
        if (name === 'pnpm' || name === 'yarn' || name === 'bun' || name === 'npm') return name;
      }
    } catch {
      // package.json invalide : on retombe sur npm
    }
  }
  return 'npm';
}

// Hooks du cycle de vie npm, exécutés automatiquement : inutile de les lancer à la main.
const LIFECYCLE = new Set(['preinstall', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'prepack', 'postpack']);

/** « prebuild »/« postbuild » sont des hooks de « build » seulement si le script « build » existe. */
function isHook(name: string, names: ReadonlySet<string>): boolean {
  if (LIFECYCLE.has(name)) return true;
  const base = name.startsWith('pre') ? name.slice(3) : name.startsWith('post') ? name.slice(4) : '';
  return base !== '' && names.has(base);
}

/** Liste les scripts de package.json sous la forme « <gestionnaire> run <script> ». */
export function detectNpmScripts(packageJson: string, manager: PackageManager): DetectedCommand[] {
  let scripts: unknown;
  try {
    scripts = (JSON.parse(packageJson) as { scripts?: unknown }).scripts;
  } catch {
    return [];
  }
  if (!scripts || typeof scripts !== 'object') return [];

  const entries = Object.entries(scripts as Record<string, unknown>);
  const names = new Set(entries.map(([name]) => name));
  const commands: DetectedCommand[] = [];
  for (const [name, body] of entries) {
    if (typeof body !== 'string' || !SAFE_SCRIPT_NAME.test(name) || isHook(name, names)) continue;
    commands.push({ label: name, command: `${manager} run ${name}`, source: manager, detail: body });
  }
  return commands;
}
