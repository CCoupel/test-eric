#!/usr/bin/env bash
# Script unique de la CI (commands.ci) : appele par ci-branch.yml, release.yml, qa et deploy.
set -euo pipefail
cd "$(dirname "$0")/.."

# Base de test : si DATABASE_URL n'est pas fournie, demarrer le Postgres ephemere de
# docker-compose.test.yml (meme chemin en local et en CI) et l'arreter en sortie.
# Moteur : docker (runners GitHub) ou podman (poste local) — voir scripts/container-env.sh.
if [ -z "${DATABASE_URL:-}" ]; then
  # shellcheck source=scripts/container-env.sh
  source scripts/container-env.sh
  TEST_COMPOSE_FILE=docker-compose.test.yml
  trap 'compose -f "$TEST_COMPOSE_FILE" down -v >/dev/null 2>&1 || true' EXIT
  compose -f "$TEST_COMPOSE_FILE" up -d db
  wait_pg "$TEST_COMPOSE_FILE" db club club_test 60
  export DATABASE_URL="postgres://club:club@localhost:${TEST_DB_PORT:-5433}/club_test"
fi

# WSL avec le node Windows (node.exe) : les variables d'environnement WSL ne lui parviennent
# que si elles sont listees dans WSLENV. Sans effet sur un node Linux (runners GitHub).
if [ "$(node -p process.platform)" = win32 ]; then
  WSLENV="${WSLENV:-}"
  export WSLENV="${WSLENV:+${WSLENV%:}:}DATABASE_URL:CI:NODE_ENV:APP_PORT:E2E_BASE_URL"
fi

npm ci
npm run lint
npm run typecheck
npm test -- --coverage
npm audit --audit-level=high
npm run build
