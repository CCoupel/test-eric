#!/usr/bin/env bash
# Installation compose d'une version deja livree (QUALIF/PROD), docker ou podman — aucune compilation.
# A lancer DANS le dossier de deploiement qui contient : le fichier compose, Dockerfile, dist/,
# package*.json, .env (app) et db.env (POSTGRES_* seuls), avec ce script et container-env.sh a cote
# (scripts/ du kit). Utilise tel quel en local et sur un hote distant (via ssh).
#
#   scripts/compose-deploy.sh docker-compose.prod.yml
#
# Etapes : build de l'image (emballage de dist/) -> db demarree si absente (volume conserve)
# -> attente pg_isready -> (re)creation de app (stop_grace_period applique) -> /health.
set -euo pipefail

COMPOSE_FILE=${1:?usage: compose-deploy.sh <fichier-compose>}
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=scripts/container-env.sh
source "$HERE/container-env.sh"

for f in "$COMPOSE_FILE" .env db.env Dockerfile; do
  [ -f "$f" ] || { echo "Fichier manquant dans $(pwd) : $f" >&2; exit 1; }
done
env_value() { grep -E "^$1=" "$2" | tail -1 | cut -d= -f2-; }
APP_PORT=$(env_value APP_PORT .env)
PG_USER=$(env_value POSTGRES_USER db.env)
PG_DB=$(env_value POSTGRES_DB db.env)
if [ -z "$APP_PORT" ] || [ -z "$PG_USER" ] || [ -z "$PG_DB" ]; then
  echo "APP_PORT / POSTGRES_USER / POSTGRES_DB vides" >&2; exit 1
fi

echo "Moteur : $CONTAINER_CLI / $COMPOSE_CMD — $(pwd)"
compose -f "$COMPOSE_FILE" build app
compose -f "$COMPOSE_FILE" exec -T db true >/dev/null 2>&1 || compose -f "$COMPOSE_FILE" up -d db
wait_pg "$COMPOSE_FILE" db "$PG_USER" "$PG_DB" 90
# podman-compose : messages « no such container/volume » au premier deploiement sans consequence ;
# le verdict est /health ci-dessous.
compose_up_app "$COMPOSE_FILE" || true
wait_http "http://localhost:$APP_PORT/health" 90
curl -fsS "http://localhost:$APP_PORT/health"
echo
