import * as vscode from 'vscode';
import { CommandRunner } from './runner/command-runner';
import { scanFolders } from './scan/scan-folders';
import { CockpitTreeProvider } from './views/cockpit-tree';
import { CommandsSection } from './views/commands-section';
import type { CommandNode } from './views/nodes';
import { PlaceholderSection } from './views/placeholder-section';

// Fichiers dont la modification change ce que détecte le Cockpit.
const WATCHED = [
  'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb',
  'pom.xml', 'mvnw', 'build.gradle', 'build.gradle.kts', 'gradlew',
  'Makefile', 'makefile', 'GNUmakefile',
  'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml',
];

const isCommandNode = (arg: unknown): arg is CommandNode =>
  typeof arg === 'object' && arg !== null && (arg as { kind?: string }).kind === 'command';

export function activate(context: vscode.ExtensionContext): void {
  const runner = new CommandRunner();
  const commands = new CommandsSection(runner);
  const tree = new CockpitTreeProvider([
    commands,
    new PlaceholderSection('ports'),
    new PlaceholderSection('env'),
  ]);

  const rescan = async (): Promise<void> => {
    commands.setProjects(await scanFolders(vscode.workspace.workspaceFolders ?? []));
    tree.refresh();
  };

  // Plusieurs événements fichier arrivent en rafale (git checkout, install) : on regroupe.
  let timer: NodeJS.Timeout | undefined;
  const scheduleRescan = (uri?: vscode.Uri): void => {
    if (uri && /[\\/]node_modules[\\/]/.test(uri.fsPath)) return;
    clearTimeout(timer);
    timer = setTimeout(() => void rescan(), 400);
  };

  const watcher = vscode.workspace.createFileSystemWatcher(`**/{${WATCHED.join(',')}}`);

  context.subscriptions.push(
    runner,
    tree,
    watcher,
    { dispose: () => clearTimeout(timer) },
    vscode.window.createTreeView('cockpit.view', { treeDataProvider: tree, showCollapseAll: true }),
    runner.onDidChange(() => tree.refresh()),
    watcher.onDidCreate(scheduleRescan),
    watcher.onDidChange(scheduleRescan),
    watcher.onDidDelete(scheduleRescan),
    vscode.workspace.onDidChangeWorkspaceFolders(() => scheduleRescan()),
    vscode.commands.registerCommand('cockpit.refresh', () => rescan()),
    vscode.commands.registerCommand('cockpit.runCommand', (node: unknown) => {
      if (isCommandNode(node)) return runner.run(node.folder, node.command);
    }),
    vscode.commands.registerCommand('cockpit.rerunCommand', (node: unknown) => {
      if (isCommandNode(node)) return runner.rerun(node.folder, node.command);
    }),
    vscode.commands.registerCommand('cockpit.stopCommand', (node: unknown) => {
      if (isCommandNode(node)) runner.stop(node.folder, node.command);
    }),
  );

  void rescan();
}

export function deactivate(): void {}
