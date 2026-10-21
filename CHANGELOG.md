# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet suit le [Versionnement sémantique](https://semver.org/lang/fr/).

## [Unreleased]

## [0.1.0] - 2026-10-21

Socle du milestone v0.1.0 (non publié à ce stade).

### Added
- Socle applicatif : serveur Express 5 avec `/health`, migrations SQL versionnées (`001_init`, table `schema_migrations`,
  verrou consultatif), configuration par variables d'environnement, `createApp()` testable.
- Front Vite + React 19 + TypeScript : page d'accueil affichant l'état de `/health` et la version de l'application.
- Base PostgreSQL de test éphémère (`docker-compose.test.yml`, données en mémoire), démarrée et arrêtée par `scripts/ci.sh`.
- Double moteur de conteneurs : Docker (CI GitHub) et Podman + podman-compose (poste local WSL), détecté par
  `scripts/container-env.sh`.
- Image applicative `Dockerfile` multi-stage (utilisateur non root, healthcheck `/health`) et fichiers compose
  QUALIF (`docker-compose.qualif.yml`) et PROD (`docker-compose.prod.yml`).
- Procédures QUALIF de publication et de déploiement (`.claude/agents/environments/`), fichier `qualif.env.example`.
- Tests : unitaires, d'intégration (Supertest, base PostgreSQL) et E2E Playwright.
- Garde-fou de reset des tests : refus de `DROP SCHEMA` sur une base dont le nom ne finit pas par `_test`
  (contournable avec `ALLOW_DB_RESET=1`).
- Seuil de couverture à 70 % (lignes, branches, fonctions, instructions) ; la couverture mesurée est de l'ordre de 90 %.
- Documentation : README, cadrage (`docs/CADRAGE.md`), maquettes validées (`docs/mockup/v0.1.0/`, index `docs/mockup/INDEX.md`),
  contrats API et modèles (`contracts/`).
- CI : workflows branche (`ci-branch.yml`) et release (`release.yml`) ; le workflow release vérifie `package.json` et
  `package-lock.json` par rapport au tag, et publie la section de ce CHANGELOG comme notes de release.
- Dependabot pour les actions GitHub ; actions épinglées sur un SHA.
- Authentification des responsables : connexion (`/login`), déconnexion, session par cookie.
- Compte responsable initial créé au démarrage depuis `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`.
- Commande `npm run user:create -- <email> <nom>` : crée un responsable avec un mot de passe généré, affiché une fois.
- Activités : création, modification, liste filtrable par statut, fiche détaillée.
- Machine d'états des activités : ouvrir, fermer, rouvrir, supprimer.
- Lien public par activité au format `/a/<slug>`, copiable depuis la fiche.
- Liste des inscrits d'une activité (migrations 003 et 004).
- Variables `SESSION_SECRET`, `ADMIN_*`, `TRUST_PROXY` (QUALIF et PROD : `qualif.env.example`, `prod.env.example`).
- Documentation sécurité : `docs/SECURITY.md`.
- Inscription publique depuis `/a/<slug>` : adulte, ou mineur inscrit par son parent ou tuteur ; consentement versionné,
  non pré-coché ; confirmation affichant le lien de gestion (affiché une seule fois).
- Lien de gestion `/r/<token>` : consultation de son inscription et désinscription avec confirmation.
- Page Confidentialité (`/confidentialite`) et route `GET /api/public/info`.
- Retrait d'un inscrit par le responsable, avec suppression physique des données.
- Purge RGPD : `npm run data:purge`, automatique au démarrage puis toutes les 24 heures ; durée `RETENTION_MONTHS` (défaut 12).
- Variables `CONTACT_EMAIL`, `RETENTION_MONTHS` et `RATE_LIMIT_*` (`.env.example`, `contracts/models.md`).
- Migrations 006 (inscriptions, envois) et 007 (trigger d'anonymisation).

### Security
- Jeton de gestion d'inscription : 256 bits, stocké haché (SHA-256) seul ; réponse identique pour un jeton inconnu, invalide ou supprimé.
- Anonymisation des données à la suppression (désinscription, retrait, purge) dans une transaction, doublée d'un trigger en base.
- Tokens masqués dans les journaux du serveur ; en-tête `Referrer-Policy: no-referrer` ; `Cache-Control: no-store` sur `/r/*`.
- Anti-abus des routes publiques : limites par IP et par IP+activité, honeypot, schémas `strictObject`.
- Journal des consultations de la liste des inscrits (responsable, activité, nombre).
- Fiche publique en liste blanche de champs (pas d'identifiant interne ni de compteur d'inscrits).
- Inscription refusée dès que l'activité a commencé (409 `activity_closed`).
- Version du consentement liée au texte : un test échoue si le texte change sans changement de version.
- Limite de connexion par IP configurable (`RATE_LIMIT_LOGIN_PER_IP_MIN`, défaut 10), plafonnée à 50 en production.
- Révocation des sessions : le logout invalide toutes les sessions du compte (claim `tv`, migration 005).
- Vérification stricte de `Origin` sur les requêtes modifiantes de `/api`, y compris `Sec-Fetch-Site: cross-site`.
- Limite de connexion par e-mail (5 échecs / 15 min), en plus de la limite par IP (10 / min).
- `TRUST_PROXY` explicite pour l'IP client derrière un reverse proxy ; `true` refusé.
- Politique de mots de passe : 12 caractères minimum, 72 octets maximum, valeurs triviales ou d'exemple refusées.
- `SESSION_SECRET` : 32 caractères minimum, valeurs peu variées refusées.
- Réponses de `/api` en `Cache-Control: no-store`.
- Logs d'authentification sans e-mail en clair (`login_ok`, `login_failed`, `login_rate_limited`).
- Schémas `zod` stricts : champs inconnus rejetés ; `PATCH` restreint à une liste blanche de colonnes.
- Le serveur refuse de démarrer si la configuration ne respecte pas ces règles.

### Fixed
- Arrêt propre du serveur : fermeture des connexions inactives, délai de 10 s, erreurs du pool journalisées.
- Erreurs 4xx respectées (413 renvoyé comme `bad_request`) ; le fallback SPA n'intercepte plus `/api` ni `/health`.
- Rollback de migration : une erreur de `ROLLBACK` ne masque plus l'erreur d'origine.

[Unreleased]: https://github.com/CCoupel/test-eric/compare/v0.1.0...HEAD
