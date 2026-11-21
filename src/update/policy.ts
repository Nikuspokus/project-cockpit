export interface UpdatePolicyInput {
  /** Origine d'installation notée par VS Code : « gallery » (store), « vsix » (fichier)… */
  installSource?: string;
  /** Extension lancée depuis les sources (F5) ou en test. */
  developmentMode: boolean;
  /** Réglage cockpit.checkUpdates. */
  settingEnabled: boolean;
  /** Variable d'environnement COCKPIT_UPDATE_CHECK=off. */
  envDisabled: boolean;
}

/**
 * L'updater intégré ne sert que pour une installation depuis un .vsix : une extension installée depuis
 * un store (VS Marketplace, Open VSX) est déjà mise à jour par VS Code, et ne doit pas s'auto-installer.
 */
export function updatePolicy(input: UpdatePolicyInput): { check: boolean; reason?: string } {
  if (input.envDisabled) return { check: false, reason: 'COCKPIT_UPDATE_CHECK=off' };
  if (!input.settingEnabled) return { check: false, reason: 'réglage cockpit.checkUpdates désactivé' };
  if (input.developmentMode) return { check: false, reason: 'mode développement' };
  if (input.installSource === 'gallery') return { check: false, reason: 'installée depuis un store' };
  return { check: true };
}
