import * as vscode from 'vscode';
import { analyzeEnvDir, type EnvReport } from '../env/analyze';
import type { EnvDirNode, EnvGroupNode, Section, TreeNode } from './nodes';

export interface EnvDirInput {
  /** Dossier absolu. */
  dir: string;
  /** Nom affiché. */
  label: string;
}

const GROUP_META: Record<EnvGroupNode['id'], { label: string; icon: string; color?: string; expanded: boolean }> = {
  missing: { label: 'Manquantes', icon: 'error', color: 'list.errorForeground', expanded: true },
  empty: { label: 'Vides', icon: 'warning', color: 'list.warningForeground', expanded: true },
  extra: { label: 'En trop', icon: 'info', expanded: false },
};

const targetKey = (dir: string): string => `cockpit.envTarget:${dir}`;

/**
 * Groupe « Environnement » : compare .env au gabarit (.env.example / .sample / .template).
 * N'expose que des noms de variables, jamais leurs valeurs.
 */
export class EnvSection implements Section {
  readonly id = 'env' as const;
  private reports: EnvReport[] = [];
  private loaded = false;

  constructor(
    private readonly getDirs: () => EnvDirInput[],
    private readonly state: vscode.Memento,
  ) {}

  async refresh(): Promise<void> {
    const reports = await Promise.all(
      this.getDirs().map(({ dir, label }) => analyzeEnvDir(dir, label, this.state.get<string>(targetKey(dir)))),
    );
    this.reports = reports.filter((r): r is EnvReport => r !== undefined);
    this.loaded = true;
  }

  /** Mémorise le fichier .env* à comparer pour un dossier. */
  async setTarget(dir: string, target: string): Promise<void> {
    await this.state.update(targetKey(dir), target);
  }

  getChildren(node: TreeNode): TreeNode[] {
    if (node.kind === 'group') {
      if (!this.loaded) return [this.message('Analyse de l’environnement…', 'sync~spin')];
      if (this.reports.length === 0) {
        return [this.message('Aucun .env ni .env.example trouvé', 'info')];
      }
      return this.reports.map((report): EnvDirNode => ({ kind: 'envDir', section: 'env', report }));
    }
    if (node.kind === 'envDir') return this.dirChildren(node.report);
    if (node.kind === 'envGroup') {
      return node.keys.map((key) => ({ kind: 'envVar', section: 'env', key, parentId: `${node.report.dir}:${node.id}` }));
    }
    return [];
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    switch (node.kind) {
      case 'message':
        return this.messageItem(node.label, node.icon, node.description);
      case 'envDir':
        return this.dirItem(node.report);
      case 'envGroup':
        return this.groupItem(node);
      case 'envVar': {
        const item = new vscode.TreeItem(node.key);
        item.id = `envvar:${node.parentId}:${node.key}`;
        item.iconPath = new vscode.ThemeIcon('symbol-variable');
        return item;
      }
      case 'envAction': {
        const { report } = node;
        const item = new vscode.TreeItem(`Créer ${report.target} depuis ${report.template}`);
        item.id = `envaction:${report.dir}`;
        item.iconPath = new vscode.ThemeIcon('add');
        item.command = { command: 'cockpit.createEnv', title: 'Créer .env', arguments: [node] };
        return item;
      }
      default:
        return new vscode.TreeItem('');
    }
  }

  private dirChildren(report: EnvReport): TreeNode[] {
    if (!report.template) {
      return [this.message('Aucun .env.example, .env.sample ni .env.template', 'info')];
    }
    if (!report.targetExists) return [{ kind: 'envAction', section: 'env', report }];
    if (report.unreadable || !report.comparison) {
      return [this.message(`${report.target} illisible`, 'warning')];
    }

    const { missing, empty, extra } = report.comparison;
    const groups: Array<[EnvGroupNode['id'], string[]]> = [['missing', missing], ['empty', empty], ['extra', extra]];
    const nodes = groups
      .filter(([, keys]) => keys.length > 0)
      .map(([id, keys]): EnvGroupNode => ({ kind: 'envGroup', section: 'env', report, id, keys }));
    return nodes.length > 0 ? nodes : [this.message('Tout est à jour', 'pass')];
  }

  private dirItem(report: EnvReport): vscode.TreeItem {
    const item = new vscode.TreeItem(report.label, vscode.TreeItemCollapsibleState.Expanded);
    item.id = `envdir:${report.dir}`;
    item.contextValue = report.targets.length > 1 ? 'cockpit.envDir.multi' : 'cockpit.envDir';

    if (!report.template) {
      item.description = 'pas de gabarit';
      item.iconPath = new vscode.ThemeIcon('info');
    } else if (!report.targetExists) {
      item.description = `${report.target} absent`;
      item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
    } else if (report.comparison) {
      const { missing, empty, extra } = report.comparison;
      const problems = missing.length + empty.length;
      item.description = `${report.target} ↔ ${report.template}` + (problems + extra.length === 0 ? ' · à jour' : '');
      item.iconPath =
        problems > 0
          ? new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'))
          : new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
    } else {
      item.description = `${report.target} illisible`;
      item.iconPath = new vscode.ThemeIcon('warning');
    }
    item.tooltip = report.targets.length > 1 ? `Fichier comparé : ${report.target} (bouton pour en changer)` : undefined;
    return item;
  }

  private groupItem(node: EnvGroupNode): vscode.TreeItem {
    const meta = GROUP_META[node.id];
    const item = new vscode.TreeItem(
      meta.label,
      meta.expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
    );
    item.id = `envgroup:${node.report.dir}:${node.id}`;
    item.description = String(node.keys.length);
    item.iconPath = new vscode.ThemeIcon(meta.icon, meta.color ? new vscode.ThemeColor(meta.color) : undefined);
    return item;
  }

  private message(label: string, icon: string): TreeNode {
    return { kind: 'message', section: 'env', label, icon };
  }

  private messageItem(label: string, icon?: string, description?: string): vscode.TreeItem {
    const item = new vscode.TreeItem(label);
    item.id = `msg:env:${label}`;
    item.description = description;
    if (icon) item.iconPath = new vscode.ThemeIcon(icon);
    return item;
  }
}
