import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nodeFs } from '../src/scan/node-fs';
import { scanWorkspace, type ScanFs } from '../src/scan/workspace';

/** Faux système de fichiers : { 'chemin/absolu': contenu } ; un dossier = chemin se terminant par « / ». */
function memoryFs(files: Record<string, string>): ScanFs {
  return {
    async readDir(dir) {
      const prefix = dir.endsWith('/') ? dir : `${dir}/`;
      const children = new Map<string, boolean>();
      for (const file of Object.keys(files)) {
        if (!file.startsWith(prefix)) continue;
        const [first, ...rest] = file.slice(prefix.length).split('/');
        if (first) children.set(first, rest.length > 0);
      }
      if (children.size === 0) throw new Error('ENOENT');
      return [...children].map(([name, isDirectory]) => ({ name, isDirectory }));
    },
    async readFile(file) {
      if (!(file in files)) throw new Error('ENOENT');
      return files[file];
    },
  };
}

const pkg = (script: string): string => JSON.stringify({ scripts: { [script]: 'echo' } });

describe('scanWorkspace — monorepo réel (fixtures)', () => {
  it('trouve un projet par dossier, jusqu’à la profondeur 3', async () => {
    const root = join(process.cwd(), 'test/fixtures/monorepo');
    const projects = await scanWorkspace(nodeFs, root);

    expect(projects.map((p) => p.dir)).toEqual([
      '',
      'a/b/c',
      'apps/api',
      'apps/web',
      'infra',
      'services/gateway',
    ]);

    const byDir = Object.fromEntries(projects.map((p) => [p.dir, p.commands.map((c) => c.command)]));
    expect(byDir['']).toEqual(['pnpm run lint']);
    expect(byDir['a/b/c']).toEqual(['npm run dev']);
    expect(byDir['apps/web']).toEqual(['yarn run dev']);
    expect(byDir['apps/api']).toEqual([
      './mvnw clean install',
      './mvnw test',
      './mvnw spring-boot:run',
    ]);
    expect(byDir['infra']).toEqual(['docker compose up', 'docker compose down', 'docker compose logs -f']);
    expect(byDir['services/gateway']).toEqual(['gradle build', 'gradle test']);
  });

  it('ne descend pas sous la profondeur maximale (a/b/c/d est ignoré)', async () => {
    const root = join(process.cwd(), 'test/fixtures/monorepo');
    const projects = await scanWorkspace(nodeFs, root);
    expect(projects.some((p) => p.dir.startsWith('a/b/c/d'))).toBe(false);
  });

  it('respecte une profondeur personnalisée', async () => {
    const root = join(process.cwd(), 'test/fixtures/monorepo');
    const projects = await scanWorkspace(nodeFs, root, { maxDepth: 0 });
    expect(projects.map((p) => p.dir)).toEqual(['']);
  });

  it('donne un id stable et le dossier à chaque commande', async () => {
    const root = join(process.cwd(), 'test/fixtures/monorepo');
    const web = (await scanWorkspace(nodeFs, root)).find((p) => p.dir === 'apps/web');
    expect(web?.commands[0]).toMatchObject({
      id: 'apps/web::yarn::dev',
      dir: 'apps/web',
      label: 'dev',
    });
  });
});

describe('scanWorkspace — dossiers ignorés (système de fichiers en mémoire)', () => {
  const fs = memoryFs({
    '/ws/package.json': pkg('dev'),
    '/ws/node_modules/lib/package.json': pkg('lint'),
    '/ws/dist/package.json': pkg('built'),
    '/ws/target/pom.xml': '<project></project>',
    '/ws/build/Makefile': 'all:\n',
    '/ws/.git/package.json': pkg('hidden'),
    '/ws/.idea/Makefile': 'all:\n',
    '/ws/packages/ui/package.json': pkg('storybook'),
  });

  it('ignore node_modules, dist, target, build et les dossiers cachés', async () => {
    const projects = await scanWorkspace(fs, '/ws');
    expect(projects.map((p) => p.dir)).toEqual(['', 'packages/ui']);
  });

  it('accepte une liste d’ignorés personnalisée', async () => {
    const projects = await scanWorkspace(fs, '/ws', { ignore: new Set(['packages']) });
    expect(projects.map((p) => p.dir)).toEqual(['', 'build', 'dist', 'node_modules/lib', 'target']);
  });
});

describe('scanWorkspace — robustesse', () => {
  it('renvoie [] pour une racine illisible', async () => {
    expect(await scanWorkspace(memoryFs({}), '/inconnu')).toEqual([]);
  });

  it('ignore un fichier illisible sans casser le scan', async () => {
    const fs: ScanFs = {
      readDir: async () => [{ name: 'package.json', isDirectory: false }],
      readFile: async () => {
        throw new Error('EACCES');
      },
    };
    expect(await scanWorkspace(fs, '/ws')).toEqual([]);
  });
});
