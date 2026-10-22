# Inscriptions-club

Application web pour les clubs associatifs : inscriptions aux activités (cours, sorties, événements)
et envoi d'un e-mail groupé aux inscrits d'une ou plusieurs activités.

Pensée pour un bénévole non technique : simple, gratuite, accessible par lien.

## Fonctionnalités (v1 en cours)

- Un responsable crée une activité (titre, date, lieu, places) et l'ouvre aux inscriptions.
- Un participant s'inscrit ou se désinscrit depuis un lien.
- Le responsable envoie un e-mail groupé aux inscrits d'une activité, avec historique.

Hors périmètre v1 : paiement en ligne, application mobile, cotisations, SMS, multi-clubs.

Le cadrage complet est dans [`docs/CADRAGE.md`](docs/CADRAGE.md).

## Stack

- Backend : Node.js 22, Express 5
- Frontend : React 19, Vite, TypeScript
- Base de données : PostgreSQL 16
- Tests : Vitest, Playwright, Supertest

## Prérequis

- **Node.js 22** ou plus récent (`engines` : `>=22`).
- **Conteneurs** :
  - Runners GitHub CI : Docker (`docker compose`).
  - Poste local WSL : **Podman + podman-compose** (rootless).
    Installation : `sudo apt-get install -y podman podman-compose`.
  - Les mêmes fichiers (`Dockerfile`, `docker-compose.*.yml`) servent aux deux moteurs.
- **Playwright** (tests E2E), une seule fois sur le poste local :

  ```bash
  sudo npx playwright install-deps chromium
  ```

  En CI, les dépendances sont installées automatiquement (`--with-deps`).

### Choix du moteur de conteneurs

`scripts/container-env.sh` détecte le moteur : Docker s'il répond (`docker info`), sinon Podman.
Il est à sourcer en bash : `source scripts/container-env.sh`. Il définit `CONTAINER_CLI` et `COMPOSE_CMD`
et une fonction `compose`.

Pour forcer le moteur, définir les variables avant de sourcer le script :

```bash
export CONTAINER_CLI=podman COMPOSE_CMD=podman-compose
```

Sous WSL, `podman-compose` est appelé directement : `podman compose` peut déléguer au binaire
`docker-compose` de Docker Desktop, inutilisable avec Podman.

## Installation

```bash
npm ci
```

## Configuration

1. Copier le modèle de configuration :

   ```bash
   cp .env.example .env
   ```

2. Renseigner les variables. Le contrat complet est dans [`contracts/models.md`](contracts/models.md).
   Le fichier `.env` ne doit jamais être commité.

Variables principales :

| Variable | Rôle |
|----------|------|
| `DATABASE_URL` | Connexion PostgreSQL (obligatoire) |
| `APP_PORT` | Port du serveur (défaut `3000`) |
| `APP_BASE_URL` | URL publique de l'application, origine stricte des requêtes modifiantes (obligatoire en production). En développement avec Vite : `http://localhost:5173` |
| `SESSION_SECRET` | Secret de signature des sessions : **au moins 32 caractères**, variés (≥ 10 caractères distincts). Obligatoire |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | Compte responsable initial, créé au démarrage. Mot de passe : **au moins 12 caractères**, 72 octets maximum, non trivial. Les deux premières variables vont ensemble |
| `TRUST_PROXY` | Nombre de reverse proxys de confiance (ex. `1`), ou liste d'adresses. Vide = aucun proxy. `true` est refusé |
| `CONTACT_EMAIL` | Contact RGPD affiché sur la page de confidentialité. Facultatif : sans valeur, la page affiche un texte neutre. Ce n'est jamais `ADMIN_EMAIL` (identifiant de connexion) |
| `RETENTION_MONTHS` | Durée de conservation des inscriptions après la date de l'activité (défaut `12`, entre `1` et `120`) |
| `RATE_LIMIT_LOGIN_PER_IP_MIN` | Connexions par minute et par IP (défaut `10`). Au-delà de `50` en production, le démarrage est refusé |
| `RATE_LIMIT_REGISTRATION_PER_IP_MIN` | Inscriptions publiques par minute et par IP (défaut `20`) |
| `RATE_LIMIT_REGISTRATION_PER_ACTIVITY_10MIN` | Inscriptions par IP et par activité sur 10 minutes (défaut `10`) |
| `RATE_LIMIT_TOKEN_PER_IP_MIN` | Accès à un lien de gestion `/r/<token>` par minute et par IP (défaut `30`) |
| `RATE_LIMIT_VIEW_PER_IP_MIN` | Consultations de fiches publiques par minute et par IP (défaut `60`) |
| `NODE_ENV` | Environnement d'exécution |
| `CONSENT_TEXT_VERSION` | Version du texte de consentement RGPD. Tout changement du texte doit changer cette version (un test le vérifie) |
| `ALLOW_DB_RESET` | Tests uniquement : force le reset d'une base dont le nom ne finit pas par `_test` |

Le serveur **refuse de démarrer** si une de ces règles n'est pas respectée. Les valeurs d'exemple sont refusées.

### E-mails groupés

| Variable | Rôle |
|----------|------|
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | Serveur SMTP (587 + `SMTP_SECURE=false`, ou 465 + `true`). Vide = mode **stub** : aucun e-mail n'est envoyé |
| `SMTP_USER` / `SMTP_PASS` | Identifiants SMTP (ensemble). Le TLS est alors exigé. `SMTP_PASS` n'est jamais journalisé |
| `SMTP_REQUIRE_TLS` | `true` par défaut hors hôte local |
| `MAIL_FROM` | Expéditeur, adresse unique (`adresse` ou `Nom <adresse>`). Obligatoire avec `SMTP_HOST` |
| `CONTACT_EMAIL` | Contact du pied de page des e-mails groupés (jamais `ADMIN_EMAIL`) |
| `MAILING_MAX_RECIPIENTS` | Plafond de destinataires par envoi (défaut `500`) |
| `MAILING_SYNC_MAX_RECIPIENTS` | Au-delà, l'envoi passe en tâche de fond (défaut `100`) |
| `RATE_LIMIT_MAILING_PER_USER_10MIN` | Envois par responsable et par 10 minutes (défaut `5`) |
| `RATE_LIMIT_CONFIRMATION_PER_ADDRESS_HOUR` / `RATE_LIMIT_CONFIRMATION_GLOBAL_HOUR` | Confirmations d'inscription par adresse (`3`) et au total (`300`) par heure |
| `RATE_LIMIT_UNSUBSCRIBE_PER_IP_MIN` | Accès au désabonnement par IP et par minute (défaut `300`) |

Sans `SMTP_HOST`, aucun e-mail ne part : le bandeau « simulé » s'affiche dans l'interface. Configuration, exemples de fournisseurs,
délivrabilité (SPF, DKIM, DMARC) et dépannage : voir [`docs/EMAIL.md`](docs/EMAIL.md).

## Comptes responsables

Les responsables se connectent avec un e-mail et un mot de passe. Il n'existe pas encore d'inscription publique.

- **Compte initial** : créé au démarrage à partir de `ADMIN_EMAIL`, `ADMIN_PASSWORD` et `ADMIN_NAME`.
- **Comptes suivants** : en ligne de commande, sur le serveur ou dans le conteneur.

  ```bash
  npm run user:create -- <email> <nom>
  ```

  Le mot de passe est **généré**, affiché **une seule fois** sur la sortie standard, et jamais journalisé.
  Transmettez-le hors canal public.
- **Pas de changement de mot de passe en v1** : le mot de passe généré est définitif. Une commande de réinitialisation
  est prévue (voir [`docs/SECURITY.md`](docs/SECURITY.md)).
- Tous les responsables ont les mêmes droits en v1.

## Sécurité

Résumé. Le modèle de menace complet est dans [`docs/SECURITY.md`](docs/SECURITY.md).

- Session dans un cookie `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS. Le logout révoque toutes les sessions du compte.
- Limites de connexion : **10 tentatives par minute et par IP** (réglable, voir `RATE_LIMIT_LOGIN_PER_IP_MIN`),
  et **5 échecs par 15 minutes et par e-mail**. Seuls les échecs comptent. Un compte peut donc être bloqué temporairement,
  même par un tiers qui connaît son adresse.
- Inscriptions publiques : limites par IP et par activité, honeypot anti-robot, token de gestion haché en base.
  Les valeurs sont dans le tableau de configuration.
- Vérification de l'en-tête `Origin` sur les requêtes modifiantes de `/api`.
- En-têtes de sécurité via helmet. Réponses de `/api` et des pages `/r/*` en `Cache-Control: no-store`.
- Les mots de passe sont hachés (bcrypt). Les secrets ne sont jamais passés en argument de ligne de commande.
- Données personnelles des participants : voir la section Exploitation et [`docs/SECURITY.md`](docs/SECURITY.md).

## Utilisation

### Parcours d'un responsable

1. Se connecter sur `/login` avec son e-mail et son mot de passe.
2. Créer une activité (titre, date, lieu, places) depuis `/activities/new`.
3. L'ouvrir aux inscriptions depuis la fiche de l'activité (`/activities/:id`). Les états possibles sont gérés depuis cette fiche : ouvrir, fermer, rouvrir, supprimer.
4. Copier le **lien public** de l'activité, au format `/a/<slug>`, et le partager.
5. Suivre la liste des inscrits depuis la fiche de l'activité. Chaque consultation est journalisée (qui, quelle activité, combien d'inscrits).
6. **Retirer un inscrit** : bouton de suppression sur sa ligne, avec confirmation. Ses données sont supprimées, pas seulement masquées.
7. **Envoyer un e-mail groupé** : menu **E-mails → Composer**. Cocher les activités, vérifier le nombre de destinataires dans l'aperçu,
   saisir l'objet et le message (texte brut), puis envoyer. Un message part par destinataire, sans copie visible des autres.
   - Un seul envoi à la fois ; 5 envois maximum par 10 minutes ; 500 destinataires maximum par envoi.
   - Un même envoi (même objet, même message, mêmes activités) ne peut pas être relancé dans les 5 minutes.
8. **Suivre les envois** : **E-mails → Historique**. Chaque envoi affiche son statut (Envoyé, Partiel, Échec, Simulé) et, pour chaque destinataire,
   `sent`, `failed` ou `stubbed`. Au-delà de 100 destinataires, l'envoi continue en arrière-plan : le détail se met à jour seul.

Après une déconnexion, toute session ouverte sur le compte est invalide.

### Parcours d'un participant

1. Ouvrir le lien public `/a/<slug>` de l'activité. La fiche affiche la date, le lieu et les places restantes.
2. Remplir le formulaire :
   - **adulte** : nom et e-mail du participant ;
   - **mineur** : nom de l'enfant, puis nom et e-mail du parent ou du tuteur. Le mineur est toujours inscrit par son représentant légal.
3. Cocher le **consentement** (non pré-coché). Le texte, sa durée de conservation et la version acceptée sont affichés.
4. Valider. Une page de confirmation affiche le **lien de gestion** `/r/<token>`. Il n'est affiché **qu'une fois** : le copier et le conserver.
5. Pour se désinscrire, ouvrir le lien de gestion et confirmer. Les données sont supprimées.
6. **Désabonnement depuis un e-mail groupé** : chaque message du club contient un lien « Se désinscrire ». Le bouton « Se désabonner » de la messagerie
   **désinscrit en un clic et supprime les données** de cette adresse pour les activités concernées par l'envoi. Ce n'est pas une simple
   mise en sommeil des e-mails. La page `/u/<token>` liste ces activités, et ne supprime rien tant qu'on n'a pas confirmé.

Impossible de s'inscrire une fois l'activité commencée, ou si elle est complète. Un même e-mail ne peut pas inscrire deux fois le même nom à une activité ; un parent peut inscrire plusieurs enfants.
Un participant qui a perdu son lien de gestion doit demander au responsable de le retirer de la liste.

Une page **Confidentialité** (`/confidentialite`) décrit le traitement des données.

## Exploitation (données personnelles)

- **Historique des envois** : purgé avec les inscriptions, selon `RETENTION_MONTHS` (même commande `npm run data:purge`).
- **Arrêt du serveur pendant un envoi** : l'envoi n'est jamais repris ; il est clos en `partial` ou `failed` au redémarrage.
  Prévoir `stop_grace_period: 60s` dans le fichier compose (QUALIF et PROD).

- **Purge** : les inscriptions sont supprimées automatiquement `RETENTION_MONTHS` mois après la date de l'activité.
  La purge s'exécute au démarrage du serveur, puis toutes les 24 heures. Elle peut aussi être lancée à la main :

  ```bash
  npm run data:purge
  ```

  Elle est idempotente et n'affiche que des compteurs, jamais de donnée personnelle.
- **Journaux** : les journaux du serveur ne contiennent ni e-mail, ni token, ni nom de participant. Les adresses IP restent présentes dans les journaux d'authentification et d'inscription : prévoir une rétention courte (30 jours) côté exploitation.
- **Reverse proxy** : son journal d'accès contient les chemins `/r/<token>`. Le masquer, et limiter sa rétention, relève du déploiement.
- **`TRUST_PROXY`** : à renseigner avec le nombre réel de proxys de confiance derrière un reverse proxy. Sans cela, tous les clients partagent le même quota de limitation.

## Lancer en développement

```bash
npm run db:migrate   # applique les migrations à la base indiquée par DATABASE_URL
npm run dev          # serveur avec rechargement automatique (port APP_PORT, défaut 3000)
npm run dev:web      # front Vite ; proxifie `/api` et `/health` vers le port 3000
```

## Base de données de test

Le fichier [`docker-compose.test.yml`](docker-compose.test.yml) démarre un PostgreSQL 16 éphémère
(données en mémoire, identifiants de test uniquement) sur le port `5433`.

Démarrage manuel (sans `--wait`, non supporté par podman-compose) :

```bash
source scripts/container-env.sh
compose -f docker-compose.test.yml up -d db
# attendre que Postgres réponde (pg_isready) avant de lancer les tests
export DATABASE_URL=postgres://club:club@localhost:5433/club_test
```

Arrêt : `compose -f docker-compose.test.yml down -v`.

Le plus simple reste de laisser `scripts/ci.sh` démarrer et arrêter cette base : il le fait lorsque
`DATABASE_URL` n'est pas définie.

### Node Windows dans WSL

Si `node` est le binaire **Windows** (`node.exe`), il ne reçoit les variables WSL que listées dans `WSLENV`.
Sans cela, `DATABASE_URL` est absente et les tests d'intégration sont ignorés silencieusement.

`scripts/ci.sh` ajoute `DATABASE_URL:CI:NODE_ENV:APP_PORT:E2E_BASE_URL` à `WSLENV` automatiquement.
Hors `ci.sh`, par exemple pour un test ciblé :

```bash
export DATABASE_URL=postgres://club:club@localhost:5433/club_test
export WSLENV="${WSLENV:+$WSLENV:}DATABASE_URL"
```

Pour la parité avec la CI, utiliser un Node 22 Linux en tête de `PATH`.

## Tests et qualité

```bash
npm test             # tests unitaires et d'intégration (Vitest)
npm run test:e2e     # tests end-to-end (Playwright, contre l'application construite)
npm run lint         # ESLint
npm run typecheck    # TypeScript
scripts/ci.sh        # enchaînement complet : lint, typecheck, tests, audit, build, E2E
```

- **Seuil de couverture** : 70 % (lignes, branches, fonctions, instructions). Sous ce seuil, `npm test` échoue.
- **Garde-fou de reset** : les tests font un `DROP SCHEMA public`. Ils refusent de tourner si le nom de la base
  ne finit pas par `_test`. Pour forcer malgré tout : `ALLOW_DB_RESET=1` (usage tests uniquement, jamais en QUALIF ou PROD).

## Build

```bash
npm run build        # compile le serveur (dist/server) et le front (dist/web)
npm start            # démarre le serveur compilé
```

L'image applicative est définie par le `Dockerfile` (multi-stage, utilisateur non root) : elle emballe
le `dist/` déjà compilé, sans recompiler au déploiement.

## Déploiement (QUALIF / PROD)

Le principe : **un artefact compilé une seule fois**, puis installé dans chaque environnement.

| Environnement | Mécanisme |
|---------------|-----------|
| **QUALIF** | Promotion de l'artefact construit localement : aucune recompilation. |
| **PROD** | Fusion sur `main` puis tag `vX.Y.Z` : la CI reconstruit de façon déterministe et publie la release. |

Commandes (agents du teamleader) :

- `/build` : compile la version candidate.
- `/publish qualif` puis `/deploy qualif` : publie puis installe l'artefact sur QUALIF.
- Procédures détaillées : `.claude/agents/environments/`.

### Fichier `qualif.env`

Les variables propres à QUALIF sont dans `.claude/agents/environments/qualif.env`, créé à partir de
`.claude/agents/environments/qualif.env.example`. Ce fichier n'est jamais commité.

Variables obligatoires : `APP_PORT`, `APP_BASE_URL`, `POSTGRES_PASSWORD`, `SESSION_SECRET`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `ADMIN_NAME`. Les variables `POSTGRES_USER` et `POSTGRES_DB` sont optionnelles (défaut `club`).
`DATABASE_URL` n'est pas à renseigner : elle est dérivée par le fichier compose.

## Conventions

- **Branches** : `milestone/vX.Y.Z` pour le travail d'un milestone ; jamais de travail direct sur `main`.
- **Commits** : [Conventional Commits](https://www.conventionalcommits.org/fr/) — `type(scope): message`
  (types : `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`).
- **Versions** : `X.Y.Z.a` en développement, `X.Y.Z` en production. Les tags `vX.Y.Z` déclenchent la release CI.
- **Changelog** : [`CHANGELOG.md`](CHANGELOG.md), format Keep a Changelog.

## Contribuer

1. Créer ou reprendre une issue GitHub, rattachée au milestone courant.
2. Travailler sur la branche du milestone, en petits commits Conventional Commits.
3. Lancer `scripts/ci.sh` avant de pousser.
4. Mettre à jour `CHANGELOG.md` pour toute modification visible.
