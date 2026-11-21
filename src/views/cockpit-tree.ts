import * as vscode from 'vscode';
import type { Section, SectionId, TreeNode } from './nodes';

const GROUPS: ReadonlyArray<{ id: SectionId; label: string; icon: string }> = [
  { id: 'commands', label: 'Commandes', icon: 'terminal' },
  { id: 'ports', label: 'Ports', icon: 'broadcast' },
  { id: 'env', label: 'Environnement', icon: 'key' },
];

/** Arbre unique « Cockpit » : trois groupes, chacun délégué à sa section. */
export class CockpitTreeProvider implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly sections = new Map<SectionId, Section>();

  constructor(sections: Section[]) {
    for (const section of sections) this.sections.set(section.id, section);
  }

  /** Rafraîchit tout l'arbre, ou seulement le nœud donné. */
  refresh(node?: TreeNode): void {
    this.emitter.fire(node);
  }

  getChildren(node?: TreeNode): Thenable<TreeNode[]> | TreeNode[] {
    if (!node) return GROUPS.map((g): TreeNode => ({ kind: 'group', section: g.id }));
    return this.sections.get(node.section)?.getChildren(node) ?? [];
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    if (node.kind === 'group') {
      const group = GROUPS.find((g) => g.id === node.section)!;
      const item = new vscode.TreeItem(group.label, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = new vscode.ThemeIcon(group.icon);
      item.contextValue = `cockpit.group.${group.id}`;
      return item;
    }
    return this.sections.get(node.section)?.getTreeItem(node) ?? new vscode.TreeItem('');
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
