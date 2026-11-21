import { execFile } from 'node:child_process';

export interface ExecResult {
  stdout: string;
  stderr: string;
  /** Code de sortie, null si le processus a été interrompu (délai dépassé). */
  code: number | null;
}

/**
 * Exécute un programme SANS passer par un shell (execFile) : les arguments ne sont jamais
 * interprétés, donc pas d'injection de commande. Rejette seulement si le programme est introuvable ;
 * un code de sortie non nul (ex. lsof sans résultat) est renvoyé dans le résultat.
 */
export function run(file: string, args: readonly string[], timeoutMs = 5000): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(error);
          return;
        }
        const code = error ? (typeof error.code === 'number' ? error.code : null) : 0;
        resolve({ stdout, stderr, code });
      },
    );
  });
}
