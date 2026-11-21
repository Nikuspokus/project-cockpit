import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compareEnv, listEnvTargets, parseEnvKeys, pickTemplate } from '../src/detectors/env';
import { analyzeEnvDir, createEnvFromTemplate } from '../src/env/analyze';

// Valeurs volontairement reconnaissables : on vérifie qu'elles ne fuitent jamais dans les résultats.
const SECRET = 'S3CR3T-VALUE-DO-NOT-LEAK';

describe('parseEnvKeys', () => {
  it('détecte les clés et si leur valeur est vide', () => {
    const keys = parseEnvKeys(
      [
        '# commentaire',
        'A=1',
        'B=',
        'C=""',
        "D=''",
        'E=   # note',
        'export F=value',
        'G="quoted value"',
        'H=a#b',
        '  I = spaced',
        'pas une affectation',
      ].join('\n'),
    );
    expect([...keys.keys()]).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
    const empties = [...keys].filter(([, s]) => s.empty).map(([k]) => k);
    expect(empties).toEqual(['B', 'C', 'D', 'E']);
  });

  it('gère une valeur sur plusieurs lignes sans lire ses lignes comme des clés', () => {
    const keys = parseEnvKeys(['KEY="-----BEGIN', 'FAKE=1', '-----END"', 'NEXT=ok'].join('\n'));
    expect([...keys.keys()]).toEqual(['KEY', 'NEXT']);
    expect(keys.get('KEY')?.empty).toBe(false);
  });

  it('gère les fins de ligne Windows', () => {
    expect([...parseEnvKeys('A=1\r\nB=\r\n').keys()]).toEqual(['A', 'B']);
  });

  it('ne conserve aucune valeur dans le résultat', () => {
    const keys = parseEnvKeys(`API_KEY=${SECRET}\nOTHER="${SECRET}"`);
    expect(JSON.stringify([...keys])).not.toContain(SECRET);
  });
});

describe('compareEnv', () => {
  const template = ['PORT=3000', 'DB_URL=', 'API_KEY=changeme', 'FEATURE_X=false'].join('\n');

  it('liste les variables manquantes, vides et en trop', () => {
    const env = ['PORT=3000', 'DB_URL=', `LEGACY_TOKEN=${SECRET}`].join('\n');
    expect(compareEnv(env, template)).toEqual({
      missing: ['API_KEY', 'FEATURE_X'],
      empty: ['DB_URL'],
      extra: ['LEGACY_TOKEN'],
    });
  });

  it('renvoie tout vide quand le .env est à jour', () => {
    const env = ['PORT=3000', 'DB_URL=postgres://x', 'API_KEY=abc', 'FEATURE_X=true'].join('\n');
    expect(compareEnv(env, template)).toEqual({ missing: [], empty: [], extra: [] });
  });

  it('ne laisse fuiter aucune valeur dans la comparaison', () => {
    const result = compareEnv(`PORT=${SECRET}\nEXTRA=${SECRET}`, template);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});

describe('pickTemplate / listEnvTargets', () => {
  it('choisit le gabarit selon la priorité example > sample > template', () => {
    expect(pickTemplate(['.env.template', '.env.sample'])).toBe('.env.sample');
    expect(pickTemplate(['.env.example', '.env.sample'])).toBe('.env.example');
    expect(pickTemplate(['.env'])).toBeUndefined();
  });

  it('liste les fichiers .env* comparables, .env en premier, gabarits exclus', () => {
    expect(listEnvTargets(['.env.local', '.env.example', '.env', '.env.development', '.environment', 'package.json'])).toEqual([
      '.env',
      '.env.development',
      '.env.local',
    ]);
  });
});

describe('analyzeEnvDir / createEnvFromTemplate (vrais fichiers)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cockpit-env-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('renvoie undefined sans .env ni gabarit', async () => {
    await writeFile(join(dir, 'package.json'), '{}');
    expect(await analyzeEnvDir(dir, 'app')).toBeUndefined();
  });

  it('compare .env au gabarit sans exposer de valeur', async () => {
    await writeFile(join(dir, '.env.example'), 'PORT=3000\nTOKEN=\n');
    await writeFile(join(dir, '.env'), `PORT=${SECRET}\nOLD=${SECRET}\n`);
    const report = await analyzeEnvDir(dir, 'app');
    expect(report?.comparison).toEqual({ missing: ['TOKEN'], empty: [], extra: ['OLD'] });
    expect(JSON.stringify(report)).not.toContain(SECRET);
  });

  it('utilise le fichier cible choisi, sinon retombe sur .env', async () => {
    await writeFile(join(dir, '.env.example'), 'A=\n');
    await writeFile(join(dir, '.env'), 'A=1\n');
    await writeFile(join(dir, '.env.local'), 'B=1\n');
    expect((await analyzeEnvDir(dir, 'app', '.env.local'))?.comparison).toEqual({ missing: ['A'], empty: [], extra: ['B'] });
    expect((await analyzeEnvDir(dir, 'app', '.env.absent'))?.target).toBe('.env');
  });

  it('signale l’absence de .env et propose la création depuis le gabarit', async () => {
    await writeFile(join(dir, '.env.sample'), `PORT=3000\n`);
    const report = await analyzeEnvDir(dir, 'app');
    expect(report).toMatchObject({ template: '.env.sample', targetExists: false });

    await createEnvFromTemplate(dir, '.env.sample');
    expect(await readFile(join(dir, '.env'), 'utf8')).toBe('PORT=3000\n');
  });

  it('n’écrase jamais un .env existant', async () => {
    await writeFile(join(dir, '.env.example'), 'A=template\n');
    await writeFile(join(dir, '.env'), 'A=mine\n');
    await expect(createEnvFromTemplate(dir, '.env.example')).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await readFile(join(dir, '.env'), 'utf8')).toBe('A=mine\n');
  });
});
