/** Gabarits reconnus, par ordre de priorité. */
export const TEMPLATE_NAMES = ['.env.example', '.env.sample', '.env.template'] as const;

const TEMPLATE_SUFFIX = /\.(example|sample|template)$/;
const TARGET_NAME = /^\.env(\.[A-Za-z0-9_.-]+)?$/;
const ASSIGNMENT = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=(.*)$/;

export interface EnvKeyState {
  /** true si la valeur est vide (KEY=, KEY="", KEY= # commentaire). */
  empty: boolean;
}

export interface EnvComparison {
  /** Dans le gabarit mais absentes du .env. */
  missing: string[];
  /** Présentes dans le .env et dans le gabarit, mais sans valeur. */
  empty: string[];
  /** Dans le .env mais pas dans le gabarit. */
  extra: string[];
}

/** Premier gabarit présent dans la liste de fichiers (.env.example > .env.sample > .env.template). */
export function pickTemplate(fileNames: readonly string[]): string | undefined {
  return TEMPLATE_NAMES.find((name) => fileNames.includes(name));
}

/** Fichiers .env* comparables au gabarit (.env en premier), gabarits exclus. */
export function listEnvTargets(fileNames: readonly string[]): string[] {
  return fileNames
    .filter((name) => TARGET_NAME.test(name) && !TEMPLATE_SUFFIX.test(name))
    .sort((a, b) => (a === '.env' ? -1 : b === '.env' ? 1 : a.localeCompare(b)));
}

/**
 * Lit les clés d'un fichier .env avec uniquement « vide ou non ».
 * Les valeurs ne sont JAMAIS conservées : elles sont examinées puis jetées sur place.
 */
export function parseEnvKeys(content: string): Map<string, EnvKeyState> {
  const keys = new Map<string, EnvKeyState>();
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const match = ASSIGNMENT.exec(line);
    if (!match) continue;

    const value = match[2].trim();
    let empty: boolean;
    const quote = value[0] === '"' || value[0] === "'" ? value[0] : undefined;
    if (quote) {
      const closing = value.indexOf(quote, 1);
      if (closing >= 0) {
        empty = value.slice(1, closing).trim() === '';
      } else {
        // Valeur sur plusieurs lignes (ex. clé privée) : on saute jusqu'à la guillemet fermante.
        empty = false;
        while (i + 1 < lines.length && !lines[i + 1].includes(quote)) i++;
        i++;
      }
    } else {
      empty = value.replace(/(^|\s)#.*$/, '').trim() === '';
    }
    keys.set(match[1], { empty });
  }
  return keys;
}

/** Compare un .env à son gabarit : variables manquantes, vides et en trop. */
export function compareEnv(envContent: string, templateContent: string): EnvComparison {
  const env = parseEnvKeys(envContent);
  const template = parseEnvKeys(templateContent);

  const missing = [...template.keys()].filter((key) => !env.has(key));
  const empty = [...env].filter(([key, state]) => template.has(key) && state.empty).map(([key]) => key);
  const extra = [...env.keys()].filter((key) => !template.has(key));
  return { missing, empty, extra };
}
