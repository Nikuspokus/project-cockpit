import { describe, expect, it } from 'vitest';
import { PRO_HOOKS, resolveHookState } from '../src/pro/features';
import { StubLicenseService } from '../src/pro/license';

describe('StubLicenseService', () => {
  it('est gratuit sans clé ou avec une clé vide', async () => {
    expect(await new StubLicenseService(() => undefined).isPro()).toBe(false);
    expect(await new StubLicenseService(() => '').isPro()).toBe(false);
    expect(await new StubLicenseService(() => '   ').isPro()).toBe(false);
  });

  it('accepte toute clé non vide (stub, sans appel réseau)', async () => {
    expect(await new StubLicenseService(() => 'ABCD-1234').isPro()).toBe(true);
  });

  it('relit la clé à chaque appel', async () => {
    let key = '';
    const license = new StubLicenseService(() => key);
    expect(await license.isPro()).toBe(false);
    key = 'abc';
    expect(await license.isPro()).toBe(true);
  });
});

describe('resolveHookState', () => {
  it('verrouille sans extension Pro, exige une licence avec, débloque sinon', () => {
    expect(resolveHookState(false, false)).toBe('locked');
    expect(resolveHookState(false, true)).toBe('locked');
    expect(resolveHookState(true, false)).toBe('license-required');
    expect(resolveHookState(true, true)).toBe('unlocked');
  });
});

describe('PRO_HOOKS', () => {
  it('couvre les trois fonctionnalités annoncées, une par groupe', () => {
    expect(PRO_HOOKS.map((h) => h.id)).toEqual(['profiles', 'port-history', 'team-config']);
    expect(PRO_HOOKS.map((h) => h.section)).toEqual(['commands', 'ports', 'env']);
  });
});
