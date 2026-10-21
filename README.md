# Inscriptions-club

Application web pour les clubs associatifs : inscriptions aux activités (cours, sorties, événements)
et envoi d'un e-mail groupé aux inscrits d'une ou plusieurs activités.

Pensée pour un bénévole non technique : simple, gratuite, accessible par lien.

## Fonctionnalités (v1 en cours)

- Un responsable crée une activité (titre, date, lieu, places) et l'ouvre aux inscriptions.
- Un participant s'inscrit ou se désinscrit depuis un lien.
- Le responsable envoie un e-mail groupé aux inscrits d'une activité, avec historique.

Hors périmètre v1 : paiement en ligne, application mobile, cotisations, SMS, multi-clubs.

Le cadrage complet est dans [`docs/CADRAGE.md`](docs/CADRAGE.md).

## Stack

- Backend : Node.js ≥ 22, Express 5
- Frontend : React 19, Vite, TypeScript
- Base de données : PostgreSQL 16
- Tests : Vitest, Playwright, Supertest

## Prérequis

- Node.js **22** ou plus récent
- Docker Desktop, avec l'intégration WSL activée si vous travaillez sous WSL
  (utilisé pour la base de test ; inutile si vous fournissez votre propre `DATABASE_URL`)

## Installation

```bash
npm ci
```

## Configuration

1. Copier le modèle de configuration :

   ```bash
   cp .env.example .env
   ```

2. Renseigner les variables. Le contrat complet est dans [`contracts/models.md`](contracts/models.md).
   Le fichier `.env` ne doit jamais être commité.

Variables principales :

| Variable | Rôle |
|----------|------|
| `DATABASE_URL` | Connexion PostgreSQL (obligatoire) |
| `APP_PORT` | Port du serveur (défaut `3000`) |
| `APP_BASE_URL` | URL publique de l'application (obligatoire en production) |
| `NODE_ENV` | Environnement d'exécution |
| `CONSENT_TEXT_VERSION` | Version du texte de consentement RGPD |

Les autres variables du fichier `.env.example` (`SESSION_SECRET`, `ADMIN_*`, `SMTP_*`, `MAIL_FROM`)
sont prévues pour les prochaines fonctionnalités.

## Lancer en développement

```bash
npm run db:migrate   # applique les migrations à la base indiquée par DATABASE_URL
npm run dev          # serveur avec rechargement automatique (port APP_PORT, défaut 3000)
npm run dev:web      # front Vite ; proxifie `/api` et `/health` vers le port 3000
```

## Base de données de test

Le fichier [`docker-compose.test.yml`](docker-compose.test.yml) démarre un PostgreSQL 16 éphémère
(données en mémoire, identifiants de test uniquement) sur le port `5433` :

```bash
docker compose -f docker-compose.test.yml up -d --wait db
export DATABASE_URL=postgres://club:club@localhost:5433/club_test
```

Arrêt : `docker compose -f docker-compose.test.yml down -v`.

`scripts/ci.sh` démarre et arrête cette base automatiquement lorsque `DATABASE_URL` n'est pas définie.

## Tests et qualité

```bash
npm test             # tests unitaires et d'intégration (Vitest)
npm run test:e2e     # tests end-to-end (Playwright)
npm run lint         # ESLint
npm run typecheck    # TypeScript
scripts/ci.sh        # enchaînement complet de la CI (lint, typecheck, tests, audit, build)
```

## Build

```bash
npm run build        # compile le serveur (dist/server) et le front (dist/web)
npm start            # démarre le serveur compilé
```

## Déploiement (QUALIF / PROD)

Le déploiement suit le principe *build once* : l'artefact est compilé une seule fois puis promu
d'un environnement à l'autre, sans recompilation.

- `/build` : compile la version candidate.
- `/publish qualif` puis `/deploy qualif` : publie puis installe l'artefact sur l'environnement de qualification.
- Les procédures détaillées sont dans `.claude/agents/environments/`.

## Conventions

- **Branches** : `milestone/vX.Y.Z` pour le travail d'un milestone ; jamais de travail direct sur `main`.
- **Commits** : [Conventional Commits](https://www.conventionalcommits.org/fr/) — `type(scope): message`
  (types : `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`).
- **Versions** : `X.Y.Z.a` en développement, `X.Y.Z` en production. Les tags `vX.Y.Z` déclenchent la release CI.
- **Changelog** : [`CHANGELOG.md`](CHANGELOG.md), format Keep a Changelog.

## Contribuer

1. Créer ou reprendre une issue GitHub, rattachée au milestone courant.
2. Travailler sur la branche du milestone, en petits commits Conventional Commits.
3. Lancer `scripts/ci.sh` avant de pousser.
4. Mettre à jour `CHANGELOG.md` pour toute modification visible.
