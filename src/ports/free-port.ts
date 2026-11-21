import * as vscode from 'vscode';
import type { PortsPlatform } from '../platform/types';
import type { PortNode } from '../views/nodes';

const GRACE_MS = 3000;
const POLL_MS = 250;

async function waitUntilDead(platform: PortsPlatform, pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await platform.isAlive(pid))) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return !(await platform.isAlive(pid));
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * « Libérer » un port : confirmation → arrêt propre (SIGTERM) → si le processus vit encore
 * après 3 s, proposition de forcer (SIGKILL).
 */
export async function freePort(platform: PortsPlatform, node: PortNode, onDone: () => Promise<void>): Promise<void> {
  const { pid, port, processName } = node.port;
  const name = processName || 'processus';

  // Garde-fous : jamais init/PID 1, jamais l'hôte d'extensions lui-même.
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid || pid === process.ppid) {
    void vscode.window.showErrorMessage('Ce processus ne peut pas être arrêté depuis le Cockpit.');
    return;
  }

  const confirmed = await vscode.window.showWarningMessage(
    `Arrêter « ${name} » (PID ${pid}) qui occupe le port ${port} ?`,
    {
      modal: true,
      detail: "Une demande d'arrêt propre est envoyée d'abord. Un travail non enregistré dans ce processus peut être perdu.",
    },
    'Arrêter',
  );
  if (confirmed !== 'Arrêter') return;

  // Le PID a pu être réattribué depuis le dernier rafraîchissement : on revérifie avant d'agir.
  try {
    const current = await platform.listListening();
    if (!current.some((p) => p.pid === pid && p.port === port)) {
      void vscode.window.showInformationMessage(`Le port ${port} n'est plus occupé par ce processus.`);
      await onDone();
      return;
    }
  } catch (error) {
    void vscode.window.showErrorMessage(`Impossible de vérifier le port : ${errorText(error)}`);
    return;
  }

  try {
    await platform.kill(pid, false);
  } catch (error) {
    // Sous Windows, taskkill sans /F échoue souvent sur un processus console : on propose alors de forcer.
    if (process.platform !== 'win32') {
      void vscode.window.showErrorMessage(`Impossible d'arrêter le processus : ${errorText(error)}`);
      return;
    }
  }

  if (!(await waitUntilDead(platform, pid, GRACE_MS))) {
    const force = await vscode.window.showWarningMessage(
      `« ${name} » (PID ${pid}) tourne encore. Forcer l'arrêt ?`,
      {
        modal: true,
        detail: "Arrêt immédiat, sans nettoyage : des fichiers temporaires ou verrous peuvent rester.",
      },
      'Forcer',
    );
    if (force === 'Forcer') {
      try {
        await platform.kill(pid, true);
      } catch (error) {
        void vscode.window.showErrorMessage(`Impossible de forcer l'arrêt : ${errorText(error)}`);
        return;
      }
    }
  }
  await onDone();
}
