import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLsofCwd, parseLsofListening, splitAddress } from '../src/platform/parse-lsof';
import { parseNetstat, parseTasklist } from '../src/platform/parse-netstat';
import type { ListeningPort } from '../src/platform/types';
import { extractDeclaredPorts } from '../src/ports/declared';
import { groupPorts, isEditorProcess, isInside, portsOfPid } from '../src/ports/group';

const fx = (name: string): string => readFileSync(join(process.cwd(), 'test/fixtures/platform', name), 'utf8');

describe('splitAddress', () => {
  it('gère IPv4, IPv6, joker et valeurs invalides', () => {
    expect(splitAddress('*:3000')).toEqual({ address: '*', port: 3000 });
    expect(splitAddress('127.0.0.1:5432')).toEqual({ address: '127.0.0.1', port: 5432 });
    expect(splitAddress('[::1]:8080')).toEqual({ address: '::1', port: 8080 });
    expect(splitAddress('localhost:http')).toBeUndefined();
    expect(splitAddress('*:0')).toBeUndefined();
    expect(splitAddress('*:70000')).toBeUndefined();
    expect(splitAddress('pas-de-port')).toBeUndefined();
  });
});

describe('parseLsofListening', () => {
  const ports = parseLsofListening(fx('lsof-listen.txt'));

  it('extrait pid, nom, utilisateur et port, sans doublon IPv4/IPv6', () => {
    expect(ports.map((p) => `${p.pid}:${p.port}`)).toEqual(['1234:3000', '1234:24678', '5678:5432', '4321:7000']);
    expect(ports[0]).toMatchObject({ processName: 'node', user: 'nicolas', address: '*' });
  });

  it('renvoie [] pour une sortie vide', () => {
    expect(parseLsofListening('')).toEqual([]);
  });
});

describe('parseLsofCwd', () => {
  it('associe chaque pid à son dossier de travail', () => {
    const cwds = parseLsofCwd(fx('lsof-cwd.txt'));
    expect(cwds.get(1234)).toBe('/home/nicolas/work/app');
    expect(cwds.get(5678)).toBe('/var/lib/postgresql');
  });
});

describe('parseNetstat', () => {
  it('ne garde que les sockets en écoute, quelle que soit la langue de Windows', () => {
    const entries = parseNetstat(fx('netstat-v4.txt'));
    expect(entries.map((e) => `${e.pid}:${e.port}`)).toEqual(['1024:135', '8888:3000', '7777:5432']);
  });

  it('lit aussi la sortie IPv6', () => {
    const entries = parseNetstat(fx('netstat-v6.txt'));
    expect(entries).toEqual([
      { port: 3000, pid: 8888, address: '::' },
      { port: 8080, pid: 9999, address: '::1' },
    ]);
  });
});

describe('parseTasklist', () => {
  it('associe pid et nom de processus', () => {
    const names = parseTasklist(fx('tasklist.txt'));
    expect(names.get(8888)).toBe('node.exe');
    expect(names.get(9999)).toBe('java.exe');
  });
});

describe('extractDeclaredPorts', () => {
  it('lit PORT et *_PORT et ignore tout le reste', () => {
    const env = [
      '# commentaire',
      'PORT=3000',
      'export API_PORT="4000" # api',
      'DB_PORT = 5432',
      'PORTAL=8080',
      'SECRET=abc123',
      'BAD_PORT=hello',
      'HUGE_PORT=999999',
    ].join('\n');
    expect(extractDeclaredPorts(env).sort((a, b) => a - b)).toEqual([3000, 4000, 5432]);
  });
});

describe('groupPorts', () => {
  const port = (n: number, extra: Partial<ListeningPort> = {}): ListeningPort => ({
    port: n,
    pid: n + 1000,
    processName: 'node',
    address: '*',
    user: 'nicolas',
    ...extra,
  });
  const context = { declared: new Set([3000]), workspaceDirs: ['/home/nicolas/work'], username: 'nicolas' };

  it('sépare projet, autres processus de l’utilisateur et autres utilisateurs', () => {
    const groups = groupPorts(
      [
        port(5432, { cwd: '/var/lib/postgresql' }),
        port(3000),
        port(24678, { cwd: '/home/nicolas/work/app' }),
        port(7000, { user: 'root' }),
      ],
      context,
    );
    expect(groups.project.map((p) => p.port)).toEqual([3000, 24678]);
    expect(groups.others.map((p) => p.port)).toEqual([5432]);
    expect(groups.foreign.map((p) => p.port)).toEqual([7000]);
  });

  it('un port d’un autre utilisateur n’est jamais « du projet », même déclaré dans .env', () => {
    const groups = groupPorts([port(3000, { user: 'root' })], context);
    expect(groups.project).toEqual([]);
    expect(groups.foreign).toHaveLength(1);
  });

  it('sans utilisateur connu (Windows), le port reste proposé', () => {
    const groups = groupPorts([port(9000, { user: undefined })], context);
    expect(groups.others).toHaveLength(1);
  });
});

describe('isInside', () => {
  it('reconnaît un dossier dans un autre, pas un dossier voisin', () => {
    expect(isInside('/a/b/c', '/a/b')).toBe(true);
    expect(isInside('/a/b', '/a/b')).toBe(true);
    expect(isInside('/a/bc', '/a/b')).toBe(false);
    expect(isInside('/x', '/a/b')).toBe(false);
  });
});

describe("processus de l'éditeur et ports d'un même PID", () => {
  const mk = (pid: number, port: number, processName: string, cwd = '/w/app'): ListeningPort => ({ pid, port, processName, address: '*', user: 'nico', cwd });

  it("reconnaît les helpers d'éditeur", () => {
    for (const n of ['Code Helper (Plugin)', 'Cursor Helper', 'Electron', 'Code.exe']) expect(isEditorProcess(n)).toBe(true);
    for (const n of ['node', 'codex', 'java']) expect(isEditorProcess(n)).toBe(false);
  });

  it("range un helper d'éditeur dans « autres » même lancé dans le workspace", () => {
    const g = groupPorts([mk(1, 3000, 'node'), mk(2, 61512, 'Code Helper (Plugin)')], { declared: new Set(), workspaceDirs: ['/w/app'], username: 'nico' });
    expect(g.project.map((p) => p.port)).toEqual([3000]);
    expect(g.others.map((p) => p.port)).toEqual([61512]);
  });

  it("liste les ports d'un PID triés", () => {
    expect(portsOfPid([mk(1, 8089, 'node'), mk(1, 3000, 'node'), mk(2, 5432, 'pg'), mk(1, 3000, 'node')], 1)).toEqual([3000, 8089]);
  });
});
