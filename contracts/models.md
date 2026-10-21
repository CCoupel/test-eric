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

- Destinataires = `contact_email` **dédupliqués** sur l'union des inscriptions actives des activités choisies.
- Envoi synchrone en v1 (boucle séquentielle, un message par destinataire, `Bcc` interdit) ; timeout SMTP 10 s
  par message ; l'historique est écrit avant le premier envoi (`status = sending`) puis mis à jour.
- Transport `stub` (SMTP non configuré) : rien n'est envoyé, chaque destinataire est `stubbed`, le contenu est
  journalisé (`logger.info`) — vérifiable en tests et en QUALIF.

## Variables d'environnement (contrat `.env.example`)

| Variable | Obligatoire | Défaut dev | Usage |
|----------|-------------|------------|-------|
| `NODE_ENV` | non | `development` | |
| `APP_PORT` | non | `3000` | port HTTP |
| `APP_BASE_URL` | oui | `http://localhost:3000` | construction des liens publics ; **origine du navigateur** : seule `Origin` autorisée sur les mutations, et `Secure` du cookie si `https://` (en dev avec Vite : `http://localhost:5173`) |
| `TRUST_PROXY` | non | vide (aucun) | nombre de reverse proxys de confiance (ex. `1`) ou liste IP/CIDR ; `true` refusé. Requis pour que le rate-limit par IP voie l'IP réelle derrière un proxy |
| `DATABASE_URL` | oui | — | `postgres://user:pass@host:5432/db` |
| `SESSION_SECRET` | oui | — | ≥ 32 car., ≥ 10 caractères distincts (démarrage refusé sinon) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | oui (1er démarrage) | — | seed du compte initial ; mot de passe ≥ 12 car., valeurs triviales/d'exemple refusées (démarrage refusé) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` | non | vide → stub | Nodemailer |
| `MAIL_FROM` | si SMTP | — | `Club <no-reply@domaine>` |
| `CONSENT_TEXT_VERSION` | non | `2026-10` | version du texte RGPD |
