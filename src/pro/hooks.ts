import * as vscode from 'vscode';
import type { ProHookNode, TreeNode } from '../views/nodes';
import type { LicenseService } from './license';
import { PRO_HOOKS, resolveHookState, type ProFeature, type ProFeatureId, type ProHookSection } from './features';

/** Gère les emplacements Pro de l'arbre : verrouillés dans le gratuit, remplis par l'extension Pro si présente. */
export class ProHooks implements vscode.Disposable {
  private readonly features = new Map<ProFeatureId, ProFeature>();
  private readonly emitter = new vscode.EventEmitter<void>();

  /** Se déclenche quand une fonctionnalité est (dés)enregistrée ou change : l'arbre se rafraîchit. */
  readonly onDidChange = this.emitter.event;

  constructor(private readonly license: LicenseService) {}

  registerFeature(feature: ProFeature): vscode.Disposable {
    if (!PRO_HOOKS.some((hook) => hook.id === feature.id)) {
      throw new Error(`Fonctionnalité Pro inconnue : ${String(feature.id)}`);
    }
    this.features.set(feature.id, feature);
    const subscription = feature.onDidChange?.(() => this.emitter.fire());
    this.emitter.fire();
    return {
      dispose: () => {
        if (this.features.get(feature.id) === feature) this.features.delete(feature.id);
        subscription?.dispose();
        this.emitter.fire();
      },
    };
  }

  /** Nœuds d'accroche à placer à la fin d'un groupe. */
  async nodesFor(section: ProHookSection | string): Promise<ProHookNode[]> {
    const hooks = PRO_HOOKS.filter((hook) => hook.section === section);
    if (hooks.length === 0) return [];
    const isPro = await this.license.isPro().catch(() => false);
    return hooks.map((hook) => ({
      kind: 'proHook',
      section: hook.section,
      hookId: hook.id,
      state: resolveHookState(this.features.has(hook.id), isPro),
    }));
  }

  async getChildren(node: TreeNode): Promise<TreeNode[]> {
    if (node.kind !== 'proHook' || node.state !== 'unlocked') return [];
    const feature = this.features.get(node.hookId);
    if (!feature) return [];
    try {
      const items = await feature.getItems();
      return items.map((item) => ({ kind: 'proItem', section: node.section, hookId: node.hookId, item }));
    } catch {
      return []; // une extension tierce défaillante ne doit pas casser l'arbre
    }
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    if (node.kind === 'proItem') {
      const item = new vscode.TreeItem(node.item.label);
      item.id = `proitem:${node.hookId}:${node.item.id}`;
      item.description = node.item.description;
      item.iconPath = new vscode.ThemeIcon(node.item.icon ?? 'circle-small');
      if (node.item.command) {
        item.command = { title: node.item.label, ...node.item.command };
      }
      return item;
    }
    if (node.kind !== 'proHook') return new vscode.TreeItem('');

    const hook = PRO_HOOKS.find((h) => h.id === node.hookId)!;
    if (node.state === 'unlocked') {
      const item = new vscode.TreeItem(hook.label, vscode.TreeItemCollapsibleState.Expanded);
      item.id = `pro:${hook.id}`;
      item.iconPath = new vscode.ThemeIcon('verified');
      item.tooltip = hook.blurb;
      return item;
    }
    const item = new vscode.TreeItem(hook.label);
    item.id = `pro:${hook.id}`;
    item.iconPath = new vscode.ThemeIcon('lock');
    item.description = node.state === 'license-required' ? 'Pro · licence requise' : 'Pro';
    item.tooltip =
      node.state === 'license-required'
        ? `${hook.blurb}\n\nRenseignez votre clé dans le réglage « cockpit.licenseKey ».`
        : `${hook.blurb}\n\nFonctionnalité Pro — cliquer pour en savoir plus.`;
    item.command = { command: 'cockpit.showPro', title: 'En savoir plus sur le Pro', arguments: [node.hookId] };
    return item;
  }

  dispose(): void {
    this.features.clear();
    this.emitter.dispose();
  }
}
