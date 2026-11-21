import type * as vscode from 'vscode';
import type { ScannedProject } from '../views/nodes';
import { nodeFs } from './node-fs';
import { scanWorkspace } from './workspace';

/** Scanne chaque dossier du workspace (dossiers locaux uniquement). */
export async function scanFolders(folders: readonly vscode.WorkspaceFolder[]): Promise<ScannedProject[]> {
  const results: ScannedProject[] = [];
  for (const folder of folders) {
    if (folder.uri.scheme !== 'file') continue;
    for (const project of await scanWorkspace(nodeFs, folder.uri.fsPath)) {
      results.push({ folder, project });
    }
  }
  return results;
}
