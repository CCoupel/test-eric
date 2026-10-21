#!/usr/bin/env bash
# Script unique de la CI (commands.ci) : appele par ci-branch.yml, release.yml, qa et deploy.
set -euo pipefail
cd "$(dirname "$0")/.."

# Base de test : si DATABASE_URL n'est pas fournie, demarrer le Postgres ephemere de
# docker-compose.test.yml (meme chemin en local et en CI) et l'arreter en sortie.
if [ -z "${DATABASE_URL:-}" ]; then
  TEST_COMPOSE=(docker compose -f docker-compose.test.yml)
  trap '"${TEST_COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true' EXIT
  "${TEST_COMPOSE[@]}" up -d --wait db
  export DATABASE_URL="postgres://club:club@localhost:${TEST_DB_PORT:-5433}/club_test"
fi

npm ci
npm run lint
npm run typecheck
npm test -- --coverage
npm audit --audit-level=high
npm run build
