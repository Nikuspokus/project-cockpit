import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectCompose } from '../src/detectors/compose';
import { detectGradle } from '../src/detectors/gradle';
import { detectMakefile } from '../src/detectors/makefile';
import { detectMaven } from '../src/detectors/maven';
import { detectNpmScripts, detectPackageManager } from '../src/detectors/npm';

// Les tests tournent depuis la racine du dépôt (npm test).
const fx = (path: string): string => readFileSync(join(process.cwd(), 'test/fixtures', path), 'utf8');
const commands = (list: { command: string }[]): string[] => list.map((c) => c.command);

describe('detectPackageManager', () => {
  it('déduit le gestionnaire du lockfile', () => {
    expect(detectPackageManager(['package.json', 'pnpm-lock.yaml'])).toBe('pnpm');
    expect(detectPackageManager(['yarn.lock'])).toBe('yarn');
    expect(detectPackageManager(['bun.lockb'])).toBe('bun');
    expect(detectPackageManager(['bun.lock'])).toBe('bun');
    expect(detectPackageManager(['package-lock.json'])).toBe('npm');
  });

  it('retombe sur le champ packageManager, puis sur npm', () => {
    expect(detectPackageManager(['package.json'], fx('pnpm/package.json'))).toBe('pnpm');
    expect(detectPackageManager(['package.json'], fx('npm/package.json'))).toBe('npm');
    expect(detectPackageManager(['package.json'], '{ pas du json')).toBe('npm');
  });

  it('le lockfile l’emporte sur packageManager', () => {
    expect(detectPackageManager(['yarn.lock'], fx('pnpm/package.json'))).toBe('yarn');
  });
});

describe('detectNpmScripts', () => {
  it('liste les scripts avec le gestionnaire npm', () => {
    const list = detectNpmScripts(fx('npm/package.json'), 'npm');
    expect(commands(list)).toEqual(['npm run dev', 'npm run build', 'npm run test:unit']);
    expect(list[0]).toMatchObject({ label: 'dev', source: 'npm', detail: 'vite' });
  });

  it('utilise pnpm, yarn ou bun selon le gestionnaire', () => {
    expect(commands(detectNpmScripts(fx('pnpm/package.json'), 'pnpm'))).toEqual([
      'pnpm run dev',
      'pnpm run build',
    ]);
    expect(commands(detectNpmScripts(fx('pnpm/package.json'), 'yarn'))[0]).toBe('yarn run dev');
    expect(commands(detectNpmScripts(fx('pnpm/package.json'), 'bun'))[0]).toBe('bun run dev');
  });

  it('ignore les noms de scripts dangereux ou invalides', () => {
    const names = detectNpmScripts(fx('npm/package.json'), 'npm').map((c) => c.label);
    expect(names).not.toContain('bad name');
    expect(names).not.toContain('evil;rm');
  });

  it('renvoie [] pour un JSON invalide ou sans scripts', () => {
    expect(detectNpmScripts('{ nope', 'npm')).toEqual([]);
    expect(detectNpmScripts('{"name":"x"}', 'npm')).toEqual([]);
    expect(detectNpmScripts('{"scripts":"oops"}', 'npm')).toEqual([]);
  });
});

describe('detectMaven', () => {
  it('ajoute spring-boot:run quand le plugin est présent', () => {
    expect(commands(detectMaven(fx('maven/pom.xml')))).toEqual([
      'mvn clean install',
      'mvn test',
      'mvn spring-boot:run',
    ]);
  });

  it('n’ajoute pas spring-boot:run si le plugin est seulement commenté', () => {
    expect(commands(detectMaven(fx('maven-plain/pom.xml')))).toEqual(['mvn clean install', 'mvn test']);
  });

  it('utilise ./mvnw quand le wrapper existe', () => {
    expect(commands(detectMaven(fx('maven/pom.xml'), { hasWrapper: true }))[0]).toBe('./mvnw clean install');
  });

  it('renvoie [] si le contenu n’est pas un pom', () => {
    expect(detectMaven('hello')).toEqual([]);
  });
});

describe('detectGradle', () => {
  it('ajoute bootRun quand Spring Boot est appliqué (Kotlin DSL)', () => {
    expect(commands(detectGradle(fx('gradle/build.gradle.kts'), { hasWrapper: true }))).toEqual([
      './gradlew build',
      './gradlew test',
      './gradlew bootRun',
    ]);
  });

  it('ignore un plugin Spring Boot commenté (Groovy DSL)', () => {
    expect(commands(detectGradle(fx('gradle-plain/build.gradle'), { hasWrapper: true }))).toEqual([
      './gradlew build',
      './gradlew test',
    ]);
  });

  it('retombe sur gradle global sans wrapper', () => {
    expect(commands(detectGradle(fx('gradle/build.gradle.kts')))[0]).toBe('gradle build');
  });

  it('renvoie [] pour un fichier vide', () => {
    expect(detectGradle('  \n')).toEqual([]);
  });
});

describe('detectMakefile', () => {
  it('extrait les cibles explicites sans doublons ni cibles spéciales', () => {
    expect(commands(detectMakefile(fx('make/Makefile')))).toEqual([
      'make build',
      'make test',
      'make clean',
      'make lint',
    ]);
  });

  it('gère les fins de ligne Windows (CRLF)', () => {
    expect(commands(detectMakefile('all:\r\n\techo ok\r\n'))).toEqual(['make all']);
  });
});

describe('detectCompose', () => {
  it('propose up, down et logs', () => {
    expect(commands(detectCompose(fx('compose/docker-compose.yml')))).toEqual([
      'docker compose up',
      'docker compose down',
      'docker compose logs -f',
    ]);
  });

  it('renvoie [] sans section services', () => {
    expect(detectCompose('version: "3"\n')).toEqual([]);
  });
});

describe('scripts npm : hooks masqués', () => {
  it('masque pre/post des scripts existants et le cycle de vie, garde preview', () => {
    const pkg = JSON.stringify({ scripts: { build: 'tsc', prebuild: 'rm -rf dist', postbuild: 'x', prepare: 'husky', preview: 'vite preview', predeploy: 'x' } });
    const labels = detectNpmScripts(pkg, 'npm').map((c) => c.label);
    expect(labels).toEqual(['build', 'preview', 'predeploy']);
  });
});
