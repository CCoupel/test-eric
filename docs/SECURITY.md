# Sécurité — Inscriptions-club

> Modèle de menace v1 et état des mesures. Source : audit `security` (LOT-2, score 93/100 après corrections).
> Pour la configuration, voir le README (section « Configuration » et « Sécurité »).

## Périmètre et données

- Application web d'inscriptions aux activités d'un club associatif.
- Données personnelles : e-mail et nom des responsables ; données des participants (dont des **mineurs** inscrits par leurs parents).
  Le régime RGPD s'applique.
- Acteurs : **responsables** (authentifiés) et **participants** (anonymes, via le lien public `/a/<slug>`, à partir du LOT-3).

## Menaces prises en compte

| Menace | Mesure en place |
|--------|-----------------|
| Devinette de mot de passe | Limites : 10 tentatives/min/IP ; 5 échecs/15 min/e-mail (succès non comptés). Mots de passe ≥ 12 caractères, ≤ 72 octets, valeurs triviales refusées. |
| Vol ou rejeu de session | Cookie `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS. Claim `tv` (token_version) : le logout invalide toutes les sessions du compte. Jeton sans `tv` rejeté. |
| CSRF | Vérification stricte de `Origin` (égal à `APP_BASE_URL`) sur les méthodes non sûres de `/api`. Sans `Origin` mais avec cookie `sid` : 403. `Sec-Fetch-Site: cross-site` : 403. |
| Injection SQL | Requêtes paramétrées uniquement. `PATCH` : liste blanche de colonnes. |
| Données non attendues | Validation `zod` `strictObject` : champs inconnus rejetés (400). |
| Énumération de comptes | Erreurs génériques au login ; format d'erreur du contrat sans détail interne. |
| Fuite de données en cache | `Cache-Control: no-store` sur `/api`. |
| Fuite de secrets dans les logs | Redaction pino (cookie, authorization, mot de passe). Événements d'auth sans e-mail en clair (`login_ok` avec `userId`, `login_failed` avec IP). |
| Mauvaise IP derrière un proxy | `TRUST_PROXY` explicite (défaut : aucun). `true` refusé. |
| En-têtes navigateur | helmet ; HSTS et `upgrade-insecure-requests` selon HTTPS. |
| Mot de passe initial faible | `user:create` génère un mot de passe (120 bits, CSPRNG), affiché une fois, jamais en argument ni dans les logs. |
| Dépendances vulnérables | `npm audit --audit-level=high` : 0 vulnérabilité à la revue LOT-2. Exécuté par la CI. |

## Variables sensibles

| Variable | Exigence |
|----------|----------|
| `SESSION_SECRET` | ≥ 32 caractères, ≥ 10 caractères distincts. Jamais commité, jamais en argument. |
| `ADMIN_PASSWORD` | ≥ 12 caractères, ≤ 72 octets, non trivial. Compte initial seulement. |
| `POSTGRES_PASSWORD` (QUALIF/PROD) | Caractères sûrs pour une URL. |
| `SMTP_PASS` (à venir) | Hors dépôt. |

Les fichiers `.env`, `qualif.env` et `prod.env` ne sont jamais commités. Les fichiers `*.env.example` ne contiennent aucune valeur réelle.

## Points acceptés

- **Préfixe de cookie `__Host-` non appliqué** (I4) : le nom `sid` est figé par le contrat et les tests. `__Host-` exige `Secure`,
  inutilisable en QUALIF servi en http. Le risque visé (écrasement par un sous-domaine voisin) n'existe pas pour une application mono-hôte.
  À rouvrir si l'application est un jour hébergée sur un domaine partagé.
- **Verrouillage par e-mail (F-a)** : 5 échecs sur un e-mail connu bloquent aussi le titulaire légitime pendant 15 minutes.
  Compromis assumé entre protection contre la devinette et disponibilité. Impact limité à un annuaire de responsables de club.
- **Compteurs de rate-limit en mémoire** (I-a) : remis à zéro au redémarrage, non partagés entre instances. Acceptable en mono-instance.
- **Mêmes droits pour tous les responsables** (I-d) : choix du contrat v1.
- **Mot de passe affiché en sortie standard** (F-c) par `user:create` : affichage unique voulu. Risque de journalisation si exécuté
  via CI ou `podman exec` journalisé. Obligation : transmettre le mot de passe hors canal public.

## Points à traiter

1. **Avant PROD** : renseigner `TRUST_PROXY` avec le nombre réel de sauts (ex. `1` derrière un reverse proxy TLS), et vérifier que
   le proxy écrase `X-Forwarded-For` entrant. Sans cela, tous les clients partagent le même quota de limitation.
2. **Réinitialisation de mot de passe** : aucune fonction en v1. À prévoir (`user:reset-password`), avec révocation des sessions du compte.
3. **Décision F-a** : garder la clé e-mail seule, ou passer à une clé `e-mail + IP`, ou assouplir le seuil (ex. 10 échecs).
4. **Droits des responsables** (RGPD) : à rouvrir si le rôle doit différencier les actions (suppression de données, export).
5. **Rate-limit et Origin sur `/api/public/*`** : à vérifier au LOT-3, ainsi que l'absence de token ou de consentement dans les réponses publiques.

## Signalement

Tout problème de sécurité se signale au responsable du projet, sans ouvrir d'issue publique avec le détail de l'exploit.
