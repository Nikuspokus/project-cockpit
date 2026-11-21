import * as vscode from 'vscode';
import type { Section, SectionId, TreeNode } from './nodes';

/** Section provisoire (remplacée par les vraies sections aux étapes suivantes). */
export class PlaceholderSection implements Section {
  constructor(readonly id: SectionId) {}

  getChildren(node: TreeNode): TreeNode[] {
    return node.kind === 'group'
      ? [{ kind: 'message', section: this.id, label: 'Bientôt disponible', icon: 'clock' }]
      : [];
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.kind === 'message' ? node.label : '');
    if (node.kind === 'message' && node.icon) item.iconPath = new vscode.ThemeIcon(node.icon);
    return item;
  }
}
