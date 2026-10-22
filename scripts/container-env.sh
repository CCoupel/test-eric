#!/usr/bin/env bash
# shellcheck disable=SC2317 # "return || exit" : return si source, exit si execute
# Detection du moteur de conteneurs — a SOURCER (bash) : `source scripts/container-env.sh`.
# Runners GitHub : docker. Poste local (WSL) : podman. Meme Dockerfile / memes fichiers compose.
#
# Exporte :
#   CONTAINER_CLI  docker | podman           (surcharge possible avant le source)
#   COMPOSE_CMD    "docker compose" | "docker-compose" | "podman-compose" | "podman compose"
#                  (surcharge possible avant le source)
# Definit la fonction `compose` (= $COMPOSE_CMD "$@").
#
# Pas de dependance a `compose up --wait` ni a `depends_on: condition` : podman-compose ne les
# gere pas, et les healthchecks podman ne tournent pas sans systemd. Les scripts attendent la
# base avec `pg_isready` (voir wait_pg) et l'application avec un appel HTTP.

_container_cli_works() { "$1" info >/dev/null 2>&1; }

if [ -z "${CONTAINER_CLI:-}" ]; then
  if command -v docker >/dev/null 2>&1 && _container_cli_works docker; then
    CONTAINER_CLI=docker
  elif command -v podman >/dev/null 2>&1 && _container_cli_works podman; then
    CONTAINER_CLI=podman
  else
    echo "Aucun moteur de conteneurs utilisable (docker ou podman)." >&2
    echo "  Ubuntu/WSL : sudo apt-get update && sudo apt-get install -y podman podman-compose" >&2
    return 1 2>/dev/null || exit 1
  fi
fi

if [ -z "${COMPOSE_CMD:-}" ]; then
  if [ "$CONTAINER_CLI" = docker ]; then
    if docker compose version >/dev/null 2>&1; then COMPOSE_CMD="docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then COMPOSE_CMD="docker-compose"
    fi
  else
    # podman-compose en direct : `podman compose` peut deleguer a un docker-compose
    # (ex. binaire Windows de Docker Desktop visible dans le PATH WSL) qui ne parle pas a podman.
    if command -v podman-compose >/dev/null 2>&1; then COMPOSE_CMD="podman-compose"
    elif podman compose version >/dev/null 2>&1; then COMPOSE_CMD="podman compose"
    fi
  fi
  if [ -z "${COMPOSE_CMD:-}" ]; then
    echo "Moteur $CONTAINER_CLI trouve mais aucun outil compose." >&2
    if [ "$CONTAINER_CLI" = podman ]; then
      echo "  Ubuntu/WSL : sudo apt-get install -y podman-compose" >&2
    else
      echo "  Installer le plugin docker compose v2" >&2
    fi
    return 1 2>/dev/null || exit 1
  fi
fi

export CONTAINER_CLI COMPOSE_CMD

# shellcheck disable=SC2086 # COMPOSE_CMD contient volontairement plusieurs mots
compose() { $COMPOSE_CMD "$@"; }

# compose_up_app <fichier-compose> : (re)cree le service `app` sans toucher a `db`.
# podman-compose 1.0.6 n'applique stop_grace_period qu'a down/stop (pas a la creation : le
# conteneur garderait StopTimeout=10) -> --stop-timeout explicite, valeur lue dans le compose
# (source unique). docker compose l'applique nativement.
compose_up_app() {
  local file=$1 grace
  grace=$(grep -m1 -E '^[[:space:]]*stop_grace_period:[[:space:]]*[0-9]+s' "$file" | grep -oE '[0-9]+' || true)
  if [ "$COMPOSE_CMD" = podman-compose ] && [ -n "$grace" ]; then
    compose --podman-run-args="--stop-timeout $grace" -f "$file" up -d --force-recreate --no-deps app
  else
    compose -f "$file" up -d --force-recreate --no-deps app
  fi
}

# wait_pg <fichier-compose> <service> <user> <base> [timeout_s] : attend que Postgres accepte
# les connexions (pg_isready dans le conteneur), independamment du moteur.
wait_pg() {
  local file=$1 service=$2 user=$3 db=$4 timeout=${5:-60} i
  for ((i = 0; i < timeout; i++)); do
    if compose -f "$file" exec -T "$service" pg_isready -q -U "$user" -d "$db" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Postgres ($service) non pret apres ${timeout}s" >&2
  compose -f "$file" logs --tail=50 "$service" >&2 || true
  return 1
}

# wait_http <url> [timeout_s] : attend une reponse HTTP 2xx (curl, sinon wget).
wait_http() {
  local url=$1 timeout=${2:-60} i
  for ((i = 0; i < timeout; i++)); do
    if command -v curl >/dev/null 2>&1; then
      curl -fsS -o /dev/null "$url" && return 0
    else
      wget -q -O /dev/null "$url" && return 0
    fi
    sleep 1
  done
  echo "$url ne repond pas apres ${timeout}s" >&2
  return 1
}
