# Changelog des contrats

> Changements de contrats (API, schemas) : `BREAKING` | `CHANGED` | `ADDED`. Lu par le CDP au GATE 2.

## [20261021b] — Durcissement auth (issue #5, audit security)

- **[ADDED]** `users.token_version` — révocation de session (claim JWT `tv`, incrémenté au logout)
- **[ADDED]** variable `TRUST_PROXY` — IP réelle pour le rate-limit derrière un reverse proxy
- **[CHANGED]** `POST /api/auth/login` — second limiteur par e-mail normalisé : 5 échecs / 15 min → `429 rate_limited`
- **[CHANGED]** mutations `/api/*` — `Origin` obligatoire quand le cookie `sid` est présent et égale à `APP_BASE_URL` (sinon `403 forbidden`) ;
  `Sec-Fetch-Site: cross-site` refusé. Couvre aussi `/api/public/*`.
- **[CHANGED]** démarrage — refus de `SESSION_SECRET` peu varié et de `ADMIN_PASSWORD` trivial/d'exemple
- **[ADDED]** `Cache-Control: no-store` sur toutes les réponses `/api`

## [20261021] — Milestone v0.1.0 (issues #5, #6, #7)

Aucun contrat préexistant : aucun changement BREAKING.

- **[NEW]** `contracts/models.md` — tables `users`, `activities`, `registrations`, `mailings`,
  `mailing_activities`, `mailing_recipients` ; variables d'environnement
- **[NEW]** `GET /health` — santé (smoke DEPLOY)
- **[NEW]** `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` — session cookie (#5)
- **[NEW]** `GET|POST /api/activities`, `GET|PATCH|DELETE /api/activities/:id`,
  `POST /api/activities/:id/open`, `POST /api/activities/:id/close`, `GET /api/activities/:id/registrations` (#5)
- **[NEW]** `GET /api/public/activities/:slug`, `POST /api/public/activities/:slug/registrations`,
  `GET|DELETE /api/public/registrations/:token` — inscription sans compte, consentement, suppression (#6)
- **[NEW]** `GET /api/mailings/recipients-preview`, `GET|POST /api/mailings`, `GET /api/mailings/:id`,
  `GET /api/mail/status` — e-mail groupé et historique (#7)
