import * as path from 'node:path';
import * as vscode from 'vscode';
import type { CockpitCommand } from '../scan/workspace';

const TASK_TYPE = 'cockpit';

export function commandKey(folder: vscode.WorkspaceFolder, command: CockpitCommand): string {
  return `${folder.uri.toString()}::${command.id}`;
}

/**
 * Lance les commandes via l'API Tasks de VS Code : chaque commande a son terminal dédié
 * (nommé « <label> · <dossier> »), on connaît son état (en cours / terminée) et on peut l'arrêter.
 */
export class CommandRunner implements vscode.Disposable {
  private readonly running = new Map<string, vscode.TaskExecution>();
  private readonly emitter = new vscode.EventEmitter<void>();
  private readonly subscription: vscode.Disposable;

  /** Se déclenche quand une commande démarre ou se termine (pour rafraîchir l'arbre). */
  readonly onDidChange = this.emitter.event;

  constructor() {
    this.subscription = vscode.tasks.onDidEndTask((event) => {
      const key = this.keyOf(event.execution.task);
      if (key && this.running.get(key) === event.execution) {
        this.running.delete(key);
        this.emitter.fire();
      }
    });
  }

  isRunning(folder: vscode.WorkspaceFolder, command: CockpitCommand): boolean {
    return this.running.has(commandKey(folder, command));
  }

  /** Lance la commande ; sans effet si elle tourne déjà. */
  async run(folder: vscode.WorkspaceFolder, command: CockpitCommand): Promise<void> {
    const key = commandKey(folder, command);
    if (this.running.has(key)) return;

    const cwd = command.dir ? path.join(folder.uri.fsPath, ...command.dir.split('/')) : folder.uri.fsPath;
    const name = command.dir ? `${command.label} · ${command.dir}` : command.label;
    const task = new vscode.Task(
      { type: TASK_TYPE, id: key },
      folder,
      name,
      'Cockpit',
      new vscode.ShellExecution(command.command, { cwd }),
    );
    task.isBackground = true;
    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel: vscode.TaskPanelKind.Dedicated,
      focus: false,
      clear: false,
      showReuseMessage: false,
    };

    const execution = await vscode.tasks.executeTask(task);
    this.running.set(key, execution);
    this.emitter.fire();
  }

  /** Arrête la commande si elle tourne. */
  stop(folder: vscode.WorkspaceFolder, command: CockpitCommand): void {
    this.running.get(commandKey(folder, command))?.terminate();
  }

  /** Arrête (si besoin) puis relance la commande. */
  async rerun(folder: vscode.WorkspaceFolder, command: CockpitCommand): Promise<void> {
    const key = commandKey(folder, command);
    if (this.running.has(key)) {
      const ended = this.waitForEnd(key, 5000);
      this.stop(folder, command);
      await ended;
      // Si l'arrêt n'a pas abouti dans le délai, on ne lance pas de doublon.
      if (this.running.has(key)) return;
    }
    await this.run(folder, command);
  }

  dispose(): void {
    this.subscription.dispose();
    this.emitter.dispose();
  }

  private keyOf(task: vscode.Task): string | undefined {
    const def = task.definition as { type?: string; id?: unknown };
    return def.type === TASK_TYPE && typeof def.id === 'string' ? def.id : undefined;
  }

  private waitForEnd(key: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(done, timeoutMs);
      const listener = this.emitter.event(() => {
        if (!this.running.has(key)) done();
      });
      function done(): void {
        clearTimeout(timer);
        listener.dispose();
        resolve();
      }
    });
  }
}
