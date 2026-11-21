const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const SHA256 = /^[a-f0-9]{64}$/i;

/** Informations publiées dans latest.json sur GitHub Pages. */
export interface LatestInfo {
  version: string;
  url: string;
  /** Empreinte SHA-256 du .vsix : vérifiée avant toute installation. */
  sha256?: string;
}

/** true si `candidate` est strictement plus récente que `current` (comparaison numérique x.y.z). */
export function isNewer(candidate: string, current: string): boolean {
  const a = SEMVER.exec(candidate);
  const b = SEMVER.exec(current);
  if (!a || !b) return false;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(a[i]) - Number(b[i]);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/**
 * Valide le contenu de latest.json. L'URL du .vsix doit rester sous la page du projet (HTTPS) :
 * un latest.json compromis ou erroné ne peut pas rediriger vers un autre site.
 */
export function parseLatest(raw: unknown, homepage: string): LatestInfo | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { version, url, sha256 } = raw as Record<string, unknown>;
  if (typeof version !== 'string' || !SEMVER.test(version) || typeof url !== 'string') return undefined;
  if (sha256 !== undefined && (typeof sha256 !== 'string' || !SHA256.test(sha256))) return undefined;

  try {
    const base = new URL(homepage.replace(/\/?$/, '/'));
    const target = new URL(url);
    if (base.protocol !== 'https:' || target.protocol !== 'https:' || !target.href.startsWith(base.href)) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return { version, url, sha256: sha256?.toLowerCase() };
}
