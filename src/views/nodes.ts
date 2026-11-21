import type * as vscode from 'vscode';
import type { CockpitCommand, ProjectEntry } from '../scan/workspace';

export type SectionId = 'commands' | 'ports' | 'env';

/** Dossier du workspace + projet détecté dedans. */
export interface ScannedProject {
  folder: vscode.WorkspaceFolder;
  project: ProjectEntry;
}

export interface GroupNode {
  kind: 'group';
  section: SectionId;
}

export interface MessageNode {
  kind: 'message';
  section: SectionId;
  label: string;
  description?: string;
  icon?: string;
}

export interface ProjectNode {
  kind: 'project';
  section: 'commands';
  scanned: ScannedProject;
}

export interface CommandNode {
  kind: 'command';
  section: 'commands';
  folder: vscode.WorkspaceFolder;
  command: CockpitCommand;
}

export type TreeNode = GroupNode | MessageNode | ProjectNode | CommandNode;

/** Une section de l'arbre (Commandes, Ports, Environnement) gère ses propres nœuds. */
export interface Section {
  readonly id: SectionId;
  getChildren(node: TreeNode): Promise<TreeNode[]> | TreeNode[];
  getTreeItem(node: TreeNode): vscode.TreeItem;
}
