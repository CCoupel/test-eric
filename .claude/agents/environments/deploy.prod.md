# Deploy — PROD (mecanisme : docker-compose, docker ou podman) — adaptation projet

> Compagnon de `deploy.prod.template.md` : **prevaut sur le template** (pas de registre : l'image
> est construite sur la cible a partir du livrable de la GitHub Release, qui contient `dist/` deja
> compile par la CI — aucune compilation, BORE). Charge par `agents/deploy.md`, Tache DEPLOY PROD.
> **N'est execute que sur ordre explicite de l'utilisateur (`/deploy prod`).**

## Decisions a prendre par l'utilisateur AVANT le premier DEPLOY PROD

La cible PROD n'est pas encore definie. Tant qu'une decision manque, DEPLOY PROD s'arrete
(`DEPLOY BLOQUE`, questions posees par le teamleader via `AskUserQuestion`).

| # | Decision | Options / consequence | Variables |
|---|----------|-----------------------|-----------|
| P1 | **Hote** | (a) meme poste que QUALIF — projet compose `inscriptions-club-prod`, port distinct (defaut documente ci-dessous) ; (b) serveur distant (VPS) accessible en SSH, docker ou podman+podman-compose installe | `PROD_TARGET`, `PROD_HOST`, `PROD_SSH_USER`, `PROD_SSH_KEY_PATH`, `PROD_INSTALL_DIR` |
| P2 | **Domaine** public | nom de domaine (ou sous-domaine) pointant vers l'hote ; fixe `APP_BASE_URL` | `APP_BASE_URL=https://<domaine>` |
| P3 | **TLS / reverse proxy** | Caddy (certificat automatique, recommande) ou nginx + certbot, devant `127.0.0.1:$APP_PORT` ; masquage des tokens dans ses journaux (ci-dessous) ; fixe `TRUST_PROXY` (1 si un seul proxy) | `TRUST_PROXY` |
| P4 | **SMTP** | relais transactionnel (compte dedie, privilege minimal) : hote, port 587 STARTTLS ou 465 TLS, identifiants dans un coffre | `SMTP_*`, `MAIL_FROM` |
| P5 | **DNS e-mail** | SPF incluant le relais, DKIM (signature de `List-Unsubscribe` et `List-Unsubscribe-Post`), DMARC `p=none` puis `quarantine`, alignement du `From` | — (zone DNS) |
| P6 | **Contact RGPD** et compte admin initial | adresse de contact reelle (≠ `ADMIN_EMAIL`) ; admin initial a remplacer par un compte nominatif | `CONTACT_EMAIL`, `ADMIN_*` |
| P7 | **Sauvegardes** de la base | frequence et emplacement des `pg_dump` (non automatises en v0.1.0) | — |

Cas (a) « meme poste » : sans domaine ni certificat, `APP_BASE_URL` ne peut pas etre en https →
la checklist bloque l'envoi d'e-mails (points 1-3). Il ne convient qu'a une PROD sans e-mails
reels, ou avec un reverse proxy local (Caddy) et un domaine pointant vers le poste.

## Checklist pre-PROD (reprend `docs/SECURITY.md`, 15 points + journaux du proxy)

Les points **[auto]** sont controles par la procedure (etape 1) ; les points **[manuel]** sont
confirmes par l'utilisateur (le teamleader les presente avant l'ordre `/deploy prod`).

| # | Controle | Bloquant | Verification |
|---|----------|----------|--------------|
| 1 | `APP_BASE_URL` en **https** | oui | [auto] |
| 2 | **DKIM** : le relais signe `List-Unsubscribe` et `List-Unsubscribe-Post` — verifie sur un message reel (en-tete `DKIM-Signature: h=...list-unsubscribe...`) | oui | [manuel] |
| 3 | **SPF** du domaine de `MAIL_FROM` inclut le relais ; **DMARC** publie ; `From` aligne | oui | [manuel] (`dig TXT <domaine>`, `dig TXT _dmarc.<domaine>`) |
| 4 | `SMTP_REQUIRE_TLS` non desactive ; `SMTP_USER`/`SMTP_PASS` hors depot (coffre) ; compte SMTP dedie | oui | [auto] TLS / [manuel] coffre |
| 5 | `TRUST_PROXY` = nombre reel de proxys (ex. `1`) ; le proxy **ecrase** `X-Forwarded-For` | oui | [auto] valeur ≥ 1 / [manuel] proxy |
| 6 | Journal d'acces du proxy : `/r/<token>`, `/u/<token>`, `/api/public/registrations/<token>`, `/api/public/unsubscribe/<token>` masques ; `Referer` non journalise ; retention ≤ 30 jours | oui | [manuel] (exemples ci-dessous) |
| 7 | Journaux applicatifs (IP en clair dans les evenements d'authentification/inscription) : retention ≤ 30 jours | non | [manuel] (rotation docker/podman ou journald) |
| 8 | `stop_grace_period: 60s` sur `app` (`docker-compose.prod.yml`) | non | fait (applique aussi sous podman via `compose_up_app`) |
| 9 | `CONTACT_EMAIL` renseigne, ≠ `ADMIN_EMAIL` | oui | [auto] |
| 10 | `MAIL_FROM` + `SMTP_HOST` renseignes : pas de mode stub ; lire l'avertissement de demarrage | oui | [auto] + logs |
| 11 | `ADMIN_PASSWORD` non trivial (≥ 12), `SESSION_SECRET` ≥ 32 ; compte initial remplace ensuite | oui | [auto] longueurs (le code refuse les valeurs triviales) |
| 12 | Mono-instance (compteurs et envois non partages) | oui | par construction (1 service `app`) |
| 13 | Decision produit : desabonnement en un clic = desinscription + suppression des donnees | oui | [manuel] |
| 14 | Secrets E2E de `playwright.config.ts` jamais utilises hors tests | oui | [auto] (`prod.env` seul source du `.env` PROD) |
| 15 | `npm audit --audit-level=high` sans vulnerabilite | oui | CI : `scripts/ci.sh` dans `release.yml` (run vert = OK) |
| + | `RATE_LIMIT_LOGIN_PER_IP_MIN` ≤ 50 (le code refuse au-dela en production) | oui | [auto] |

### Exemples de reverse proxy (masquage des tokens, X-Forwarded-For, TLS)

Caddy (≥ 2.7 — valider par `caddy validate`) :

```caddyfile
club.example.org {
    reverse_proxy 127.0.0.1:8081 {
        header_up X-Forwarded-For {remote_host}     # ecrase la valeur fournie par le client
    }
    log {
        output file /var/log/caddy/inscriptions.log {
            roll_keep_for 720h                       # 30 jours
        }
        format filter {
            wrap json
            fields {
                request>uri regexp "^(/r/|/u/|/api/public/(registrations|unsubscribe)/)[^/?#]+" "${1}***"
                request>headers>Referer delete
                request>headers>Cookie delete
                request>headers>Authorization delete
            }
        }
    }
}
```

nginx (TLS par certbot) :

```nginx
map $request_uri $masked_uri {
    ~^(?<p>/(?:r|u)/)[^/?#]+(?<rest>.*)$                                  $p***$rest;
    ~^(?<p>/api/public/(?:registrations|unsubscribe)/)[^/?#]+(?<rest>.*)$ $p***$rest;
    default                                                               $request_uri;
}
log_format masked '$remote_addr [$time_local] "$request_method $masked_uri $server_protocol" '
                  '$status $body_bytes_sent "$http_user_agent"';          # pas de $http_referer
server {
    listen 443 ssl; server_name club.example.org;
    # ssl_certificate ... (certbot)
    access_log /var/log/nginx/inscriptions.log masked;                   # logrotate : rotate 30, daily
    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;                    # ecrase, n'ajoute pas
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

## Variables attendues

Fichier `.claude/agents/environments/prod.env` (modele : `prod.env.example`). **Seul** ce fichier
alimente le `.env` PROD : le `.env` racine (developpement) n'est pas fusionne.

| Variable | Usage |
|----------|-------|
| `PROD_TARGET` | `local` (defaut, meme poste) ou `ssh` |
| `PROD_HOST` / `PROD_SSH_USER` / `PROD_SSH_KEY_PATH` | cible `ssh` uniquement (cle optionnelle : agent SSH sinon) |
| `PROD_INSTALL_DIR` | cible `ssh` : racine d'installation (defaut `/opt/inscriptions-club`) ; local : `build/prod/` du depot |
| `APP_PORT`, `APP_BASE_URL`, `TRUST_PROXY`, `SESSION_SECRET`, `ADMIN_*`, `CONTACT_EMAIL`, `SMTP_*`, `MAIL_FROM`, `POSTGRES_*`, `RATE_LIMIT_*` | voir `prod.env.example` et la checklist |

Prerequis de la cible : docker (compose v2) ou podman + podman-compose, `curl` ; en `ssh` :
`rsync` et `bash` sur l'hote. `APP_PORT` distinct de QUALIF si meme poste (defaut 8081).

```bash
set -uo pipefail
REPO_ROOT=$(git rev-parse --show-toplevel); cd "$REPO_ROOT" || exit 1
VERSION=${VERSION:?VERSION X.Y.Z (heritee de PUBLISH PROD)}
PROD_ENV=.claude/agents/environments/prod.env
[ -f "$PROD_ENV" ] || { echo "$PROD_ENV absent (modele prod.env.example) — DEPLOY BLOQUE"; exit 1; }
# Valeurs PROD lues dans le fichier (sans `source` : aucune interpretation shell des valeurs ;
# rien du .env de developpement). Derniere occurrence d'une cle = valeur retenue.
pv() { grep -E "^$1=" "$PROD_ENV" | tail -1 | cut -d= -f2- | tr -d '\r'; }

# 1. Verification — livrable publie + checklist [auto]
ART="build/prod_v$VERSION/inscriptions-club-$VERSION.tar.gz"
[ -f "$ART" ] || { mkdir -p "build/prod_v$VERSION"; gh release download "v$VERSION" -p "inscriptions-club-$VERSION.tar.gz*" -D "build/prod_v$VERSION"; }
( cd "build/prod_v$VERSION" && sha256sum -c "inscriptions-club-$VERSION.tar.gz.sha256" ) \
  || { echo "Livrable v$VERSION absent ou sha256 invalide — executer /publish prod"; exit 1; }
FAIL=""
for k in APP_PORT APP_BASE_URL TRUST_PROXY SESSION_SECRET ADMIN_EMAIL ADMIN_PASSWORD ADMIN_NAME CONTACT_EMAIL SMTP_HOST MAIL_FROM POSTGRES_PASSWORD; do
  [ -n "$(pv "$k")" ] || FAIL="$FAIL\n- $k vide"
done
[[ "$(pv APP_BASE_URL)" =~ ^https://[^/]+ ]]      || FAIL="$FAIL\n- #1 APP_BASE_URL doit etre en https://<domaine>"
[ "$(pv SMTP_REQUIRE_TLS)" != false ]             || FAIL="$FAIL\n- #4 SMTP_REQUIRE_TLS=false interdit en PROD"
[[ "$(pv TRUST_PROXY)" =~ ^[1-9][0-9]*$|[.:/] ]]  || FAIL="$FAIL\n- #5 TRUST_PROXY : nombre de proxys >= 1 (ou adresses)"
[ "$(pv CONTACT_EMAIL)" != "$(pv ADMIN_EMAIL)" ]  || FAIL="$FAIL\n- #9 CONTACT_EMAIL doit differer de ADMIN_EMAIL"
S=$(pv SESSION_SECRET); [ "${#S}" -ge 32 ]        || FAIL="$FAIL\n- #11 SESSION_SECRET < 32 caracteres"
S=$(pv ADMIN_PASSWORD); [ "${#S}" -ge 12 ]        || FAIL="$FAIL\n- #11 ADMIN_PASSWORD < 12 caracteres"; unset S
RL=$(pv RATE_LIMIT_LOGIN_PER_IP_MIN); [ -z "$RL" ] || [ "$RL" -le 50 ] || FAIL="$FAIL\n- RATE_LIMIT_LOGIN_PER_IP_MIN > 50"
[ -z "$FAIL" ] || { printf 'Checklist PROD [auto] en echec :%b\n' "$FAIL"; exit 1; }   # noms seuls, jamais de valeurs

# 2. Kit d'installation : livrable extrait + .env/db.env generes + scripts de deploiement
KIT="build/prod_v$VERSION/kit"
rm -rf "$KIT"; mkdir -p "$KIT/scripts"
tar -xzf "$ART" -C "$KIT"
cp scripts/compose-deploy.sh scripts/container-env.sh "$KIT/scripts/"
PG_USER=$(pv POSTGRES_USER); PG_USER=${PG_USER:-club}; PG_DB=$(pv POSTGRES_DB); PG_DB=${PG_DB:-club}
KEYS=$(grep -hoE '^[A-Z_][A-Z0-9_]*=' .env.example .claude/agents/environments/prod.env.example | tr -d '=' | sort -u)
( umask 077
  for k in $KEYS; do
    case "$k" in DATABASE_URL|POSTGRES_*|PROD_*) continue ;; esac
    printf '%s=%s\n' "$k" "$(pv "$k")"
  done
  printf 'DATABASE_URL=postgres://%s:%s@db:5432/%s\n' "$PG_USER" "$(pv POSTGRES_PASSWORD)" "$PG_DB"
  printf 'APP_VERSION=%s\n' "$VERSION"
) > "$KIT/.env"
( umask 077; printf 'POSTGRES_USER=%s\nPOSTGRES_DB=%s\nPOSTGRES_PASSWORD=%s\n' "$PG_USER" "$PG_DB" "$(pv POSTGRES_PASSWORD)" ) > "$KIT/db.env"

# 3. Installation (meme script en local et a distance) — releases/<version>, CURRENT/PREVIOUS
TARGET=$(pv PROD_TARGET); TARGET=${TARGET:-local}
if [ "$TARGET" = local ]; then
  ROOT="$REPO_ROOT/build/prod"; mkdir -p "$ROOT/releases"
  rm -rf "$ROOT/releases/$VERSION"; cp -a "$KIT" "$ROOT/releases/$VERSION"
  [ -f "$ROOT/CURRENT" ] && cp "$ROOT/CURRENT" "$ROOT/PREVIOUS"
  ( cd "$ROOT/releases/$VERSION" && bash scripts/compose-deploy.sh docker-compose.prod.yml ) || { echo "Installation PROD en echec"; exit 1; }
  echo "$VERSION" > "$ROOT/CURRENT"
elif [ "$TARGET" = ssh ]; then
  H=$(pv PROD_HOST); U=$(pv PROD_SSH_USER); KEY=$(pv PROD_SSH_KEY_PATH); ROOT=$(pv PROD_INSTALL_DIR); ROOT=${ROOT:-/opt/inscriptions-club}
  [ -n "$H" ] && [ -n "$U" ] || { echo "PROD_HOST / PROD_SSH_USER vides — DEPLOY BLOQUE"; exit 1; }
  SSH=(ssh -o BatchMode=yes ${KEY:+-i "$KEY"} "$U@$H")
  "${SSH[@]}" "mkdir -p '$ROOT/releases/$VERSION' && chmod 700 '$ROOT'" || exit 1
  rsync -a --delete --chmod=Du=rwx,Dgo=,Fu=rw,Fgo= -e "ssh -o BatchMode=yes ${KEY:+-i $KEY}" "$KIT/" "$U@$H:$ROOT/releases/$VERSION/" || exit 1
  "${SSH[@]}" "cd '$ROOT' && { [ -f CURRENT ] && cp CURRENT PREVIOUS || true; } && cd 'releases/$VERSION' && bash scripts/compose-deploy.sh docker-compose.prod.yml && echo '$VERSION' > '$ROOT/CURRENT'" \
    || { echo "Installation PROD distante en echec"; exit 1; }
else
  echo "PROD_TARGET inconnu ($TARGET) — DEPLOY BLOQUE"; exit 1
fi
rm -rf "$KIT"     # le kit (secrets) ne reste que dans releases/<version> de la cible

# 4. Smoke tests — via l'URL publique (reverse proxy + TLS), en plus du /health local de l'etape 3
curl -fsS "$(pv APP_BASE_URL)/health" || { echo "Smoke public en echec (proxy/TLS/DNS ?)"; exit 1; }
curl -fsSI "$(pv APP_BASE_URL)/" | grep -qi '^strict-transport-security' || echo "AVERTISSEMENT : pas de HSTS sur l'URL publique"
# Smoke E2E (tag smoke) contre la PROD, sans donnees de test persistantes :
#   E2E_BASE_URL="$(pv APP_BASE_URL)" npx playwright test --grep @smoke

# 5. Notification
echo "Deploiement PROD termine - v$VERSION ($TARGET) - $(pv APP_BASE_URL)"
```

Apres succes, poursuivre `agents/deploy.md` : Etape 4bis (notes de release), Etape 5 (cloture du
milestone), Etape 6 (nettoyage des branches, ci-dessous).

> **Etape 4bis** : la GitHub Release `vX.Y.Z` est **deja creee par `release.yml`** (notes extraites
> de `CHANGELOG.md`). Ne pas refaire `gh release create` ; pour remplacer les notes :
> `gh release edit "v$VERSION" --notes-file RELEASE_NOTES.md`.

## Echec

```bash
# local
cd "$REPO_ROOT/build/prod/releases/$VERSION" && source scripts/container-env.sh \
  && compose -f docker-compose.prod.yml ps && compose -f docker-compose.prod.yml logs --tail=100 app db
# ssh : meme commande via "${SSH[@]}" "cd '$ROOT/releases/$VERSION' && ..."
```

Echec d'installation (BUILD et PUBLISH ont reussi) : rapport `DEPLOY FAILED` au teamleader, jamais
de correction autonome. Agent responsable : `infra` (cible, proxy, moteur, ports, volumes) ou `dev`
(crash applicatif, migration). Ne pas lancer l'Etape 6 tant que la PROD n'est pas saine.

## Rollback

Vers le livrable precedent, deja installe sur la cible (`releases/<PREVIOUS>`, image
`localhost/inscriptions-club:<PREVIOUS>` conservee) :

```bash
# local
ROOT="$REPO_ROOT/build/prod"; PREV=$(cat "$ROOT/PREVIOUS")
( cd "$ROOT/releases/$PREV" && bash scripts/compose-deploy.sh docker-compose.prod.yml ) && echo "$PREV" > "$ROOT/CURRENT"
# ssh
"${SSH[@]}" "cd '$ROOT' && PREV=\$(cat PREVIOUS) && cd releases/\$PREV && bash scripts/compose-deploy.sh docker-compose.prod.yml && echo \$PREV > '$ROOT/CURRENT'"
```

- Premier deploiement (pas de `PREVIOUS`) : arreter `app` (`compose -f docker-compose.prod.yml stop app`)
  et remonter au teamleader.
- Migrations uniquement ascendantes : si la version fautive a migre la base, restaurer la derniere
  sauvegarde (`pg_dump`, decision P7) avant de relancer l'ancienne version — remonter au teamleader.
- Le tag `vX.Y.Z` reste l'ancrage durable : un livrable peut toujours etre retelecharge
  (`gh release download vX.Y.Z`).

## Etape 6 — Nettoyage des branches (apres PROD confirmee saine)

```bash
git fetch --prune
# deployer ne change pas le HEAD : si la branche courante est encore milestone/vX.Y.Z,
# BRANCH REQUEST au teamleader (« checkout main + pull ») et attendre BRANCH CHANGE DONE
[ "$(git branch --show-current)" != "milestone/v$VERSION" ] || { echo "BRANCH REQUEST requis"; exit 1; }
git merge-base --is-ancestor "milestone/v$VERSION" origin/main || { echo "milestone non contenue dans main — STOP"; exit 1; }
git push origin --delete "milestone/v$VERSION"
git branch -D "milestone/v$VERSION"
```

Jamais : `main`, `gh-pages` (site marketing, worktree `MARKETING/` actif), une branche de milestone
encore actif, une branche ayant un worktree (`git worktree list`). Branche non mergee : la signaler
dans le `DONE`.
