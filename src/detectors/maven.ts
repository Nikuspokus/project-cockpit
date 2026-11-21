import type { DetectedCommand, WrapperOption } from './types';

/** pom.xml → clean install, test, et spring-boot:run si le plugin Spring Boot est déclaré. */
export function detectMaven(pom: string, options: WrapperOption = {}): DetectedCommand[] {
  // On retire les commentaires XML pour ne pas détecter un plugin commenté.
  const xml = pom.replace(/<!--[\s\S]*?-->/g, '');
  if (!/<project[\s>]/.test(xml)) return [];

  const mvn = options.hasWrapper ? './mvnw' : 'mvn';
  const commands: DetectedCommand[] = [
    { label: 'clean install', command: `${mvn} clean install`, source: 'maven' },
    { label: 'test', command: `${mvn} test`, source: 'maven' },
  ];
  if (xml.includes('spring-boot-maven-plugin')) {
    commands.push({ label: 'spring-boot:run', command: `${mvn} spring-boot:run`, source: 'maven' });
  }
  return commands;
}
