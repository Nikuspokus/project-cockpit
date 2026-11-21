import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { PortsPlatform } from '../platform/types';
import { extractDeclaredPorts } from './declared';
import { groupPorts, type PortGroups } from './group';

export interface PortsSnapshot {
  loaded: boolean;
  error?: string;
  groups: PortGroups;
  declared: ReadonlySet<number>;
}

export interface PortsInputs {
  /** Dossiers absolus du workspace. */
  workspaceDirs: string[];
  /** Dossiers absolus dont on lit le .env pour repérer les ports déclarés. */
  envDirs: string[];
}

export const REFRESH_INTERVAL_MS = 5000;

const EMPTY: PortsSnapshot = {
  loaded: false,
  groups: { project: [], others: [], foreign: [] },
  declared: new Set(),
};

function currentUser(): string {
  try {
    return os.userInfo().username;
  } catch {
    return process.env.USER ?? process.env.USERNAME ?? '';
  }
}

async function readDeclaredPorts(dirs: readonly string[]): Promise<Set<number>> {
  const declared = new Set<number>();
  for (const dir of dirs) {
    try {
      for (const port of extractDeclaredPorts(await fsp.readFile(path.join(dir, '.env'), 'utf8'))) {
        declared.add(port);
      }
    } catch {
      // pas de .env ici
    }
  }
  return declared;
}

/**
 * Interroge l'OS toutes les 5 s, mais UNIQUEMENT tant que la vue est visible
 * (start/stop pilotés par la visibilité de l'arbre).
 */
export class PortsService implements vscode.Disposable {
  private timer: NodeJS.Timeout | undefined;
  private inFlight = false;
  private signature = '';
  private readonly emitter = new vscode.EventEmitter<void>();
  snapshot: PortsSnapshot = EMPTY;

  readonly onDidChange = this.emitter.event;

  constructor(
    private readonly platform: PortsPlatform,
    private readonly getInputs: () => PortsInputs,
  ) {}

  start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  get running(): boolean {
    return this.timer !== undefined;
  }

  async refresh(): Promise<void> {
    if (this.inFlight) return; // le tour précédent n'est pas fini : on n'empile pas
    this.inFlight = true;
    try {
      const { workspaceDirs, envDirs } = this.getInputs();
      const [ports, declared] = await Promise.all([this.platform.listListening(), readDeclaredPorts(envDirs)]);
      const groups = groupPorts(ports, { declared, workspaceDirs, username: currentUser() });
      this.update({ loaded: true, groups, declared });
    } catch (error) {
      this.update({ ...EMPTY, loaded: true, error: error instanceof Error ? error.message : String(error) });
    } finally {
      this.inFlight = false;
    }
  }

  dispose(): void {
    this.stop();
    this.emitter.dispose();
  }

  // On ne notifie l'arbre que si quelque chose a changé : évite un rafraîchissement inutile toutes les 5 s.
  private update(next: PortsSnapshot): void {
    const signature = JSON.stringify([next.loaded, next.error, next.groups, [...next.declared]]);
    this.snapshot = next;
    if (signature === this.signature) return;
    this.signature = signature;
    this.emitter.fire();
  }
}
