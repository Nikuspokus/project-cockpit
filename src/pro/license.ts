/**
 * Service de licence. Le gratuit n'en dépend que pour savoir s'il doit afficher un emplacement
 * Pro verrouillé ou les éléments fournis par l'extension Pro (dépôt privé).
 */
export interface LicenseService {
  isPro(): Promise<boolean>;
}

/**
 * Implémentation provisoire : lit la clé saisie dans le réglage `cockpit.licenseKey`, sans aucun appel réseau.
 * Toute clé non vide est acceptée. C'est sans risque tant qu'aucun code Pro ne vit dans ce dépôt public :
 * la clé ne débloque que l'affichage d'éléments fournis par l'extension Pro, qui n'existe pas encore.
 *
 * TODO(licence) — validation réelle, à faire AVANT de vendre quoi que ce soit :
 *  1. Choisir un revendeur « Merchant of Record » (il encaisse, gère la TVA et émet les clés de licence)
 *     et appeler son API de validation de clé depuis le service (ex. POST /validate avec la clé).
 *     Ne jamais embarquer de secret du revendeur dans l'extension : la validation n'utilise que la clé de l'utilisateur.
 *  2. Cache hors-ligne : stocker le dernier résultat « valide » (avec sa date) dans `context.globalState`
 *     pour continuer à fonctionner sans réseau.
 *  3. Délai de grâce de 7 jours : si la revalidation échoue faute de réseau, rester Pro 7 jours après la dernière
 *     validation réussie ; passé ce délai, repasser en gratuit avec un message clair. Une clé explicitement
 *     refusée (révoquée, remboursée) retire le Pro immédiatement, sans délai.
 *  4. Revalider au démarrage puis au plus une fois par jour, sans bloquer l'activation.
 *  5. Mettre à jour le README (section Confidentialité) : ce sera le seul appel réseau de l'extension avec la
 *     vérification de mise à jour, et il n'enverra que la clé de licence.
 */
export class StubLicenseService implements LicenseService {
  constructor(private readonly getKey: () => string | undefined) {}

  async isPro(): Promise<boolean> {
    return (this.getKey() ?? '').trim().length > 0;
  }
}
