# Endpoints HTTP — Inscriptions-club

> Contrat de référence (contract-first). Préfixe `/api`. JSON UTF-8. Modèles : `contracts/models.md`.
> Le backend peut amender ce contrat pour contrainte technique (raison documentée, entrée `contracts/CHANGELOG.md`).
> Le frontend consulte, ne modifie pas.

## Conventions

- **Auth** : cookie `sid` (JWT HttpOnly). `Auth : Session` = `401 { "error": "unauthenticated" }` sans cookie
  valide. `Auth : Public` = aucun cookie requis.
- **Erreurs** : `{ "error": "<code>", "message": "<lisible>", "details"?: [{ "field", "message" }] }`.
  Codes : `400 validation_error`, `401 unauthenticated`, `403 forbidden`, `404 not_found`, `409 conflict`
  (+ sous-code dans `message`), `429 rate_limited`, `500 internal_error`.
- **Dates** : ISO 8601 UTC. **Pagination** : aucune en v1 (volumes club) ; listes triées comme indiqué.
- **CSRF** : cookie SameSite=Lax + vérification de l'en-tête `Origin` sur les méthodes non sûres.
- **Rate limiting** : `POST /api/auth/login` (10/min/IP) et `POST /api/public/.../registrations` (20/min/IP).

---

## Santé

### GET /health
**Auth** : Public — **Response 200** : `{ "status": "ok", "version": "0.1.0.0", "db": "ok" }` ; `503` si la base
est injoignable (`"db": "error"`). Utilisé par les smoke tests DEPLOY.

---

## Authentification (issue #5)

### POST /api/auth/login
**Auth** : Public
**Request** : `{ "email": "string", "password": "string" }`
**Response 200** : `{ "user": { "id", "email", "name", "role" } }` + `Set-Cookie: sid=…; HttpOnly; SameSite=Lax`
**Errors** : 400, `401 invalid_credentials` (message identique e-mail inconnu / mot de passe faux), 429

### POST /api/auth/logout
**Auth** : Session — **Response 204**, cookie effacé.

### GET /api/auth/me
**Auth** : Session — **Response 200** : `{ "user": { "id", "email", "name", "role" } }` — **Errors** : 401

---

## Activités — espace responsable (issue #5)

Objet `Activity` :
```json
{
  "id": "uuid", "title": "string", "description": "string|null", "starts_at": "iso", "location": "string",
  "capacity": 20, "status": "draft|open|closed", "public_slug": "string", "public_url": "string",
  "owner": { "id": "uuid", "name": "string" },
  "registrations_count": 0, "remaining_places": 20,
  "created_at": "iso", "updated_at": "iso"
}
```

### GET /api/activities
**Auth** : Session — liste de toutes les activités du club, triées par `starts_at` desc.
**Query** : `status` (optionnel : `draft|open|closed`)
**Response 200** : `{ "activities": [Activity] }`

### POST /api/activities
**Auth** : Session
**Request** : `{ "title", "description"?, "starts_at", "location", "capacity"?: number|null }`
**Response 201** : `{ "activity": Activity }` — `status = draft`, `public_slug` généré.
**Errors** : 400 (titre vide/>120, `starts_at` invalide, `capacity` ≤ 0), 401

### GET /api/activities/:id
**Auth** : Session — **Response 200** : `{ "activity": Activity }` — **Errors** : 401, 404

### PATCH /api/activities/:id
**Auth** : Session
**Request** : sous-ensemble de `{ "title", "description", "starts_at", "location", "capacity" }`
**Response 200** : `{ "activity": Activity }`
**Errors** : 400, 401, 404, `409 capacity_below_registrations` (nouvelle capacité < inscrits actifs)

### POST /api/activities/:id/open
**Auth** : Session — `draft|closed → open`. **Response 200** : `{ "activity": Activity }`
**Errors** : 401, 404, `409 invalid_transition` (déjà `open`)

### POST /api/activities/:id/close
**Auth** : Session — `open → closed`. **Response 200** : `{ "activity": Activity }`
**Errors** : 401, 404, `409 invalid_transition`

### DELETE /api/activities/:id
**Auth** : Session — **Response 204**
**Errors** : 401, 404, `409 has_registrations` (statut ≠ draft et inscriptions actives)

### GET /api/activities/:id/registrations
**Auth** : Session — inscriptions actives, triées par `created_at` asc.
**Response 200** :
```json
{ "registrations": [ { "id", "participant_name", "is_minor", "contact_name", "contact_email", "created_at" } ],
  "count": 12, "capacity": 20, "remaining_places": 8 }
```
**Errors** : 401, 404

### DELETE /api/activities/:id/registrations/:registrationId
**Auth** : Session (+ `Origin` vérifié) — suppression physique d'une inscription par un responsable (droit à l'effacement :
lien de gestion perdu, demande reçue du parent) avec anonymisation des historiques d'envoi liés, dans une transaction.
**Response 204** — **Errors** : 401, 403 (Origin), 404 (activité inconnue **ou** inscription n'appartenant pas à cette activité, ou déjà supprimée).
Journalisé (`registration_removed_by_manager` : userId, activityId, registrationId — aucune donnée personnelle).

---

## Inscription publique (issue #6)

### GET /api/public/info
**Auth** : Public — informations légales pour la page de confidentialité (lecture seule, `Cache-Control: no-store`, 60/min/IP).
**Response 200** : `{ "contact_email": "string|null", "consent_version": "2026-10" }` (`contact_email` = `CONTACT_EMAIL`, sinon `ADMIN_EMAIL`, sinon `null`).

### GET /api/public/activities/:slug
**Auth** : Public — fiche publique (sans données des inscrits).
**Response 200** :
```json
{ "activity": { "title", "description", "starts_at", "location", "status", "capacity", "remaining_places",
                "is_full": false }, "consent_text": "string", "consent_version": "2026-10" }
```
**Errors** : 404 (slug inconnu **ou** `status = draft` — un brouillon n'est pas visible)

### POST /api/public/activities/:slug/registrations
**Auth** : Public
**Request** :
```json
{ "participant_name": "string", "is_minor": true, "contact_name": "string", "contact_email": "string",
  "consent": true }
```
- `is_minor = false` → `contact_name` ignoré, copié depuis `participant_name`.
- `is_minor = true` → `contact_name` obligatoire (parent / tuteur) ; l'e-mail est celui du parent.
- `consent` doit valoir `true` (booléen strict) ; `consent_at` / `consent_version` sont posés par le serveur.
- `website` (optionnel) : **honeypot** — champ masqué du formulaire, laissé vide par un humain. Rempli : réponse `201` factice,
  rien n'est enregistré. Tout autre champ non déclaré → `400 validation_error`.
- Limites : 20/min/IP **et** 10 / 10 min / IP / activité (`429 rate_limited`). `GET|DELETE …/registrations/:token` : 30/min/IP ; fiche publique : 60/min/IP.
**Response 201** :
```json
{ "registration": { "id", "participant_name", "is_minor", "contact_name", "contact_email", "created_at" },
  "manage_url": "https://…/r/<token>" }
```
`manage_url` n'est renvoyé **qu'ici** (token non récupérable ensuite, sauf e-mail de confirmation si SMTP, lot #7).
**Errors** : 400 (champs, e-mail, `consent ≠ true`), 404 (slug inconnu / draft), `409 activity_closed`,
`409 activity_full`, `409 already_registered`, 429

### GET /api/public/registrations/:token
**Auth** : Public (le token fait office de preuve)
**Response 200** :
```json
{ "registration": { "id", "participant_name", "is_minor", "contact_name", "contact_email", "created_at" },
  "activity": { "title", "starts_at", "location", "status", "public_url" } }
```
**Errors** : 404 (token inconnu — réponse identique pour token invalide et inscription déjà supprimée)

### DELETE /api/public/registrations/:token
**Auth** : Public — désinscription **et** suppression des données personnelles (ligne supprimée,
`mailing_recipients` anonymisés). **Response 204** — **Errors** : 404

---

## E-mails groupés (issue #7)

Objet `Mailing` :
```json
{
  "id": "uuid", "subject": "string", "body": "string", "status": "sending|sent|partial|failed",
  "transport": "smtp|stub", "sender": { "id", "name" },
  "activities": [ { "id", "title" } ],
  "recipients_count": 25, "sent_count": 24, "failed_count": 1,
  "created_at": "iso", "completed_at": "iso|null"
}
```

### GET /api/mailings/recipients-preview
**Auth** : Session — aperçu avant envoi.
**Query** : `activity_ids` (liste séparée par virgules, 1..20)
**Response 200** : `{ "recipients_count": 25, "by_activity": [ { "id", "title", "count" } ] }` (dédupliqué)
**Errors** : 400, 401, 404 (une activité inconnue)

### POST /api/mailings
**Auth** : Session — crée l'envoi, envoie **synchroniquement**, renvoie le résultat.
**Request** : `{ "activity_ids": ["uuid"], "subject": "string", "body": "string" }`
**Response 201** : `{ "mailing": Mailing }` (`status` final : `sent|partial|failed`)
**Errors** : 400 (liste vide, sujet/corps vides ou trop longs), 401, 404, `409 no_recipients`
> Contrainte technique acceptée : réponse pouvant durer plusieurs secondes (≤ 10 s × N). Hors-contrat perf
> (`testing.perf` non applicable à cet endpoint). Le frontend affiche un état « envoi en cours ».

### GET /api/mailings
**Auth** : Session — historique, trié `created_at` desc.
**Response 200** : `{ "mailings": [Mailing] }` (sans `body`)

### GET /api/mailings/:id
**Auth** : Session
**Response 200** : `{ "mailing": Mailing, "recipients": [ { "email": "string|null", "status", "error", "sent_at" } ] }`
(`email = null` pour un destinataire désinscrit depuis)
**Errors** : 401, 404

### GET /api/mail/status
**Auth** : Session — **Response 200** : `{ "transport": "smtp|stub", "from": "string|null" }` — affiché comme
bandeau d'avertissement dans l'écran d'envoi quand `stub`.

---

## Routes frontend (React Router)

| Route | Auth | Écran |
|-------|------|-------|
| `/login` | — | Connexion |
| `/activities` | Session | Liste des activités (défaut après login) |
| `/activities/new` | Session | Formulaire de création |
| `/activities/:id` | Session | Détail : édition, ouvrir/fermer, lien public, inscrits |
| `/mailings` | Session | Historique des envois |
| `/mailings/new` | Session | Composer un envoi |
| `/mailings/:id` | Session | Détail d'un envoi |
| `/a/:slug` | Public | Fiche publique + formulaire d'inscription |
| `/r/:token` | Public | Gestion de l'inscription (désinscription) |
