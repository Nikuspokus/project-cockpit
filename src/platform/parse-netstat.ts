import { splitAddress } from './parse-lsof';

export interface NetstatEntry {
  port: number;
  pid: number;
  address: string;
}

// Une socket en écoute n'a pas de pair distant : « 0.0.0.0:0 », « [::]:0 » ou « *:* ».
// On se base là-dessus plutôt que sur le mot « LISTENING », traduit selon la langue de Windows.
const NO_REMOTE = /^(0\.0\.0\.0|\[::\]|\*):(0|\*)$/;

/** Analyse la sortie de `netstat -ano -p TCP` (et TCPv6). */
export function parseNetstat(output: string): NetstatEntry[] {
  const entries = new Map<string, NetstatEntry>();
  for (const line of output.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5 || cols[0].toUpperCase() !== 'TCP') continue;
    const [, local, remote] = cols;
    if (!NO_REMOTE.test(remote)) continue;
    const pid = Number(cols[cols.length - 1]);
    const parsed = splitAddress(local);
    if (!parsed || !Number.isInteger(pid) || pid <= 0) continue;
    const key = `${pid}:${parsed.port}`;
    if (!entries.has(key)) entries.set(key, { port: parsed.port, pid, address: parsed.address });
  }
  return [...entries.values()];
}

/** Analyse `tasklist /FO CSV /NH` : nom du processus de chaque PID. */
export function parseTasklist(output: string): Map<number, string> {
  const names = new Map<number, string>();
  for (const line of output.split(/\r?\n/)) {
    const cells = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    const pid = Number(cells[1]);
    if (cells.length >= 2 && Number.isInteger(pid) && pid > 0) names.set(pid, cells[0]);
  }
  return names;
}
