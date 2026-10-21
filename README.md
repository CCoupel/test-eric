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

- Backend : Node.js 22, Express 5
- Frontend : React 19, Vite, TypeScript
- Base de données : PostgreSQL 16
- Tests : Vitest, Playwright, Supertest

## Prérequis

- **Node.js 22** ou plus récent (`engines` : `>=22`).
- **Conteneurs** :
  - Runners GitHub CI : Docker (`docker compose`).
  - Poste local WSL : **Podman + podman-compose** (rootless).
    Installation : `sudo apt-get install -y podman podman-compose`.
  - Les mêmes fichiers (`Dockerfile`, `docker-compose.*.yml`) servent aux deux moteurs.
- **Playwright** (tests E2E), une seule fois sur le poste local :

  ```bash
  sudo npx playwright install-deps chromium
  ```

  En CI, les dépendances sont installées automatiquement (`--with-deps`).

### Choix du moteur de conteneurs

`scripts/container-env.sh` détecte le moteur : Docker s'il répond (`docker info`), sinon Podman.
Il est à sourcer en bash : `source scripts/container-env.sh`. Il définit `CONTAINER_CLI` et `COMPOSE_CMD`
et une fonction `compose`.

Pour forcer le moteur, définir les variables avant de sourcer le script :

```bash
export CONTAINER_CLI=podman COMPOSE_CMD=podman-compose
```

Sous WSL, `podman-compose` est appelé directement : `podman compose` peut déléguer au binaire
`docker-compose` de Docker Desktop, inutilisable avec Podman.

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
| `ALLOW_DB_RESET` | Tests uniquement : force le reset d'une base dont le nom ne finit pas par `_test` |

Les autres variables de `.env.example` (`SESSION_SECRET`, `ADMIN_*`, `SMTP_*`, `MAIL_FROM`)
sont prévues pour les prochaines fonctionnalités.

## Lancer en développement

```bash
npm run db:migrate   # applique les migrations à la base indiquée par DATABASE_URL
npm run dev          # serveur avec rechargement automatique (port APP_PORT, défaut 3000)
npm run dev:web      # front Vite ; proxifie `/api` et `/health` vers le port 3000
```

## Base de données de test

Le fichier [`docker-compose.test.yml`](docker-compose.test.yml) démarre un PostgreSQL 16 éphémère
(données en mémoire, identifiants de test uniquement) sur le port `5433`.

Démarrage manuel (sans `--wait`, non supporté par podman-compose) :

```bash
source scripts/container-env.sh
compose -f docker-compose.test.yml up -d db
# attendre que Postgres réponde (pg_isready) avant de lancer les tests
export DATABASE_URL=postgres://club:club@localhost:5433/club_test
```

Arrêt : `compose -f docker-compose.test.yml down -v`.

Le plus simple reste de laisser `scripts/ci.sh` démarrer et arrêter cette base : il le fait lorsque
`DATABASE_URL` n'est pas définie.

### Node Windows dans WSL

Si `node` est le binaire **Windows** (`node.exe`), il ne reçoit les variables WSL que listées dans `WSLENV`.
Sans cela, `DATABASE_URL` est absente et les tests d'intégration sont ignorés silencieusement.

`scripts/ci.sh` ajoute `DATABASE_URL:CI:NODE_ENV:APP_PORT:E2E_BASE_URL` à `WSLENV` automatiquement.
Hors `ci.sh`, par exemple pour un test ciblé :

```bash
export DATABASE_URL=postgres://club:club@localhost:5433/club_test
export WSLENV="${WSLENV:+$WSLENV:}DATABASE_URL"
```

Pour la parité avec la CI, utiliser un Node 22 Linux en tête de `PATH`.

## Tests et qualité

```bash
npm test             # tests unitaires et d'intégration (Vitest)
npm run test:e2e     # tests end-to-end (Playwright, contre l'application construite)
npm run lint         # ESLint
npm run typecheck    # TypeScript
scripts/ci.sh        # enchaînement complet : lint, typecheck, tests, audit, build, E2E
```

- **Seuil de couverture** : 70 % (lignes, branches, fonctions, instructions). Sous ce seuil, `npm test` échoue.
- **Garde-fou de reset** : les tests font un `DROP SCHEMA public`. Ils refusent de tourner si le nom de la base
  ne finit pas par `_test`. Pour forcer malgré tout : `ALLOW_DB_RESET=1` (usage tests uniquement, jamais en QUALIF ou PROD).

## Build

```bash
npm run build        # compile le serveur (dist/server) et le front (dist/web)
npm start            # démarre le serveur compilé
```

L'image applicative est définie par le `Dockerfile` (multi-stage, utilisateur non root) : elle emballe
le `dist/` déjà compilé, sans recompiler au déploiement.

## Déploiement (QUALIF / PROD)

Le principe : **un artefact compilé une seule fois**, puis installé dans chaque environnement.

| Environnement | Mécanisme |
|---------------|-----------|
| **QUALIF** | Promotion de l'artefact construit localement : aucune recompilation. |
| **PROD** | Fusion sur `main` puis tag `vX.Y.Z` : la CI reconstruit de façon déterministe et publie la release. |

Commandes (agents du teamleader) :

- `/build` : compile la version candidate.
- `/publish qualif` puis `/deploy qualif` : publie puis installe l'artefact sur QUALIF.
- Procédures détaillées : `.claude/agents/environments/`.

### Fichier `qualif.env`

Les variables propres à QUALIF sont dans `.claude/agents/environments/qualif.env`, créé à partir de
`.claude/agents/environments/qualif.env.example`. Ce fichier n'est jamais commité.

Variables obligatoires : `APP_PORT`, `APP_BASE_URL`, `POSTGRES_PASSWORD`, `SESSION_SECRET`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `ADMIN_NAME`. Les variables `POSTGRES_USER` et `POSTGRES_DB` sont optionnelles (défaut `club`).
`DATABASE_URL` n'est pas à renseigner : elle est dérivée par le fichier compose.

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
