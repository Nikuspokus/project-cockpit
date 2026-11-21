export interface ListeningPort {
  port: number;
  pid: number;
  processName: string;
  /** Adresse d'écoute (ex. « *», « 127.0.0.1 », « ::1 »). */
  address: string;
  /** Propriétaire du processus (macOS/Linux uniquement). */
  user?: string;
  /** Dossier de travail du processus (macOS/Linux uniquement). */
  cwd?: string;
}

/** Tout ce qui dépend de l'OS est derrière cette interface (module « platform »). */
export interface PortsPlatform {
  listListening(): Promise<ListeningPort[]>;
  /** Envoie une demande d'arrêt (force = arrêt immédiat sans nettoyage). */
  kill(pid: number, force: boolean): Promise<void>;
  isAlive(pid: number): Promise<boolean>;
}
