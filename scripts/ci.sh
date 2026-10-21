#!/usr/bin/env bash
# Script unique de la CI (commands.ci) : appele par ci-branch.yml, release.yml, qa et deploy.
set -euo pipefail
cd "$(dirname "$0")/.."

npm ci
npm run lint
npm run typecheck
npm test -- --coverage
npm audit --audit-level=high
npm run build
