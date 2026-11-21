import * as vscode from 'vscode';
import type { CommandRunner } from '../runner/command-runner';
import type { CommandNode, ProjectNode, ScannedProject, Section, TreeNode } from './nodes';

/** Groupe « Commandes » : projets détectés (monorepo) et leurs commandes. */
export class CommandsSection implements Section {
  readonly id = 'commands' as const;
  private projects: ScannedProject[] = [];

  constructor(private readonly runner: CommandRunner) {}

  setProjects(projects: ScannedProject[]): void {
    this.projects = projects;
  }

  getChildren(node: TreeNode): TreeNode[] {
    if (node.kind === 'group') {
      if (!vscode.workspace.workspaceFolders?.length) {
        return [{ kind: 'message', section: 'commands', label: 'Ouvrez un dossier pour commencer', icon: 'folder-opened' }];
      }
      if (this.projects.length === 0) {
        return [{ kind: 'message', section: 'commands', label: 'Aucune commande détectée', icon: 'info' }];
      }
      // Un seul projet : commandes à plat. Monorepo : un sous-groupe par dossier.
      if (this.projects.length === 1) return this.commandNodes(this.projects[0]);
      return this.projects.map((scanned): ProjectNode => ({ kind: 'project', section: 'commands', scanned }));
    }
    if (node.kind === 'project') return this.commandNodes(node.scanned);
    return [];
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    if (node.kind === 'message') {
      const item = new vscode.TreeItem(node.label);
      item.description = node.description;
      if (node.icon) item.iconPath = new vscode.ThemeIcon(node.icon);
      return item;
    }
    if (node.kind === 'project') return this.projectItem(node);
    if (node.kind === 'command') return this.commandItem(node);
    return new vscode.TreeItem('');
  }

  private commandNodes({ folder, project }: ScannedProject): CommandNode[] {
    return project.commands.map((command) => ({ kind: 'command', section: 'commands', folder, command }));
  }

  private projectItem({ scanned }: ProjectNode): vscode.TreeItem {
    const { folder, project } = scanned;
    const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
    const label = project.dir || folder.name;
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
    item.description = multiRoot && project.dir ? folder.name : undefined;
    item.iconPath = new vscode.ThemeIcon('folder');
    item.contextValue = 'cockpit.project';
    return item;
  }

  private commandItem({ folder, command }: CommandNode): vscode.TreeItem {
    const running = this.runner.isRunning(folder, command);
    const item = new vscode.TreeItem(command.label);
    item.description = running ? 'en cours' : command.detail ?? command.source;
    item.tooltip = running
      ? `${command.command}\nEn cours — utilisez Relancer ou Stop`
      : `${command.command}\nCliquer pour lancer`;
    item.iconPath = new vscode.ThemeIcon(running ? 'sync~spin' : 'play');
    item.contextValue = running ? 'cockpit.command.running' : 'cockpit.command.idle';
    if (!running) {
      item.command = { command: 'cockpit.runCommand', title: 'Lancer', arguments: [{ kind: 'command', section: 'commands', folder, command }] };
    }
    return item;
  }
}
