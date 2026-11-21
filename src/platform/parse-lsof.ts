import type { ListeningPort } from './types';

/**
 * Découpe « hôte:port » (IPv4, IPv6 entre crochets, joker « * »). Renvoie undefined si pas de port numérique.
 */
export function splitAddress(name: string): { address: string; port: number } | undefined {
  const index = name.lastIndexOf(':');
  if (index < 0) return undefined;
  const port = Number(name.slice(index + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined;
  const address = name.slice(0, index).replace(/^\[|\]$/g, '');
  return { address, port };
}

/**
 * Analyse la sortie de `lsof +c 0 -nP -iTCP -sTCP:LISTEN -F pcLn`.
 * Format « -F » : une valeur par ligne, la première lettre dit de quoi il s'agit
 * (p = PID, c = commande, L = utilisateur, n = adresse). Dédoublonne IPv4/IPv6 (même pid + port).
 */
export function parseLsofListening(output: string): ListeningPort[] {
  const ports = new Map<string, ListeningPort>();
  let pid = 0;
  let processName = '';
  let user: string | undefined;

  for (const line of output.split(/\r?\n/)) {
    const field = line[0];
    const value = line.slice(1);
    if (field === 'p') {
      pid = Number(value);
      processName = '';
      user = undefined;
    } else if (field === 'c') {
      processName = value;
    } else if (field === 'L') {
      user = value;
    } else if (field === 'n' && Number.isInteger(pid) && pid > 0) {
      const parsed = splitAddress(value);
      if (!parsed) continue;
      const key = `${pid}:${parsed.port}`;
      if (!ports.has(key)) {
        ports.set(key, { port: parsed.port, pid, processName, address: parsed.address, user });
      }
    }
  }
  return [...ports.values()];
}

/** Analyse `lsof -a -d cwd -p <pids> -Fpn` : dossier de travail de chaque PID. */
export function parseLsofCwd(output: string): Map<number, string> {
  const cwds = new Map<number, string>();
  let pid = 0;
  for (const line of output.split(/\r?\n/)) {
    if (line[0] === 'p') pid = Number(line.slice(1));
    else if (line[0] === 'n' && pid > 0) cwds.set(pid, line.slice(1));
  }
  return cwds;
}
