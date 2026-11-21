import type { DetectedCommand } from './types';

/** docker-compose.yml / compose.yaml → up, down, logs (si une section « services: » existe). */
export function detectCompose(content: string): DetectedCommand[] {
  if (!/^services\s*:/m.test(content)) return [];
  return [
    { label: 'up', command: 'docker compose up', source: 'compose' },
    { label: 'down', command: 'docker compose down', source: 'compose' },
    { label: 'logs', command: 'docker compose logs -f', source: 'compose' },
  ];
}
