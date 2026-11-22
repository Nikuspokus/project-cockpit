import * as vscode from 'vscode';
import type { ListeningPort } from '../platform/types';
import { isEditorProcess } from '../ports/group';
import type { PortsService } from '../ports/service';
import type { PortNode, Section, TreeNode } from './nodes';

/** Groupe « Ports » : ports du projet en tête, le reste dans un sous-groupe replié. */
export class PortsSection implements Section {
  readonly id = 'ports' as const;
  private showForeign = false;

  constructor(private readonly service: PortsService) {}

  /** Bascule l'affichage des ports d'autres utilisateurs (lecture seule). */
  toggleForeign(): boolean {
    this.showForeign = !this.showForeign;
    return this.showForeign;
  }

  getChildren(node: TreeNode): TreeNode[] {
    if (node.kind === 'portGroup') return node.ports.map((p) => this.portNode(p));
    if (node.kind !== 'group') return [];

    const { loaded, error, groups, declared } = this.service.snapshot;
    if (!loaded) return [this.message('Analyse des ports…', 'sync~spin')];
    if (error) return [this.message('Ports indisponibles', 'warning', error)];

    const children: TreeNode[] = groups.project.map((p) => this.portNode(p, declared.has(p.port)));
    if (groups.project.length === 0) {
      children.push(this.message(groups.others.length ? 'Aucun port du projet en écoute' : 'Aucun port en écoute', 'info'));
    }
    if (groups.others.length) {
      children.push({ kind: 'portGroup', section: 'ports', id: 'others', ports: groups.others });
    }
    if (this.showForeign && groups.foreign.length) {
      children.push({ kind: 'portGroup', section: 'ports', id: 'foreign', ports: groups.foreign });
    }
    return children;
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    if (node.kind === 'message') {
      const item = new vscode.TreeItem(node.label);
      item.id = `msg:ports:${node.label}`;
      item.description = node.description;
      item.tooltip = node.description;
      if (node.icon) item.iconPath = new vscode.ThemeIcon(node.icon);
      return item;
    }
    if (node.kind === 'portGroup') {
      const own = node.id === 'others';
      const item = new vscode.TreeItem(
        own ? 'Autres ports' : 'Autres utilisateurs',
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.id = `portgroup:${node.id}`;
      item.description = String(node.ports.length);
      item.iconPath = new vscode.ThemeIcon(own ? 'list-unordered' : 'account');
      return item;
    }
    if (node.kind === 'port') return this.portItem(node);
    return new vscode.TreeItem('');
  }

  private portNode(port: ListeningPort, declared = this.service.snapshot.declared.has(port.port)): PortNode {
    // Seuls les processus d'autres utilisateurs sont en lecture seule.
    const killable = !this.service.snapshot.groups.foreign.includes(port) && !isEditorProcess(port.processName);
    return { kind: 'port', section: 'ports', port, declared, killable };
  }

  private message(label: string, icon: string, description?: string): TreeNode {
    return { kind: 'message', section: 'ports', label, icon, description };
  }

  private portItem({ port, declared, killable }: PortNode): vscode.TreeItem {
    const item = new vscode.TreeItem(`:${port.port}`);
    item.id = `port:${port.pid}:${port.port}`;
    const name = port.processName || 'processus';
    item.description = `${name} · PID ${port.pid}${declared ? ' · .env' : ''}`;
    item.tooltip = [
      `Port ${port.port} (${port.address || 'toutes interfaces'})`,
      `Processus : ${name} (PID ${port.pid})`,
      port.user ? `Utilisateur : ${port.user}` : undefined,
      port.cwd ? `Dossier : ${port.cwd}` : undefined,
      declared ? 'Déclaré dans un fichier .env du projet' : undefined,
      killable
        ? undefined
        : isEditorProcess(port.processName)
          ? "Lecture seule : processus de l'éditeur"
          : 'Lecture seule : ce processus appartient à un autre utilisateur',
    ]
      .filter(Boolean)
      .join('\n');
    item.iconPath = declared
      ? new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.yellow'))
      : new vscode.ThemeIcon('broadcast');
    item.contextValue = killable ? 'cockpit.port.killable' : 'cockpit.port.readonly';
    return item;
  }
}
