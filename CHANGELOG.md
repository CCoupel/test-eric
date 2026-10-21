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

### Fixed
- Arrêt propre du serveur : fermeture des connexions inactives, délai de 10 s, erreurs du pool journalisées.
- Erreurs 4xx respectées (413 renvoyé comme `bad_request`) ; le fallback SPA n'intercepte plus `/api` ni `/health`.
- Rollback de migration : une erreur de `ROLLBACK` ne masque plus l'erreur d'origine.

[Unreleased]: https://github.com/CCoupel/test-eric/compare/v0.1.0...HEAD
