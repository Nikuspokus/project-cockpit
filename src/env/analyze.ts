import { constants, promises as fsp } from 'node:fs';
import * as path from 'node:path';
import { compareEnv, listEnvTargets, pickTemplate, type EnvComparison } from '../detectors/env';

/** Résumé d'un dossier : ne contient que des noms de fichiers et de variables, jamais de valeurs. */
export interface EnvReport {
  /** Dossier absolu. */
  dir: string;
  /** Nom affiché (dossier relatif ou nom du workspace). */
  label: string;
  /** Gabarit trouvé (.env.example, .env.sample ou .env.template). */
  template?: string;
  /** Fichiers .env* comparables présents dans le dossier. */
  targets: string[];
  /** Fichier comparé au gabarit (par défaut .env). */
  target: string;
  targetExists: boolean;
  comparison?: EnvComparison;
  /** Lecture impossible (permissions…) : message générique, sans contenu de fichier. */
  unreadable?: boolean;
}

export async function analyzeEnvDir(
  dir: string,
  label: string,
  preferredTarget?: string,
): Promise<EnvReport | undefined> {
  let fileNames: string[];
  try {
    fileNames = (await fsp.readdir(dir, { withFileTypes: true })).filter((e) => !e.isDirectory()).map((e) => e.name);
  } catch {
    return undefined;
  }

  const template = pickTemplate(fileNames);
  const targets = listEnvTargets(fileNames);
  if (!template && targets.length === 0) return undefined;

  const target = preferredTarget && targets.includes(preferredTarget) ? preferredTarget : '.env';
  const report: EnvReport = { dir, label, template, targets, target, targetExists: targets.includes(target) };

  if (template && report.targetExists) {
    try {
      const [env, tpl] = await Promise.all([
        fsp.readFile(path.join(dir, target), 'utf8'),
        fsp.readFile(path.join(dir, template), 'utf8'),
      ]);
      report.comparison = compareEnv(env, tpl);
    } catch {
      report.unreadable = true;
    }
  }
  return report;
}

/** Copie le gabarit vers .env sans jamais écraser un fichier existant (erreur EEXIST sinon). */
export async function createEnvFromTemplate(dir: string, template: string, target = '.env'): Promise<void> {
  await fsp.copyFile(path.join(dir, template), path.join(dir, target), constants.COPYFILE_EXCL);
}
