import type { DetectedCommand } from './types';

// « cible: dépendances » en début de ligne. Les affectations (VAR := x, VAR = x) sont exclues
// car '=' ne peut pas figurer dans le nom, et « := » / « :: » sont écartés par le lookahead.
const TARGET_LINE = /^([^\s#:=\t][^:=#\n]*?)\s*:(?![=:])/;
const SAFE_TARGET = /^[A-Za-z0-9_][A-Za-z0-9_.\-]*$/;

/** Makefile → une commande « make <cible> » par cible explicite (hors règles génériques et cibles spéciales). */
export function detectMakefile(content: string): DetectedCommand[] {
  const seen = new Set<string>();
  const commands: DetectedCommand[] = [];

  for (const line of content.split(/\r?\n/)) {
    const match = TARGET_LINE.exec(line);
    if (!match) continue;
    // Une ligne peut déclarer plusieurs cibles : « build test: deps ».
    for (const target of match[1].trim().split(/\s+/)) {
      if (target.startsWith('.') || !SAFE_TARGET.test(target) || seen.has(target)) continue;
      seen.add(target);
      commands.push({ label: target, command: `make ${target}`, source: 'make' });
    }
  }
  return commands;
}
