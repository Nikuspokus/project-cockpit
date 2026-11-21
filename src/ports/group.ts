import * as path from 'node:path';
import type { ListeningPort } from '../platform/types';

export interface PortGroupingContext {
  /** Ports déclarés dans les .env du projet. */
  declared: ReadonlySet<number>;
  /** Dossiers du workspace (absolus) : un processus lancé dedans est « du projet ». */
  workspaceDirs: readonly string[];
  /** Utilisateur courant : ses processus sont les seuls qu'on propose d'arrêter. */
  username: string;
}

export interface PortGroups {
  /** Ports du projet : déclarés dans .env ou processus lancé depuis le workspace. */
  project: ListeningPort[];
  /** Autres processus de l'utilisateur courant. */
  others: ListeningPort[];
  /** Processus d'autres utilisateurs (lecture seule, jamais arrêtables). */
  foreign: ListeningPort[];
}

export function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** Un processus est arrêtable seulement s'il appartient à l'utilisateur courant (inconnu = Windows : on laisse l'OS refuser). */
export function isOwnedByUser(port: ListeningPort, username: string): boolean {
  return port.user === undefined || port.user === username;
}

export function groupPorts(ports: readonly ListeningPort[], context: PortGroupingContext): PortGroups {
  const groups: PortGroups = { project: [], others: [], foreign: [] };
  for (const port of ports) {
    if (!isOwnedByUser(port, context.username)) {
      groups.foreign.push(port);
      continue;
    }
    const inWorkspace = port.cwd !== undefined && context.workspaceDirs.some((dir) => isInside(port.cwd!, dir));
    (context.declared.has(port.port) || inWorkspace ? groups.project : groups.others).push(port);
  }
  const byPort = (a: ListeningPort, b: ListeningPort): number => a.port - b.port || a.pid - b.pid;
  groups.project.sort(byPort);
  groups.others.sort(byPort);
  groups.foreign.sort(byPort);
  return groups;
}
