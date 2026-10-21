# Image applicative Inscriptions-club — OCI standard (docker build / podman build).
#
# BORE : l'image EMBALLE l'application deja construite (`dist/`, produit par `npm run build` en
# BUILD local ou par scripts/ci.sh dans release.yml) — elle ne recompile jamais le code. Le
# contexte de build est donc l'artefact livre : dist/ + package.json + package-lock.json
# (+ Dockerfile, docker-compose.<env>.yml). Voir .dockerignore.

# Etape 1 — dependances de production uniquement
FROM docker.io/library/node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Etape 2 — image d'execution minimale, utilisateur non root
FROM docker.io/library/node:22-alpine
ENV NODE_ENV=production \
    APP_PORT=3000
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node dist ./dist
USER node
EXPOSE 3000
# Ignore par `podman build` au format OCI (avertissement) : les fichiers compose portent aussi
# un healthcheck, et les procedures de deploiement verifient /health par HTTP.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${APP_PORT}/health" || exit 1
# Les migrations (dist/server/db/migrations) sont appliquees au demarrage par dist/server/index.js.
CMD ["node", "dist/server/index.js"]
