# Changelog

## 0.1.0 — 2026-11-21

Première version.

- Vue latérale **Cockpit** avec trois groupes : Commandes, Ports, Environnement.
- **Commandes** détectées automatiquement : scripts `package.json` (npm, pnpm, yarn, bun selon le lockfile), Maven, Gradle, Makefile, docker compose ; monorepos jusqu'à 3 niveaux ; terminal dédié, Relancer, Stop, état « en cours ».
- **Ports** : ports TCP en écoute (`lsof` / `netstat`), ports du projet en tête, ports du `.env` mis en avant, « Libérer » avec confirmation (arrêt propre puis arrêt forcé proposé), rafraîchissement toutes les 5 s uniquement quand la vue est visible.
- **Environnement** : comparaison `.env` / `.env.example` (manquantes, vides, en trop), création du `.env`, sélecteur de fichier cible ; aucune valeur affichée ni journalisée.
- Emplacements **Pro** verrouillés (profils multi-projets, historique des ports, config d'équipe), stub de licence et API d'extension pour l'extension Pro.
- **Mise à jour intégrée** pour les installations `.vsix` (vérification d'empreinte SHA-256), site GitHub Pages, workflows de release et de CI.
