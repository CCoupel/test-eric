# PROJECT_CONTEXT.md — Contexte technique (Inscriptions-club)

> Compagnon projet (non géré par sync). Référencé par `context/COMMON.md`, `DEV_COMMON.md`, `VALIDATION_COMMON.md`.
> Le détail d'usage est dans `README.md` ; ce fichier ne le duplique pas.

## 1. Stack

| Couche | Technologie |
|--------|-------------|
| Backend | Node.js ≥ 22 (`engines`), Express 5, JavaScript ESM |
| Frontend | React 19, TypeScript, Vite 8, react-router-dom 7 |
| Base de données | PostgreSQL 16, driver `pg`, migrations SQL maison (`src/server/db/migrations/NNN_nom.sql`) |
| Validation / sécurité | zod 4 (`strictObject`), bcrypt, jsonwebtoken, express-rate-limit, helmet |
| E-mail | Nodemailer 10 (version épinglée), mode stub par défaut |
| Tests | Vitest 5 (projets `server` et `web`), Supertest, Playwright (E2E), Testing Library |
| Qualité | ESLint 10 (flat config), typescript-eslint, `tsc --noEmit` |
| Conteneurs | Docker (CI GitHub Actions) ; Podman + podman-compose (poste local WSL) |
| CI/CD | GitHub Actions : `ci-branch.yml` (branches `milestone/**`), `release.yml` (tags `v*`) |

## 2. Structure

| Chemin | Contenu |
|--------|---------|
| `src/server/` | `app.js`, `config.js`, `index.js`, `routes/`, `services/`, `mailer/`, `jobs/` (purge), `middleware/`, `db/` (pool, migrate, migrations), `cli/` |
| `src/web/` | `pages/`, `components/`, `api/` (clients HTTP), `auth/`, `App.tsx`, `vite.config.ts` |
| `tests/` | `server/`, `integration/`, `procedures/` (QUALIF par lot), `INDEX.md`, `METRICS.md` |
| `e2e/` | Scénarios Playwright, par domaine (`socle`, `activites`, `inscription`, `mailing`) |
| `contracts/` | `http-endpoints.md`, `models.md`, `CHANGELOG.md` : contrats (contract-first) |
| `scripts/` | `ci.sh`, `container-env.sh`, `compose-deploy.sh`, `build-server.js`, `data-purge.js`, `user-create.js` |
| `docs/` | `CADRAGE.md`, `SECURITY.md`, `EMAIL.md`, `mockup/` (maquettes validées et index) |
| `.claude/agents/environments/` | Procédures PUBLISH/DEPLOY QUALIF et PROD, `qualif.env.example`, `prod.env.example` |
| `MARKETING/` | Worktree de la branche `gh-pages` (site marketing), gitignoré |
| `_work/` | Ordres, rapports, handoffs, temporaires : gitignoré |

## 3. Commandes

| Usage | Commande |
|-------|----------|
| Développement serveur / front | `npm run dev` / `npm run dev:web` |
| Build | `npm run build` (serveur + front) ; `npm start` |
| Tests | `npm test` (Vitest, seuil 70 %) ; `npm run test:e2e` (Playwright) |
| Qualité | `npm run lint` ; `npm run typecheck` |
| Base | `npm run db:migrate` ; base de test : `docker-compose.test.yml` (`DATABASE_URL` + `WSLENV` si node Windows) |
| Exploitation | `npm run user:create -- <email> <nom>` ; `npm run data:purge` |
| CI complète | `scripts/ci.sh` (démarre et arrête la base de test si `DATABASE_URL` est vide) |
| Moteur de conteneurs | `source scripts/container-env.sh` (détection Docker ou Podman) |
| Workflow | `/build`, `/publish qualif`, `/deploy qualif` ; PROD : voir `environments/publish.prod.md` et `deploy.prod.md` |

## 4. Routage DEV

| Fichiers touchés | Agent |
|------------------|-------|
| `src/server/**`, `contracts/`, `src/server/db/migrations/` | `dev-backend` (compagnon `dev-backend.md` : sécurité d'abord) |
| `src/web/**` | `dev-frontend` |
| `scripts/`, `docker-compose*.yml`, `Dockerfile`, `.github/workflows/`, `.claude/agents/environments/` | `infra` |
| `tests/`, `e2e/` | `test-writer` (les `dev-*` écrivent leurs tests colocalisés) |
| `docs/`, `README.md`, `CHANGELOG.md`, `docs/mockup/` | `doc-updater` |
| Publication et déploiement | `deployer` |

## 5. Contraintes projet

- **Contract-first** : toute modification d'endpoint ou de modèle passe par `contracts/` (et son `CHANGELOG.md`) avant le code.
- **Sécurité d'abord** : checklist du compagnon `dev-backend.md` avant chaque commit d'endpoint ; constats `security` traités ou argumentés ; `docs/SECURITY.md` à jour.
- **RGPD** : données de mineurs inscrits par un parent ; conservation `RETENTION_MONTHS` (défaut 12) ; suppression et anonymisation dans une transaction ; accès aux inscrits journalisé.
- **Versionnement** : `X.Y.Z.a` pendant le développement, `X.Y.Z` pour la release (`CHANGELOG.md` contient `## [X.Y.Z]`).
- **Branches** : travail sur `milestone/vX.Y.Z` ; jamais de commit direct sur `main`. Le site marketing vit sur `gh-pages`, sans historique commun.
- **Bases de test** : chaque agent utilise sa propre base (le global-setup fait `DROP SCHEMA public`). Le garde-fou exige un nom finissant par `_test`, sauf `ALLOW_DB_RESET=1`.
- **Commits** : `type(scope): message` (Conventional Commits).
