# Changelog des contrats

> Changements de contrats (API, schemas) : `BREAKING` | `CHANGED` | `ADDED`. Lu par le CDP au GATE 2.

## [20261021c] — Inscription publique (issue #6, exigences security + décisions utilisateur)

- **[ADDED]** `POST /api/public/activities/:slug/registrations` — champ optionnel `website` (honeypot) ; limites 20/min/IP et 10/10 min/IP+activité
- **[ADDED]** rate-limit `GET|DELETE /api/public/registrations/:token` (30/min/IP) et `GET /api/public/activities/:slug` (60/min/IP)
- **[ADDED]** variables `RETENTION_MONTHS` (défaut 12) et `RATE_LIMIT_*` ; script `npm run data:purge` ; purge automatique quotidienne
- **[ADDED]** anonymisation de `mailing_recipients.error` (en plus de `email` / `registration_id`) à la désinscription et à la purge
- **[ADDED]** journalisation `registrations_viewed` sur `GET /api/activities/:id/registrations` (sans donnée personnelle)
- **[ADDED]** migration `006_mailings` (tables `mailings`, `mailing_activities`, `mailing_recipients`) créée dès #6 pour l'anonymisation ; services d'envoi en #7
- **[CHANGED]** `409 already_registered` conservé (décision utilisateur) sous réserve du rate-limit renforcé

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
