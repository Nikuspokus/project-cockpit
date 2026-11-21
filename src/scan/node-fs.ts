import { promises as fsp } from 'node:fs';
import type { ScanFs } from './workspace';

/** Implémentation réelle de ScanFs (disque local). */
export const nodeFs: ScanFs = {
  async readDir(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
  },
  readFile: (file) => fsp.readFile(file, 'utf8'),
};
