import type { DetectedCommand, WrapperOption } from './types';

/** build.gradle(.kts) → build, test, et bootRun si le plugin Spring Boot est appliqué. */
export function detectGradle(script: string, options: WrapperOption = {}): DetectedCommand[] {
  if (!script.trim()) return [];

  // On retire commentaires de bloc et lignes entièrement commentées.
  const code = script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const gradle = options.hasWrapper ? './gradlew' : 'gradle';
  const commands: DetectedCommand[] = [
    { label: 'build', command: `${gradle} build`, source: 'gradle' },
    { label: 'test', command: `${gradle} test`, source: 'gradle' },
  ];
  if (/org\.springframework\.boot/.test(code)) {
    commands.push({ label: 'bootRun', command: `${gradle} bootRun`, source: 'gradle' });
  }
  return commands;
}
