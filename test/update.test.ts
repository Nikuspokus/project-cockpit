import { describe, expect, it } from 'vitest';
import { updatePolicy } from '../src/update/policy';
import { isNewer, parseLatest } from '../src/update/version';

const HOME = 'https://nikuspokus.github.io/project-cockpit';
const SHA = 'a'.repeat(64);

describe('isNewer', () => {
  it('compare numériquement chaque segment', () => {
    expect(isNewer('0.2.0', '0.1.9')).toBe(true);
    expect(isNewer('0.10.0', '0.9.0')).toBe(true);
    expect(isNewer('1.0.0', '0.99.99')).toBe(true);
    expect(isNewer('0.1.10', '0.1.9')).toBe(true);
  });

  it('refuse une version égale ou plus ancienne', () => {
    expect(isNewer('0.1.0', '0.1.0')).toBe(false);
    expect(isNewer('0.1.0', '0.1.1')).toBe(false);
    expect(isNewer('0.9.0', '0.10.0')).toBe(false);
  });

  it('refuse les versions mal formées', () => {
    expect(isNewer('2.0', '1.0.0')).toBe(false);
    expect(isNewer('2.0.0-beta', '1.0.0')).toBe(false);
    expect(isNewer('abc', '1.0.0')).toBe(false);
  });
});

describe('parseLatest', () => {
  const valid = { version: '0.2.0', url: `${HOME}/project-cockpit-latest.vsix`, sha256: SHA };

  it('accepte un latest.json valide', () => {
    expect(parseLatest(valid, HOME)).toEqual(valid);
    expect(parseLatest({ version: '0.2.0', url: valid.url }, `${HOME}/`)).toEqual({ version: '0.2.0', url: valid.url, sha256: undefined });
  });

  it('refuse une URL hors de la page du projet', () => {
    expect(parseLatest({ ...valid, url: 'https://evil.example/project-cockpit-latest.vsix' }, HOME)).toBeUndefined();
    expect(parseLatest({ ...valid, url: 'https://nikuspokus.github.io/autre-projet/x.vsix' }, HOME)).toBeUndefined();
    expect(parseLatest({ ...valid, url: 'https://nikuspokus.github.io.evil.example/project-cockpit/x.vsix' }, HOME)).toBeUndefined();
  });

  it('refuse HTTP et les URL invalides', () => {
    expect(parseLatest({ ...valid, url: 'http://nikuspokus.github.io/project-cockpit/x.vsix' }, HOME)).toBeUndefined();
    expect(parseLatest({ ...valid, url: 'pas une url' }, HOME)).toBeUndefined();
    expect(parseLatest(valid, 'http://nikuspokus.github.io/project-cockpit')).toBeUndefined();
  });

  it('refuse version, empreinte ou structure invalides', () => {
    expect(parseLatest({ ...valid, version: 'latest' }, HOME)).toBeUndefined();
    expect(parseLatest({ ...valid, sha256: 'xyz' }, HOME)).toBeUndefined();
    expect(parseLatest(null, HOME)).toBeUndefined();
    expect(parseLatest('texte', HOME)).toBeUndefined();
    expect(parseLatest({ version: '0.2.0' }, HOME)).toBeUndefined();
  });
});

describe('updatePolicy', () => {
  const base = { developmentMode: false, settingEnabled: true, envDisabled: false };

  it('vérifie pour une installation depuis un .vsix', () => {
    expect(updatePolicy({ ...base, installSource: 'vsix' }).check).toBe(true);
    expect(updatePolicy({ ...base, installSource: undefined }).check).toBe(true);
  });

  it('ne vérifie pas pour une installation depuis un store', () => {
    expect(updatePolicy({ ...base, installSource: 'gallery' })).toMatchObject({ check: false });
  });

  it('respecte le réglage, la variable d’environnement et le mode développement', () => {
    expect(updatePolicy({ ...base, settingEnabled: false }).check).toBe(false);
    expect(updatePolicy({ ...base, envDisabled: true }).check).toBe(false);
    expect(updatePolicy({ ...base, developmentMode: true }).check).toBe(false);
  });
});
