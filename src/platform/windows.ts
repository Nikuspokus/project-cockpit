import { run } from './exec';
import { parseNetstat, parseTasklist, type NetstatEntry } from './parse-netstat';
import type { ListeningPort, PortsPlatform } from './types';

/** Windows : netstat -ano pour lister, tasklist pour les noms, taskkill pour arrêter. */
export const windowsPlatform: PortsPlatform = {
  async listListening() {
    let entries: NetstatEntry[];
    try {
      const v4 = await run('netstat', ['-ano', '-p', 'TCP']);
      entries = parseNetstat(v4.stdout);
      try {
        const v6 = await run('netstat', ['-ano', '-p', 'TCPv6']);
        entries.push(...parseNetstat(v6.stdout));
      } catch {
        // IPv6 indisponible : on garde IPv4
      }
    } catch {
      throw new Error('netstat est introuvable.');
    }

    let names = new Map<number, string>();
    try {
      names = parseTasklist((await run('tasklist', ['/FO', 'CSV', '/NH'])).stdout);
    } catch {
      // Sans noms, on affichera « PID n ».
    }

    const seen = new Set<string>();
    const ports: ListeningPort[] = [];
    for (const e of entries) {
      const key = `${e.pid}:${e.port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ports.push({ port: e.port, pid: e.pid, address: e.address, processName: names.get(e.pid) ?? '' });
    }
    return ports;
  },

  async kill(pid, force) {
    const args = ['/PID', String(pid), '/T', ...(force ? ['/F'] : [])];
    const result = await run('taskkill', args);
    if (result.code !== 0) {
      throw new Error((result.stderr || result.stdout).trim() || `taskkill a échoué (code ${result.code})`);
    }
  },

  async isAlive(pid) {
    const result = await run('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
    return parseTasklist(result.stdout).has(pid);
  },
};
