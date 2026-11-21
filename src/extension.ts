import * as path from 'node:path';
import * as vscode from 'vscode';
import type { CockpitApi, DetectedProject } from './api';
import { createEnvFromTemplate } from './env/analyze';
import { getPlatform } from './platform';
import { freePort } from './ports/free-port';
import { PortsService, type PortsInputs } from './ports/service';
import { ProHooks } from './pro/hooks';
import { StubLicenseService } from './pro/license';
import { CommandRunner } from './runner/command-runner';
import { scanFolders } from './scan/scan-folders';
import { checkForUpdate } from './update/check';
import { CockpitTreeProvider } from './views/cockpit-tree';
import { CommandsSection } from './views/commands-section';
import { EnvSection, type EnvDirInput } from './views/env-section';
import type { CommandNode, EnvActionNode, EnvDirNode, PortNode } from './views/nodes';
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
const isEnvActionNode = (arg: unknown): arg is EnvActionNode => hasKind(arg, 'envAction');
const isEnvDirNode = (arg: unknown): arg is EnvDirNode => hasKind(arg, 'envDir');

export function activate(context: vscode.ExtensionContext): CockpitApi {
  const platform = getPlatform();
  const runner = new CommandRunner();
  const commands = new CommandsSection(runner);

  // Racines du workspace + dossiers de projets détectés : c'est là qu'on cherche les .env.
  const projectDirs = (): EnvDirInput[] => {
    const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
    const dirs = new Map<string, string>();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      if (folder.uri.scheme === 'file') dirs.set(folder.uri.fsPath, folder.name);
    }
    for (const { folder, project } of commands.getProjects()) {
      if (!project.dir) continue;
      const abs = path.join(folder.uri.fsPath, ...project.dir.split('/'));
      dirs.set(abs, multiRoot ? `${folder.name}/${project.dir}` : project.dir);
    }
    return [...dirs].map(([dir, label]) => ({ dir, label }));
  };

  const portsInputs = (): PortsInputs => ({
    workspaceDirs: (vscode.workspace.workspaceFolders ?? [])
      .filter((f) => f.uri.scheme === 'file')
      .map((f) => f.uri.fsPath),
    envDirs: projectDirs().map((d) => d.dir),
  });

  const ports = new PortsService(platform, portsInputs);
  const portsSection = new PortsSection(ports);
  const envSection = new EnvSection(projectDirs, context.workspaceState);
  const license = new StubLicenseService(() => vscode.workspace.getConfiguration('cockpit').get<string>('licenseKey'));
  const pro = new ProHooks(license);
  const tree = new CockpitTreeProvider([commands, portsSection, envSection], pro);
  const projectsEmitter = new vscode.EventEmitter<void>();
  const view = vscode.window.createTreeView('cockpit.view', { treeDataProvider: tree, showCollapseAll: true });

  const refreshEnv = async (): Promise<void> => {
    await envSection.refresh();
    tree.refreshSection('env');
  };

  const rescan = async (): Promise<void> => {
    commands.setProjects(await scanFolders(vscode.workspace.workspaceFolders ?? []));
    projectsEmitter.fire();
    tree.refreshSection('commands');
    await refreshEnv();
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

  // Fichiers .env* : on relit seulement les noms de variables (jamais les valeurs).
  let envTimer: NodeJS.Timeout | undefined;
  const scheduleEnvRefresh = (uri: vscode.Uri): void => {
    if (/[\\/]node_modules[\\/]/.test(uri.fsPath)) return;
    clearTimeout(envTimer);
    envTimer = setTimeout(() => void refreshEnv(), 300);
  };
  const envWatcher = vscode.workspace.createFileSystemWatcher('**/.env*');

  context.subscriptions.push(
    runner,
    ports,
    pro,
    projectsEmitter,
    tree,
    view,
    watcher,
    envWatcher,
    { dispose: () => { clearTimeout(timer); clearTimeout(envTimer); } },
    envWatcher.onDidCreate(scheduleEnvRefresh),
    envWatcher.onDidChange(scheduleEnvRefresh),
    envWatcher.onDidDelete(scheduleEnvRefresh),
    runner.onDidChange(() => tree.refreshSection('commands')),
    pro.onDidChange(() => tree.refresh()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('cockpit.licenseKey')) tree.refresh();
    }),
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
    vscode.commands.registerCommand('cockpit.createEnv', async (node: unknown) => {
      if (!isEnvActionNode(node) || !node.report.template) return;
      const { dir, template, target } = node.report;
      try {
        await createEnvFromTemplate(dir, template, target);
      } catch (error) {
        const exists = (error as NodeJS.ErrnoException).code === 'EEXIST';
        void vscode.window.showErrorMessage(
          exists ? `${target} existe déjà : rien n'a été écrasé.` : `Impossible de créer ${target} : ${(error as Error).message}`,
        );
        await refreshEnv();
        return;
      }
      await refreshEnv();
      const choice = await vscode.window.showInformationMessage(`${target} créé depuis ${template}. Renseignez ses valeurs.`, 'Ouvrir');
      if (choice === 'Ouvrir') {
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(path.join(dir, target)));
      }
    }),
    vscode.commands.registerCommand('cockpit.pickEnvTarget', async (node: unknown) => {
      if (!isEnvDirNode(node)) return;
      const { dir, targets, target, template } = node.report;
      const picked = await vscode.window.showQuickPick(
        targets.map((label) => ({ label, description: label === target ? 'actuel' : undefined })),
        { placeHolder: `Fichier à comparer à ${template ?? 'un gabarit'}` },
      );
      if (!picked) return;
      await envSection.setTarget(dir, picked.label);
      await refreshEnv();
    }),
    vscode.commands.registerCommand('cockpit.showPro', async () => {
      const homepage = String(context.extension.packageJSON.homepage ?? '');
      if (homepage.startsWith('https://')) await vscode.env.openExternal(vscode.Uri.parse(`${homepage}#pro`));
    }),
    vscode.commands.registerCommand('cockpit.togglePortsScope', () => {
      portsSection.toggleForeign();
      tree.refreshSection('ports');
    }),
  );

  if (view.visible) ports.start();
  void rescan();
  void checkForUpdate(context); // sans await : ne retarde jamais l'activation

  // API publique : utilisée par l'extension Pro (dépôt privé), voir src/api.ts.
  return {
    apiVersion: 1,
    license,
    onDidChangeProjects: projectsEmitter.event,
    registerProFeature: (feature) => pro.registerFeature(feature),
    getProjects: (): DetectedProject[] =>
      commands.getProjects().map(({ folder, project }) => ({
        folderUri: folder.uri.toString(),
        dir: project.dir,
        commands: project.commands.map(({ id, label, command, source }) => ({ id, label, command, source })),
      })),
  };
}

export function deactivate(): void {}
