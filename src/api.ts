import type * as vscode from 'vscode';
import type { ProFeature } from './pro/features';
import type { LicenseService } from './pro/license';

export type { ProFeature, ProFeatureId, ProFeatureItem } from './pro/features';
export type { LicenseService } from './pro/license';

/** Projet détecté, sous forme sérialisable (pas d'objets vscode). */
export interface DetectedProject {
  /** URI du dossier du workspace (chaîne). */
  folderUri: string;
  /** Dossier relatif à la racine du workspace, en « / » ('' = racine). */
  dir: string;
  commands: Array<{ id: string; label: string; command: string; source: string }>;
}

/**
 * API publique renvoyée par `activate()` : c'est ce que l'extension Pro (dépôt privé) utilise.
 * `apiVersion` ne change que si une modification casse la compatibilité.
 *
 * Usage côté extension Pro :
 *   const api = await vscode.extensions.getExtension('nikuspokus.project-cockpit')?.activate();
 *   api.registerProFeature({ id: 'profiles', getItems: () => [...] });
 */
export interface CockpitApi {
  readonly apiVersion: 1;
  readonly license: LicenseService;
  getProjects(): DetectedProject[];
  readonly onDidChangeProjects: vscode.Event<void>;
  registerProFeature(feature: ProFeature): vscode.Disposable;
}
