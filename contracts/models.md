# Modèles de données — Inscriptions-club

> Contrat de référence (contract-first). Backend : PostgreSQL, migrations SQL versionnées dans `src/server/db/migrations/`
> (pas d'ORM). Toute modification est consignée dans `contracts/CHANGELOG.md`.
> Décisions GATE 1.5 (2026-10-21) : mineurs inscrits par le parent uniquement ; comptes responsables seedés ;
> SMTP configurable + stub ; QUALIF Docker Compose local.

## Conventions

- Identifiants : `uuid` (générés côté serveur, `gen_random_uuid()`).
- Horodatage : `timestamptz`, ISO 8601 en JSON (UTC).
- E-mails : stockés en minuscules, validés RFC 5322 simple (`x@y.z`).
- Suppression des données personnelles : **suppression physique** de la ligne `registrations` ; les lignes
  `mailing_recipients` liées sont conservées **anonymisées** (`registration_id = NULL`, `email = NULL`) pour
  garder le compte de destinataires dans l'historique.

## `users` — responsables d'activité (issue #5)

| Colonne | Type | Contraintes | Notes |
|---------|------|-------------|-------|
| id | uuid | PK | |
| email | citext | unique, not null | identifiant de connexion |
| password_hash | text | not null | bcrypt (coût 12) |
| name | text | not null | affiché dans l'historique des envois |
| role | text | not null, `admin` \| `manager` | v1 : mêmes droits ; `admin` réservé à l'évolution |
| token_version | integer | not null default 0 | révocation de session : le JWT porte `tv` ; incrémenté au logout (toutes les sessions du compte) |
| created_at | timestamptz | not null default now() | |

- Pas d'inscription publique : un compte initial est créé au démarrage par **seed** depuis `ADMIN_EMAIL` /
  `ADMIN_PASSWORD` / `ADMIN_NAME` (idempotent : rien si l'e-mail existe). Les autres comptes v1 sont créés par
  script `npm run user:create -- <email> <name>` (mot de passe généré affiché une fois).
- Session : JWT signé (`SESSION_SECRET`, HS256, exp 7 j) dans un cookie `sid` HttpOnly, SameSite=Lax, Secure
  hors développement. Aucune table de sessions.

## `activities` — activités (issue #5)

| Colonne | Type | Contraintes | Notes |
|---------|------|-------------|-------|
| id | uuid | PK | |
| title | text | not null, 1..120 car. | |
| description | text | nullable, ≤ 2000 car. | |
| starts_at | timestamptz | not null | date/heure de l'activité |
| location | text | not null, 1..200 car. | |
| capacity | integer | nullable, > 0 | `null` = illimité |
| status | text | not null, `draft` \| `open` \| `closed` | voir machine à états |
| public_slug | text | unique, not null | 12 car. base62 aléatoires ; lien public `/a/<slug>` |
| owner_id | uuid | FK users(id), not null | créateur |
| created_at / updated_at | timestamptz | not null | |

Machine à états : `draft → open → closed → open` (réouverture autorisée). Suppression physique autorisée
uniquement si `status = draft` **ou** aucune inscription active.

Champs calculés (jamais stockés) : `registrations_count` (inscriptions actives), `remaining_places`
(`capacity - registrations_count`, `null` si illimité), `public_url`.

## `registrations` — inscriptions (issue #6)

| Colonne | Type | Contraintes | Notes |
|---------|------|-------------|-------|
| id | uuid | PK | |
| activity_id | uuid | FK activities(id) on delete cascade, not null | |
| participant_name | text | not null, 1..120 car. | nom du participant (enfant si mineur) |
| is_minor | boolean | not null | si `true`, le contact est le parent / tuteur |
| contact_name | text | not null, 1..120 car. | parent si mineur, sinon = participant (copié) |
| contact_email | citext | not null | **seul e-mail stocké** |
| consent_at | timestamptz | not null | case RGPD cochée (texte : `CONSENT_TEXT_VERSION`) |
| consent_version | text | not null | version du texte de consentement affiché |
| manage_token_hash | text | unique, not null | SHA-256 du token du lien de gestion `/r/<token>` |
| created_at | timestamptz | not null | |

- Unicité : `(activity_id, contact_email, lower(participant_name))` — un parent peut inscrire plusieurs enfants.
- Capacité : insertion dans une transaction avec `SELECT … FOR UPDATE` sur l'activité ; refus `409` si complet.
- Désinscription = `DELETE` de la ligne (suppression des données personnelles, critère #6).
- Conservation : les inscriptions sont supprimées physiquement `RETENTION_MONTHS` mois après `activities.starts_at`
  (purge idempotente, mêmes anonymisations que la désinscription). Chaque consultation de la liste des inscrits par un
  responsable est journalisée (événement `registrations_viewed` : id responsable, id activité, nombre — aucune donnée personnelle).
- Anonymisation (désinscription ET purge), dans la transaction du DELETE : `mailing_recipients.registration_id`, `email` **et `error`**
  (les erreurs SMTP contiennent l'adresse) passent à `NULL`.
- Le token de gestion (32 octets, base64url) n'est **jamais stocké en clair** : renvoyé une seule fois à la
  création (réponse + page de confirmation), puis par e-mail de confirmation si SMTP configuré (lot #7).

## `mailings` — e-mails groupés (issue #7)

| Colonne | Type | Contraintes | Notes |
|---------|------|-------------|-------|
| id | uuid | PK | |
| subject | text | not null, 1..200 car. | |
| body | text | not null, ≤ 20 000 car. | texte brut ; rendu `text/plain` + `text/html` minimal (paragraphes) |
| sender_id | uuid | FK users(id), not null | responsable à l'origine |
| status | text | not null, `sending` \| `sent` \| `partial` \| `failed` | `partial` = au moins un échec |
| recipients_count | integer | not null | destinataires uniques |
| sent_count / failed_count | integer | not null default 0 | |
| fingerprint | text | nullable | empreinte (sujet, corps, activités) : refus d'un envoi identique < 5 min |
| transport | text | not null, `smtp` \| `stub` | mécanisme utilisé |
| created_at / completed_at | timestamptz | | |

### `mailing_activities`

| Colonne | Type | Contraintes |
|---------|------|-------------|
| mailing_id | uuid | FK mailings(id) on delete cascade |
| activity_id | uuid | FK activities(id) on delete cascade |
| PK | (mailing_id, activity_id) | |

### `mailing_recipients`

| Colonne | Type | Contraintes | Notes |
|---------|------|-------------|-------|
| id | uuid | PK | |
| mailing_id | uuid | FK mailings(id) on delete cascade | |
| registration_id | uuid | FK registrations(id) **on delete set null** | anonymisé à la désinscription |
| email | citext | nullable | mis à `NULL` à la désinscription |
| status | text | `sent` \| `failed` \| `stubbed` | |
| error | text | nullable | message transport |
| sent_at | timestamptz | nullable | |
| unsubscribe_token_hash | text | unique, nullable | SHA-256 du token du lien de désabonnement ; `NULL` une fois utilisé ou anonymisé |

- Destinataires = `contact_email` **dédupliqués** sur l'union des inscriptions actives des activités choisies.
- Envoi synchrone en v1 (boucle séquentielle, un message par destinataire, `Bcc` interdit) ; timeout SMTP 10 s
  par message ; l'historique est écrit avant le premier envoi (`status = sending`) puis mis à jour.
- Purge : `mailings` (et cascade) plus vieux que `RETENTION_MONTHS` supprimés par le même job que les inscriptions.
- Transport `stub` (SMTP non configuré) : rien n'est envoyé, chaque destinataire est `stubbed`, le contenu est
  journalisé (`logger.info`) — vérifiable en tests et en QUALIF.

## Variables d'environnement (contrat `.env.example`)

| Variable | Obligatoire | Défaut dev | Usage |
|----------|-------------|------------|-------|
| `NODE_ENV` | non | `development` | |
| `APP_PORT` | non | `3000` | port HTTP |
| `APP_BASE_URL` | oui | `http://localhost:3000` | construction des liens publics ; **origine du navigateur** : seule `Origin` autorisée sur les mutations, et `Secure` du cookie si `https://` (en dev avec Vite : `http://localhost:5173`) |
| `TRUST_PROXY` | non | vide (aucun) | nombre de reverse proxys de confiance (ex. `1`) ou liste IP/CIDR ; `true` refusé. Requis pour que le rate-limit par IP voie l'IP réelle derrière un proxy |
| `CONTACT_EMAIL` | non | — | contact RGPD affiché sur la page de confidentialité (via `GET /api/public/info`) ; absent → `null`. **Jamais de repli sur `ADMIN_EMAIL`** (identifiant de connexion, ne doit pas être publié) |
| `RETENTION_MONTHS` | non | `12` | purge automatique des inscriptions N mois après `activities.starts_at` (1..120) ; exécutée au démarrage puis chaque jour (`npm run data:purge` pour un lancement manuel) |
| `RATE_LIMIT_LOGIN_PER_IP_MIN` | non | `10` | tentatives de `POST /api/auth/login` par IP et par minute (contrat : 10) ; ne relever qu'en test/E2E. Le limiteur par e-mail (5 échecs / 15 min) n'est pas configurable |
| `RATE_LIMIT_REGISTRATION_PER_IP_MIN` / `RATE_LIMIT_REGISTRATION_PER_ACTIVITY_10MIN` / `RATE_LIMIT_TOKEN_PER_IP_MIN` / `RATE_LIMIT_VIEW_PER_IP_MIN` | non | `20` / `10` / `30` / `60` | limites anti-abus de `/api/public/*` (POST inscription par IP/min ; par IP+activité/10 min ; GET/DELETE token par IP/min ; fiche publique par IP/min) |
| `DATABASE_URL` | oui | — | `postgres://user:pass@host:5432/db` |
| `SESSION_SECRET` | oui | — | ≥ 32 car., ≥ 10 caractères distincts (démarrage refusé sinon) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | oui (1er démarrage) | — | seed du compte initial ; mot de passe ≥ 12 car., valeurs triviales/d'exemple refusées (démarrage refusé) |
| `SMTP_HOST` + `MAIL_FROM` | non (ensemble) | vide → stub | SMTP réel (Nodemailer, timeouts 10 s, TLS vérifié, `requireTLS` si `SMTP_USER`). `MAIL_FROM` = adresse unique (`a@b.fr` ou `Nom <a@b.fr>`), seul `From` utilisé. En production sans SMTP : avertissement au démarrage (aucun e-mail ne part) |
| `SMTP_PORT` / `SMTP_SECURE` | non | `587` (`465` si secure) / `false` | |
| `SMTP_USER` + `SMTP_PASS` | non (ensemble) | — | jamais journalisés ni exposés |
| `MAILING_MAX_RECIPIENTS` / `MAILING_SYNC_MAX_RECIPIENTS` / `RATE_LIMIT_MAILING_PER_USER_10MIN` | non | `500` / `100` / `5` | plafond de destinataires ; seuil du mode synchrone (201) vs tâche de fond (202) ; envois par responsable / 10 min |
| `CONSENT_TEXT_VERSION` | non | `2026-10` | version du texte RGPD ; la version effective porte le suffixe `-r<N>` si `RETENTION_MONTHS` ≠ 12 (le texte accepté mentionne la durée) |
