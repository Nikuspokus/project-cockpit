export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export type CommandSource = PackageManager | 'maven' | 'gradle' | 'make' | 'compose';

/** Commande détectée dans un fichier, sans notion de dossier (ajoutée par le scan). */
export interface DetectedCommand {
  /** Texte affiché dans l'arbre (ex. « dev », « clean install »). */
  label: string;
  /** Ligne exécutée dans le terminal (ex. « pnpm run dev »). */
  command: string;
  source: CommandSource;
  /** Précision affichée en grisé (ex. le corps du script npm). */
  detail?: string;
}

export interface WrapperOption {
  /** true si mvnw / gradlew existe dans le dossier : on l'utilise à la place de l'outil global. */
  hasWrapper?: boolean;
}
