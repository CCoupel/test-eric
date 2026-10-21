# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet suit le [Versionnement sémantique](https://semver.org/lang/fr/).

## [Unreleased]

## [0.1.0] - 2026-10-21

Socle du milestone v0.1.0 (version de développement, non publiée).

### Added
- Socle du projet : serveur Express minimal avec `/health`, migrations SQL (`001_init`), configuration par variables d'environnement.
- Front Vite + React 19 + TypeScript : page d'accueil affichant l'état de `/health`.
- Base PostgreSQL de test éphémère via `docker-compose.test.yml`, intégrée à `scripts/ci.sh`.
- Documentation : README initial et cadrage (`docs/CADRAGE.md`).
- Maquettes validées v0.1.0 (`docs/mockup/v0.1.0/`) et index (`docs/mockup/INDEX.md`).
- Contrats API et modèles du milestone v0.1.0 (`contracts/`).
- Pipeline CI : vérification de `package-lock.json` et publication des notes de release depuis cette section.

[Unreleased]: https://github.com/CCoupel/test-eric/compare/v0.1.0...HEAD
