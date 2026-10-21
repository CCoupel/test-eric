# Changelog des contrats

> Changements de contrats (API, schemas) : `BREAKING` | `CHANGED` | `ADDED`. Lu par le CDP au GATE 2.

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
