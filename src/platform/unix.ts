import { run } from './exec';
import { parseLsofCwd, parseLsofListening } from './parse-lsof';
import type { ListeningPort, PortsPlatform } from './types';

/** macOS et Linux : lsof pour lister, signaux POSIX pour arrêter. */
export const unixPlatform: PortsPlatform = {
  async listListening() {
    let ports: ListeningPort[];
    try {
      const listing = await run('lsof', ['+c', '0', '-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pcLn']);
      ports = parseLsofListening(listing.stdout);
    } catch {
      throw new Error('lsof est introuvable : installez-le (ex. « sudo apt install lsof »).');
    }
    if (ports.length === 0) return ports;

    // Second appel : dossier de travail de chaque processus (sert à repérer ceux du projet).
    try {
      const pids = [...new Set(ports.map((p) => p.pid))].join(',');
      const cwdResult = await run('lsof', ['-a', '-d', 'cwd', '-p', pids, '-Fpn']);
      const cwds = parseLsofCwd(cwdResult.stdout);
      for (const p of ports) p.cwd = cwds.get(p.pid);
    } catch {
      // Optionnel : sans cwd, on garde la liste des ports.
    }
    return ports;
  },

  async kill(pid, force) {
    process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
  },

  async isAlive(pid) {
    try {
      process.kill(pid, 0); // signal 0 = simple test d'existence
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EPERM'; // existe mais n'est pas à nous
    }
    // Un processus « zombie » (terminé, pas encore récupéré par son parent) répond au signal 0
    // alors qu'il a déjà libéré ses ports : on le considère comme mort.
    try {
      const { stdout } = await run('ps', ['-o', 'stat=', '-p', String(pid)], 2000);
      if (stdout.trim().startsWith('Z')) return false;
    } catch {
      // ps indisponible : on s'en tient au résultat du signal 0
    }
    return true;
  },
};
