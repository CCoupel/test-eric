# Deploy — QUALIF (mecanisme : docker-compose, docker ou podman) — adaptation projet

> Compagnon de `deploy.qualif.template.md` : **prevaut sur le template** (pas de registre :
> l'image est construite localement a partir de l'artefact publie, qui contient deja `dist/`
> compile — aucune compilation ici, BORE). Variables `$REPO_ROOT`, `$DIR_VERSION`, `$VERSION`
> heritees de la Tache BUILD ; `.env` puis `qualif.env` deja charges (`set -a`, `agents/deploy.md`).

Moteur de conteneurs detecte par `scripts/container-env.sh` : `docker compose` (ou
`docker-compose`) si docker repond, sinon `podman-compose` (ou `podman compose`). Forcer avec
`CONTAINER_CLI=podman COMPOSE_CMD=podman-compose` si besoin.

## Variables attendues

`qualif.env` (modele : `qualif.env.example`), surchargeant `.env` :

| Variable | Usage |
|----------|-------|
| `APP_PORT` | port publie sur l'hote et ecoute dans le conteneur (> 1024 en podman rootless) |
| `APP_BASE_URL` | obligatoire en production (ex. `http://localhost:8080`) |
| `POSTGRES_PASSWORD` (+ `POSTGRES_USER`, `POSTGRES_DB`, defaut `club`) | base du conteneur `db` ; `DATABASE_URL` en est derivee dans `deploy/.env` ; `deploy/db.env` = POSTGRES_* (jamais dans la sortie de compose) |
| `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | contrat (obligatoires) |
| `SMTP_*`, `MAIL_FROM`, `CONSENT_TEXT_VERSION` | optionnels (SMTP vide → transport stub) |

Variable obligatoire vide → STOP, remonter au teamleader (jamais de valeur inventee).

```bash
# 0. Moteur de conteneurs
cd "$REPO_ROOT" || exit 1
source scripts/container-env.sh || exit 1
echo "Moteur : $CONTAINER_CLI / $COMPOSE_CMD"

# 1. Verification
QUALIF_DIR="$REPO_ROOT/build/qualif_v$DIR_VERSION"
ARTIFACT="$QUALIF_DIR/app-$VERSION.tar.gz"
test -f "$ARTIFACT" || { echo "Aucune publication QUALIF ($ARTIFACT) — executer /publish qualif d'abord"; exit 1; }
( cd "$QUALIF_DIR" && sha256sum -c "app-$VERSION.tar.gz.sha256" ) || { echo "Somme de controle invalide"; exit 1; }
MISSING=""
for k in APP_PORT APP_BASE_URL POSTGRES_PASSWORD SESSION_SECRET ADMIN_EMAIL ADMIN_PASSWORD ADMIN_NAME; do
  [ -n "${!k:-}" ] || MISSING="$MISSING $k"
done
[ -z "$MISSING" ] || { echo "Variables QUALIF manquantes :$MISSING"; exit 1; }

# 2. Install — extraction (version precedente conservee pour rollback) + .env fusionne
DEPLOY_DIR="$QUALIF_DIR/deploy"
if [ -d "$DEPLOY_DIR" ]; then rm -rf "$DEPLOY_DIR.previous"; mv "$DEPLOY_DIR" "$DEPLOY_DIR.previous"; fi
mkdir -p "$DEPLOY_DIR"
tar -xzf "$ARTIFACT" -C "$DEPLOY_DIR"
# Secrets uniquement dans des fichiers (mode 600) lus par compose via env_file — jamais dans
# `environment:` (podman-compose affiche ces valeurs en clair). .env = app ; db.env = POSTGRES_* seuls.
PG_USER="${POSTGRES_USER:-club}"; PG_DB="${POSTGRES_DB:-club}"
KEYS=$(grep -hoE '^[A-Z_][A-Z0-9_]*=' .env.example .claude/agents/environments/qualif.env.example | tr -d '=' | sort -u)
( umask 077
  for k in $KEYS; do
    case "$k" in DATABASE_URL|POSTGRES_USER|POSTGRES_DB|POSTGRES_PASSWORD) continue ;; esac
    printf '%s=%s\n' "$k" "${!k-}"
  done
  printf 'DATABASE_URL=postgres://%s:%s@db:5432/%s\n' "$PG_USER" "$POSTGRES_PASSWORD" "$PG_DB"
  printf 'APP_VERSION=%s\n' "$VERSION"
) > "$DEPLOY_DIR/.env"
( umask 077
  printf 'POSTGRES_USER=%s\nPOSTGRES_DB=%s\nPOSTGRES_PASSWORD=%s\n' "$PG_USER" "$PG_DB" "$POSTGRES_PASSWORD"
) > "$DEPLOY_DIR/db.env"

cd "$DEPLOY_DIR" || exit 1
compose -f docker-compose.qualif.yml build app || exit 1   # emballe dist/ (pas de compilation)
# db : demarree seulement si elle ne tourne pas deja (le volume pgdata est conserve entre versions ;
# podman-compose 1.0.6 tenterait sinon de recreer le conteneur en cours d'execution)
compose -f docker-compose.qualif.yml exec -T db true >/dev/null 2>&1 || compose -f docker-compose.qualif.yml up -d db
wait_pg docker-compose.qualif.yml db "$PG_USER" "$PG_DB" 90 || exit 1
# app : recreee sur la nouvelle image ; migrations au demarrage. Avec podman-compose, des messages
# « no such container » / « no such volume » au premier deploiement sont sans consequence :
# le verdict est le smoke /health ci-dessous.
compose -f docker-compose.qualif.yml up -d --force-recreate --no-deps app

# 3. Smoke tests
wait_http "http://localhost:$APP_PORT/health" 90 || exit 1
curl -fsS "http://localhost:$APP_PORT/health" || exit 1
# Smoke E2E (tests tag smoke) contre QUALIF, depuis le repo :
#   (cd "$REPO_ROOT" && E2E_BASE_URL="http://localhost:$APP_PORT" npx playwright test --grep @smoke)

# 4. Notification
echo "Deploiement QUALIF termine - $VERSION ($CONTAINER_CLI) - http://localhost:$APP_PORT"
```

## Echec

```bash
cd "$REPO_ROOT/build/qualif_v$DIR_VERSION/deploy" || exit 1
compose -f docker-compose.qualif.yml ps
compose -f docker-compose.qualif.yml logs --tail=100 app db
```

Un echec ici est un echec d'installation (BUILD et PUBLISH ont reussi) : rapport au teamleader,
agent responsable `infra` (moteur, ports, volumes) ou `dev` (crash applicatif, migration).

## Rollback

L'image precedente reste taguee `localhost/inscriptions-club:<version precedente>` et son
dossier est conserve dans `deploy.previous/` :

```bash
cd "$REPO_ROOT" || exit 1; source scripts/container-env.sh
cd "build/qualif_v$DIR_VERSION/deploy.previous" || exit 1
compose -f docker-compose.qualif.yml up -d --force-recreate --no-deps app
```

Les migrations sont uniquement ascendantes : un rollback apres une migration incompatible exige
une restauration de la base (volume `inscriptions-club-qualif_pgdata`) — remonter au teamleader.
Reinitialiser completement QUALIF (perte des donnees) : `compose -f docker-compose.qualif.yml down -v`.
