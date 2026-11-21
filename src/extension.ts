import * as path from 'node:path';
import * as vscode from 'vscode';
import { getPlatform } from './platform';
import { freePort } from './ports/free-port';
import { PortsService, type PortsInputs } from './ports/service';
import { CommandRunner } from './runner/command-runner';
import { scanFolders } from './scan/scan-folders';
import { CockpitTreeProvider } from './views/cockpit-tree';
import { CommandsSection } from './views/commands-section';
import type { CommandNode, PortNode } from './views/nodes';
import { PlaceholderSection } from './views/placeholder-section';
import { PortsSection } from './views/ports-section';

// Fichiers dont la modification change ce que détecte le Cockpit.
const WATCHED = [
  'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb',
  'pom.xml', 'mvnw', 'build.gradle', 'build.gradle.kts', 'gradlew',
  'Makefile', 'makefile', 'GNUmakefile',
  'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml',
];

const hasKind = (arg: unknown, kind: string): boolean =>
  typeof arg === 'object' && arg !== null && (arg as { kind?: string }).kind === kind;
const isCommandNode = (arg: unknown): arg is CommandNode => hasKind(arg, 'command');
const isPortNode = (arg: unknown): arg is PortNode => hasKind(arg, 'port');

export function activate(context: vscode.ExtensionContext): void {
  const platform = getPlatform();
  const runner = new CommandRunner();
  const commands = new CommandsSection(runner);

  // Dossiers du workspace et dossiers de projets (pour lire leurs .env et repérer les processus du projet).
  const portsInputs = (): PortsInputs => {
    const workspaceDirs = (vscode.workspace.workspaceFolders ?? [])
      .filter((f) => f.uri.scheme === 'file')
      .map((f) => f.uri.fsPath);
    const envDirs = new Set(workspaceDirs);
    for (const { folder, project } of commands.getProjects()) {
      envDirs.add(project.dir ? path.join(folder.uri.fsPath, ...project.dir.split('/')) : folder.uri.fsPath);
    }
    return { workspaceDirs, envDirs: [...envDirs] };
  };

  const ports = new PortsService(platform, portsInputs);
  const portsSection = new PortsSection(ports);
  const tree = new CockpitTreeProvider([commands, portsSection, new PlaceholderSection('env')]);
  const view = vscode.window.createTreeView('cockpit.view', { treeDataProvider: tree, showCollapseAll: true });

  const rescan = async (): Promise<void> => {
    commands.setProjects(await scanFolders(vscode.workspace.workspaceFolders ?? []));
    tree.refreshSection('commands');
    if (ports.running) void ports.refresh();
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
    ports,
    tree,
    view,
    watcher,
    { dispose: () => clearTimeout(timer) },
    runner.onDidChange(() => tree.refreshSection('commands')),
    ports.onDidChange(() => tree.refreshSection('ports')),
    // Les ports ne sont interrogés que lorsque la vue est visible.
    view.onDidChangeVisibility((e) => (e.visible ? ports.start() : ports.stop())),
    watcher.onDidCreate(scheduleRescan),
    watcher.onDidChange(scheduleRescan),
    watcher.onDidDelete(scheduleRescan),
    vscode.workspace.onDidChangeWorkspaceFolders(() => scheduleRescan()),
    vscode.commands.registerCommand('cockpit.refresh', async () => {
      await rescan();
      if (ports.running) await ports.refresh();
    }),
    vscode.commands.registerCommand('cockpit.runCommand', (node: unknown) => {
      if (isCommandNode(node)) return runner.run(node.folder, node.command);
    }),
    vscode.commands.registerCommand('cockpit.rerunCommand', (node: unknown) => {
      if (isCommandNode(node)) return runner.rerun(node.folder, node.command);
    }),
    vscode.commands.registerCommand('cockpit.stopCommand', (node: unknown) => {
      if (isCommandNode(node)) runner.stop(node.folder, node.command);
    }),
    vscode.commands.registerCommand('cockpit.freePort', (node: unknown) => {
      if (isPortNode(node) && node.killable) return freePort(platform, node, () => ports.refresh());
    }),
    vscode.commands.registerCommand('cockpit.togglePortsScope', () => {
      portsSection.toggleForeign();
      tree.refreshSection('ports');
    }),
  );

  if (view.visible) ports.start();
  void rescan();
}

export function deactivate(): void {}
