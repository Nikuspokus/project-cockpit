import type * as vscode from 'vscode';

/** Points d'accroche Pro : l'entrée verrouillée du gratuit, remplacée par l'extension Pro si elle est installée et licenciée. */
export const PRO_HOOKS = [
  {
    id: 'profiles',
    section: 'commands',
    label: 'Profils multi-projets',
    blurb: 'Enregistrez des ensembles de commandes à lancer ensemble sur plusieurs dossiers ou monorepos.',
  },
  {
    id: 'port-history',
    section: 'ports',
    label: 'Historique des ports',
    blurb: 'Retrouvez quels processus ont occupé quels ports, et quand.',
  },
  {
    id: 'team-config',
    section: 'env',
    label: 'Config d’équipe (.cockpit.json)',
    blurb: 'Partagez commandes et variables attendues avec votre équipe via un fichier versionné dans le dépôt.',
  },
] as const;

export type ProFeatureId = (typeof PRO_HOOKS)[number]['id'];
export type ProHookSection = (typeof PRO_HOOKS)[number]['section'];

/** Élément affiché par une fonctionnalité Pro dans l'arbre du Cockpit. */
export interface ProFeatureItem {
  id: string;
  label: string;
  description?: string;
  /** Identifiant d'icône Codicon (ex. « history »). */
  icon?: string;
  command?: { command: string; arguments?: unknown[] };
}

/** Fonctionnalité fournie par l'extension Pro (dépôt privé) via l'API du Cockpit. */
export interface ProFeature {
  id: ProFeatureId;
  getItems(): ProFeatureItem[] | Promise<ProFeatureItem[]>;
  /** À déclencher quand les éléments changent : l'arbre se rafraîchit. */
  onDidChange?: vscode.Event<void>;
}

export type HookState =
  /** Pas d'extension Pro installée : cadenas + lien vers la page. */
  | 'locked'
  /** Extension Pro présente, mais licence absente ou invalide. */
  | 'license-required'
  /** Extension Pro présente et licence valide : ses éléments sont affichés. */
  | 'unlocked';

export function resolveHookState(featureRegistered: boolean, isPro: boolean): HookState {
  if (!featureRegistered) return 'locked';
  return isPro ? 'unlocked' : 'license-required';
}
