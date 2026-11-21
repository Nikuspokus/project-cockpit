import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { updatePolicy } from './policy';
import { isNewer, parseLatest, type LatestInfo } from './version';

const FETCH_TIMEOUT_MS = 5000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_VSIX_BYTES = 25 * 1024 * 1024;

interface ExtensionManifest {
  version?: string;
  homepage?: string;
  __metadata?: { source?: string };
}

/**
 * Vérifie s'il existe une version plus récente sur la page GitHub Pages du projet.
 * Appelée SANS await depuis activate() : toute erreur est seulement journalisée, jamais affichée.
 * Seul appel réseau de l'extension (avec, plus tard, la validation de licence Pro).
 */
export async function checkForUpdate(context: vscode.ExtensionContext): Promise<void> {
  try {
    const manifest = context.extension.packageJSON as ExtensionManifest;
    const policy = updatePolicy({
      installSource: manifest.__metadata?.source,
      developmentMode: context.extensionMode !== vscode.ExtensionMode.Production,
      settingEnabled: vscode.workspace.getConfiguration('cockpit').get<boolean>('checkUpdates', true),
      envDisabled: process.env.COCKPIT_UPDATE_CHECK === 'off',
    });
    if (!policy.check || !manifest.homepage || !manifest.version) return;

    const response = await fetch(`${manifest.homepage.replace(/\/$/, '')}/latest.json`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return;
    const latest = parseLatest(await response.json(), manifest.homepage);
    if (!latest || !isNewer(latest.version, manifest.version)) return;

    const choice = await vscode.window.showInformationMessage(
      `Project Cockpit ${latest.version} est disponible (version installée : ${manifest.version}).`,
      'Installer',
      'Plus tard',
    );
    if (choice === 'Installer') await install(latest);
  } catch (error) {
    console.warn('[project-cockpit] vérification de mise à jour impossible :', error instanceof Error ? error.message : error);
  }
}

async function install(latest: LatestInfo): Promise<void> {
  const file = path.join(os.tmpdir(), `project-cockpit-${latest.version}.vsix`);
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Téléchargement de Project Cockpit ${latest.version}…` },
      async () => {
        const response = await fetch(latest.url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
        if (!response.ok) throw new Error(`téléchargement refusé (HTTP ${response.status})`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length === 0 || bytes.length > MAX_VSIX_BYTES) throw new Error('taille du fichier inattendue');
        if (latest.sha256 && createHash('sha256').update(bytes).digest('hex') !== latest.sha256) {
          throw new Error("l'empreinte du fichier ne correspond pas : installation annulée");
        }
        await fsp.writeFile(file, bytes);
        await vscode.commands.executeCommand('workbench.extensions.command.installFromVSIX', vscode.Uri.file(file));
      },
    );
    const reload = await vscode.window.showInformationMessage(
      `Project Cockpit ${latest.version} est installé. Recharger la fenêtre pour l'activer ?`,
      'Recharger',
    );
    if (reload === 'Recharger') await vscode.commands.executeCommand('workbench.action.reloadWindow');
  } catch (error) {
    // L'utilisateur vient de cliquer sur « Installer » : on lui dit pourquoi ça n'a pas marché.
    void vscode.window.showErrorMessage(
      `Mise à jour impossible : ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    void fsp.rm(file, { force: true });
  }
}
