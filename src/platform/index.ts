import type { PortsPlatform } from './types';
import { unixPlatform } from './unix';
import { windowsPlatform } from './windows';

export type { ListeningPort, PortsPlatform } from './types';

/** Seul point d'entrée dépendant de l'OS : le reste de l'extension ne teste jamais process.platform. */
export function getPlatform(os: NodeJS.Platform = process.platform): PortsPlatform {
  return os === 'win32' ? windowsPlatform : unixPlatform;
}
