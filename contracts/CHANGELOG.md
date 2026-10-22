# Changelog des contrats

> Changements de contrats (API, schemas) : `BREAKING` | `CHANGED` | `ADDED`. Lu par le CDP au GATE 2.

## [20261022c] — Destinataires par adresse (migration 009)

- **[CHANGED]** anonymisation de `mailing_recipients` : un destinataire = une adresse ; effacé (`email`, `error`, hash de désabonnement) seulement quand plus aucune inscription de cette adresse ne subsiste dans les activités de l'envoi (supprimer un enfant n'invalide plus le lien de désabonnement du parent)

## [20261022b] — MAIL_FROM sans SMTP

- **[CHANGED]** `MAIL_FROM` seul (sans `SMTP_HOST`) est accepté : transport `stub`, expéditeur exposé par `GET /api/mail/status` ; `SMTP_HOST` exige toujours `MAIL_FROM` (incident QUALIF : démarrage refusé)

## [20261022] — Alignement contrats / code (revue doc)

- **[CHANGED]** transport `stub` : le journal ne contient plus le contenu des messages (ni adresses) mais le seul sujet tronqué à 40 caractères (exigence security E11, données personnelles)
- **[CHANGED]** `GET|POST /api/public/unsubscribe/:token` : limite `RATE_LIMIT_UNSUBSCRIBE_PER_IP_MIN`, défaut **60/min/IP** (et non 30 comme les tokens de gestion) ; justification : les POST one-click des fournisseurs de messagerie partagent leurs IP

## [20261021e] — E-mails groupés (issue #7, exigences security E1-E14 + désabonnement)

- **[ADDED]** `POST /api/mailings` — `202` (envoi en tâche de fond) au-delà de 100 destinataires ; `409 too_many_recipients | mailing_in_progress | duplicate_mailing` ; `429 rate_limited`
- **[ADDED]** `GET /api/public/unsubscribe/:token`, `POST /api/public/unsubscribe/:token` — désabonnement en un clic (RFC 8058) ; route frontend `/u/:token`
- **[ADDED]** en-têtes `List-Unsubscribe` / `List-Unsubscribe-Post` ; pied de page ; e-mail de confirmation d'inscription (porte le lien de gestion)
- **[ADDED]** colonnes `mailing_recipients.unsubscribe_token_hash`, `mailings.fingerprint` (migration 008) ; variables `SMTP_*`, `MAIL_FROM`, `MAILING_*`, `RATE_LIMIT_MAILING_PER_USER_10MIN`
- **[ADDED]** plafond des e-mails de confirmation par adresse (3/h) et global ; disjoncteur d'envoi groupé (5 échecs consécutifs de connexion/timeout/auth → reste `failed/interrupted`) ; `SMTP_REQUIRE_TLS` ; limite dédiée du désabonnement (300/min/IP)
- **[CHANGED]** purge RGPD : inclut l'historique d'envois (`mailings`) au-delà de `RETENTION_MONTHS`

## [20261021d] — Honeypot renommé (bug QUALIF 0.1.0.4)

- **[CHANGED]** `POST /api/public/activities/:slug/registrations` — honeypot `website` → `hp_extra` ; `website` toléré et ignoré (la saisie automatique
  du navigateur le remplissait : inscriptions légitimes transformées en faux succès)

## [20261021c] — Inscription publique (issue #6, exigences security + décisions utilisateur)

- **[ADDED]** `POST /api/public/activities/:slug/registrations` — champ optionnel `website` (honeypot) ; limites 20/min/IP et 10/10 min/IP+activité
- **[ADDED]** rate-limit `GET|DELETE /api/public/registrations/:token` (30/min/IP) et `GET /api/public/activities/:slug` (60/min/IP)
- **[ADDED]** variables `RETENTION_MONTHS` (défaut 12) et `RATE_LIMIT_*` ; script `npm run data:purge` ; purge automatique quotidienne
- **[ADDED]** anonymisation de `mailing_recipients.error` (en plus de `email` / `registration_id`) à la désinscription et à la purge
- **[ADDED]** journalisation `registrations_viewed` sur `GET /api/activities/:id/registrations` (sans donnée personnelle)
- **[ADDED]** migration `006_mailings` (tables `mailings`, `mailing_activities`, `mailing_recipients`) créée dès #6 pour l'anonymisation ; services d'envoi en #7
- **[ADDED]** variable `RATE_LIMIT_LOGIN_PER_IP_MIN` (défaut 10, contrat inchangé) — surcharge réservée aux tests/E2E
- **[ADDED]** `GET /api/public/info` — `{ contact_email, consent_version, retention_months }` ; variable `CONTACT_EMAIL` (sans repli sur `ADMIN_EMAIL`)
- **[CHANGED]** `consent_version` suffixée `-r<N>` si `RETENTION_MONTHS` ≠ 12 ; `POST …/registrations` → `409 activity_closed` dès que `starts_at` est passé
- **[ADDED]** `DELETE /api/activities/:id/registrations/:registrationId` — suppression + anonymisation par un responsable (audit security M1)
- **[ADDED]** migration `007` — trigger `BEFORE DELETE` sur `registrations` : efface `email`/`error` des `mailing_recipients` liés (défense en profondeur)
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
