import * as vscode from 'vscode';
import type { GroupNode, Section, SectionId, TreeNode } from './nodes';

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
  // Objets groupes uniques : VS Code retrouve un nœud par identité, donc on réutilise les mêmes
  // pour pouvoir rafraîchir une seule section sans réinitialiser les autres.
  private readonly groupNodes = new Map<SectionId, GroupNode>(
    GROUPS.map((g) => [g.id, { kind: 'group', section: g.id } as GroupNode]),
  );

  constructor(sections: Section[]) {
    for (const section of sections) this.sections.set(section.id, section);
  }

  /** Rafraîchit tout l'arbre. */
  refresh(): void {
    this.emitter.fire(undefined);
  }

  /** Rafraîchit uniquement une section (ex. les ports toutes les 5 s). */
  refreshSection(id: SectionId): void {
    this.emitter.fire(this.groupNodes.get(id));
  }

  getChildren(node?: TreeNode): Thenable<TreeNode[]> | TreeNode[] {
    if (!node) return GROUPS.map((g) => this.groupNodes.get(g.id)!);
    return this.sections.get(node.section)?.getChildren(node) ?? [];
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    if (node.kind === 'group') {
      const group = GROUPS.find((g) => g.id === node.section)!;
      const item = new vscode.TreeItem(group.label, vscode.TreeItemCollapsibleState.Expanded);
      item.id = `group:${group.id}`;
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
