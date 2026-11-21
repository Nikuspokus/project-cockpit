import * as path from 'node:path';
import { detectCompose } from '../detectors/compose';
import { detectGradle } from '../detectors/gradle';
import { detectMakefile } from '../detectors/makefile';
import { detectMaven } from '../detectors/maven';
import { detectNpmScripts, detectPackageManager } from '../detectors/npm';
import type { DetectedCommand } from '../detectors/types';

/** Accès fichiers injecté : permet de tester le scan avec un faux système de fichiers en mémoire. */
export interface ScanFs {
  readDir(dir: string): Promise<Array<{ name: string; isDirectory: boolean }>>;
  readFile(file: string): Promise<string>;
}

/** Commande détectée, rattachée à un dossier du workspace. */
export interface CockpitCommand extends DetectedCommand {
  /** Identifiant stable : « dossier::source::label ». */
  id: string;
  /** Dossier relatif à la racine du workspace, en « / » ('' = racine). */
  dir: string;
}

export interface ProjectEntry {
  /** Dossier relatif à la racine ('' = racine). */
  dir: string;
  commands: CockpitCommand[];
}

export interface ScanOptions {
  /** Profondeur max sous la racine (0 = racine seule). Défaut : 3. */
  maxDepth?: number;
  /** Noms de dossiers ignorés. Défaut : node_modules, dist, target, build. */
  ignore?: ReadonlySet<string>;
}

export const DEFAULT_MAX_DEPTH = 3;
export const DEFAULT_IGNORED_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'target',
  'build',
]);

const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
const GRADLE_FILES = ['build.gradle.kts', 'build.gradle'];
const MAKE_FILES = ['Makefile', 'makefile', 'GNUmakefile'];

/**
 * Détecte les commandes d'un seul dossier à partir de la liste de ses fichiers.
 * `read` ne lit que des fichiers présents dans `fileNames`.
 */
export async function detectDirectory(
  fileNames: readonly string[],
  read: (name: string) => Promise<string>,
): Promise<DetectedCommand[]> {
  const has = (name: string): boolean => fileNames.includes(name);
  const firstOf = (names: readonly string[]): string | undefined => names.find(has);
  const safeRead = async (name: string): Promise<string | undefined> => {
    try {
      return await read(name);
    } catch {
      return undefined; // fichier illisible : on l'ignore, sans bruit
    }
  };

  const commands: DetectedCommand[] = [];

  if (has('package.json')) {
    const content = await safeRead('package.json');
    if (content !== undefined) {
      commands.push(...detectNpmScripts(content, detectPackageManager(fileNames, content)));
    }
  }
  if (has('pom.xml')) {
    const content = await safeRead('pom.xml');
    if (content !== undefined) commands.push(...detectMaven(content, { hasWrapper: has('mvnw') }));
  }
  const gradleFile = firstOf(GRADLE_FILES);
  if (gradleFile) {
    const content = await safeRead(gradleFile);
    if (content !== undefined) {
      commands.push(...detectGradle(content, { hasWrapper: has('gradlew') }));
    }
  }
  const makeFile = firstOf(MAKE_FILES);
  if (makeFile) {
    const content = await safeRead(makeFile);
    if (content !== undefined) commands.push(...detectMakefile(content));
  }
  const composeFile = firstOf(COMPOSE_FILES);
  if (composeFile) {
    const content = await safeRead(composeFile);
    if (content !== undefined) commands.push(...detectCompose(content));
  }
  return commands;
}

/**
 * Parcourt `root` jusqu'à `maxDepth` (monorepos inclus) et renvoie un projet par dossier
 * qui contient au moins une commande. Les dossiers cachés (.git, .idea…) sont ignorés.
 */
export async function scanWorkspace(
  fs: ScanFs,
  root: string,
  options: ScanOptions = {},
): Promise<ProjectEntry[]> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const ignore = options.ignore ?? DEFAULT_IGNORED_DIRS;
  const projects: ProjectEntry[] = [];

  const walk = async (rel: string, depth: number): Promise<void> => {
    const abs = rel ? path.join(root, ...rel.split('/')) : root;
    let entries: Array<{ name: string; isDirectory: boolean }>;
    try {
      entries = await fs.readDir(abs);
    } catch {
      return; // dossier illisible ou supprimé pendant le scan
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));

    const fileNames = entries.filter((e) => !e.isDirectory).map((e) => e.name);
    const detected = await detectDirectory(fileNames, (name) => fs.readFile(path.join(abs, name)));
    if (detected.length > 0) {
      projects.push({
        dir: rel,
        commands: detected.map((c) => ({ ...c, dir: rel, id: `${rel}::${c.source}::${c.label}` })),
      });
    }

    if (depth >= maxDepth) return;
    for (const entry of entries) {
      if (!entry.isDirectory || entry.name.startsWith('.') || ignore.has(entry.name)) continue;
      await walk(rel ? `${rel}/${entry.name}` : entry.name, depth + 1);
    }
  };

  await walk('', 0);
  return projects;
}
