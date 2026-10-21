# Sécurité — Inscriptions-club

> Modèle de menace v1 et état des mesures. Sources : audits `security` (LOT-2 : 93/100 après corrections ; LOT-3 : `_work/reports/security-20261021-171457.md`),
> revue de code LOT-3 (`_work/reports/code-reviewer-20261021-213000.md`).
> Configuration : voir le README (sections « Configuration » et « Exploitation »).

## Périmètre et données

- Application web d'inscriptions aux activités d'un club associatif.
- **Responsables** (authentifiés) : e-mail, nom, mot de passe haché.
- **Participants** (anonymes, via le lien public `/a/<slug>`) : nom, e-mail du participant ou du parent, indicateur mineur, date d'inscription.
  Des **mineurs** sont inscrits par leur parent ou tuteur. Le RGPD s'applique.
- Le consentement est donné par le parent ou le tuteur lors de l'inscription. Il est tracé : version du texte, date.

## Menaces prises en compte

| Menace | Mesure en place |
|--------|-----------------|
| Devinette de mot de passe | 10 tentatives/min/IP ; 5 échecs/15 min/e-mail (seuls les échecs comptent). Mots de passe ≥ 12 car., ≤ 72 octets, valeurs triviales refusées. |
| Vol ou rejeu de session | Cookie `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS. Claim `tv` : le logout invalide toutes les sessions du compte. |
| CSRF | `Origin` strict (égal à `APP_BASE_URL`) sur les méthodes non sûres de `/api`, y compris `/api/public/*`. Sans `Origin` avec cookie `sid` : 403. `Sec-Fetch-Site: cross-site` : 403. |
| Injection SQL | Requêtes paramétrées uniquement. `PATCH` : liste blanche de colonnes. |
| Données non attendues | Schémas `zod` `strictObject` : champs inconnus rejetés (400). |
| Énumération de comptes responsables | Erreurs génériques au login. |
| Vol du lien de gestion | Jeton de 256 bits, stocké **haché** (SHA-256) seul. Réponse identique pour un jeton inconnu, invalide ou supprimé (404). Jamais dans les listes ni dans les logs. |
| Fuite de jetons dans les journaux | Masquage de `/r/<token>` et `/api/public/registrations/<token>` dans les logs pino (y compris segments de 43 caractères base64url). `referer` masqué. Erreurs 500 sans objet `pg` (qui peut contenir des données saisies). |
| Bots d'inscription | Honeypot `website` (réponse factice 201, rien d'enregistré). 20/min/IP sur l'inscription ; 10/10 min/IP+activité. 30/min/IP sur les accès aux jetons ; 60/min/IP sur les fiches publiques. |
| Inscriptions concurrentes (capacité dépassée) | `SELECT … FOR UPDATE` sur l'activité pour inscription, modification de capacité et suppression d'activité. Testé : 10 requêtes concurrentes pour 3 places → 3 créées, 7 refusées. |
| Inscription après le début | Refusée (409 `activity_closed`). |
| Accès abusif aux inscrits | Accès réservé aux responsables authentifiés. Chaque consultation est journalisée (utilisateur, activité, nombre). |
| Données de participants conservées trop longtemps | Purge automatique `RETENTION_MONTHS` (défaut 12) mois après la date de l'activité ; `npm run data:purge`. |
| Données résiduelles d'envoi | Suppression d'une inscription : anonymisation des envois liés (`email`, `error`, `registration_id` → NULL), dans la même transaction. Un trigger en base couvre aussi le SQL direct et la cascade. |
| Fuite de données par cache | `Cache-Control: no-store` sur `/api` et sur `/r/*`. `Referrer-Policy: no-referrer`. |
| XSS | Pas de `dangerouslySetInnerHTML` côté front. Échappement HTML des e-mails : prévu au LOT-4 (envoi groupé). |
| En-têtes navigateur | helmet ; HSTS et `upgrade-insecure-requests` selon HTTPS. |
| Mauvaise IP derrière un proxy | `TRUST_PROXY` explicite (défaut : aucun). `true` refusé. Les URL (`manage_url`, `public_url`) sont construites depuis `APP_BASE_URL`, jamais depuis `Host`. |
| Mot de passe initial faible | `user:create` génère un mot de passe (120 bits, CSPRNG), affiché une fois, jamais en argument ni dans les logs. |
| Dépendances vulnérables | `npm audit --audit-level=high` : 0 vulnérabilité à la dernière revue. Exécuté par la CI. |

## Données personnelles (RGPD)

- **Minimisation** : nom, e-mail, indicateur mineur, contact du parent. Pas de téléphone, pas d'adresse postale.
- **Consentement** : case non pré-cochée ; texte versionné (`CONSENT_TEXT_VERSION`). Un test échoue si le texte change sans changer de version.
  La version est liée à la durée de conservation (suffixe `-r<N>` si `RETENTION_MONTHS` ≠ 12).
- **Conservation** : `RETENTION_MONTHS` (défaut 12, entre 1 et 120) après la date de l'activité. Purge automatique au démarrage puis toutes les 24 h.
- **Suppression** : physique à la désinscription, au retrait par le responsable et à la purge. Une seule transaction, avec anonymisation des envois liés.
- **Contact RGPD** : `CONTACT_EMAIL`, facultatif. Jamais de repli sur `ADMIN_EMAIL` (identifiant de connexion, à ne pas exposer publiquement). Sans valeur, la page affiche un texte neutre.
- **Décisions** : consentement parental = inscription par le parent ; conservation 12 mois ; accès aux inscrits pour tous les responsables, journalisé. Voir `docs/CADRAGE.md` §8.

## Jeton de gestion

- Généré à l'inscription (256 bits, base64url), affiché **une seule fois** sur la page de confirmation, jamais stocké côté navigateur.
- Stocké en base sous forme de hash SHA-256. Une fuite de la base ne donne pas accès aux inscriptions.
- Permet de consulter et de supprimer sa propre inscription (`/r/<token>`).
- Le lien est absent des listes et des réponses de consultation.

## Anti-abus des routes publiques

| Route | Limite |
|-------|--------|
| Inscription (`POST`) | 20/min/IP ; 10/10 min/IP+activité |
| Accès au jeton (`GET`, `DELETE`) | 30/min/IP |
| Fiche publique | 60/min/IP |
| Honeypot | 201 factice, sans écriture ni journal de donnée |

Les compteurs sont **en mémoire** : ils sont remis à zéro au redémarrage et ne sont pas partagés entre instances. Acceptable en mono-instance.
Les limites sont réglables par `RATE_LIMIT_*` (voir README).

## Variables sensibles

| Variable | Exigence |
|----------|----------|
| `SESSION_SECRET` | ≥ 32 caractères, ≥ 10 caractères distincts. Jamais commité, jamais en argument. |
| `ADMIN_PASSWORD` | ≥ 12 caractères, ≤ 72 octets, non trivial. Compte initial seulement. |
| `POSTGRES_PASSWORD` (QUALIF/PROD) | Caractères sûrs pour une URL. |
| `SMTP_PASS` (à venir) | Hors dépôt. |

Les fichiers `.env`, `qualif.env` et `prod.env` ne sont jamais commités. Les fichiers `*.env.example` ne contiennent aucune valeur réelle.
`playwright.config.ts` contient des secrets **de test** pour le serveur local lancé par les E2E. Ils ne doivent jamais servir en QUALIF ou PROD.

## Points acceptés

- **Préfixe de cookie `__Host-` non appliqué** (I4) : le nom `sid` est figé par le contrat et les tests. `__Host-` exige `Secure`, inutilisable en QUALIF servi en http.
  Le risque visé (écrasement par un sous-domaine voisin) n'existe pas pour une application mono-hôte.
- **Verrouillage par e-mail (F-a)** : 5 échecs sur un e-mail connu bloquent aussi le titulaire légitime pendant 15 minutes. Compromis assumé.
- **Confirmation de doublon (409 `already_registered`)** : permet de sonder « ce nom est-il inscrit à cette activité ? ». Décision utilisateur. Atténué par les limites par IP+activité et par un message neutre.
- **Botnet d'inscription** (F2) : hors de portée du honeypot seul. Accepté. Options ultérieures : plafond global par activité et par heure, délai minimal de remplissage, CAPTCHA.
- **Consentement parental non vérifiable** (R3) : accepté. La version du texte et la date sont tracées.
- **Lien de gestion perdu** (R4) : le participant demande au responsable de le retirer. Pas de récupération automatique.
- **Droits identiques pour tous les responsables** (I-d) : choix du contrat v1, à revoir si le rôle doit différencier les actions.
- **Mot de passe affiché en sortie standard** par `user:create` : affichage unique voulu. Risque de journalisation si exécuté via CI ou `podman exec` journalisé.
- **Adresses IP en clair** dans les journaux d'authentification et d'inscription (I2) : rétention courte à appliquer côté exploitation (30 jours).
- **Caractères de contrôle Unicode** (ZWJ, ZWNJ) refusés dans les noms (I1) : choix prudent, à revoir si des utilisateurs s'en plaignent.
- **Compteurs de limites en mémoire** (I-a) : voir ci-dessus.

## Points à traiter

1. **Avant PROD — `TRUST_PROXY`** : renseigner le nombre réel de proxys (ex. `1`) derrière un reverse proxy TLS, et vérifier que le proxy
   écrase `X-Forwarded-For` entrant. Le serveur émet un avertissement au démarrage si la production est en HTTPS sans `TRUST_PROXY`.
   Les exemples `qualif.env.example` et `prod.env.example` ont encore `TRUST_PROXY=0`.
2. **Avant PROD — journaux du reverse proxy** : son journal d'accès contient `/r/<token>`. Masquer le chemin ou le jeton, et limiter la rétention à 30 jours au plus.
   Cette mesure relève du déploiement, pas de l'application.
3. **Avant PROD — rétention des IP** : 30 jours au plus dans les journaux de l'application.
4. **Réinitialisation de mot de passe** : aucune fonction en v1. À prévoir (`user:reset-password`), avec révocation des sessions du compte.
5. **Décision F-a** : garder la clé e-mail seule, ou passer à une clé `e-mail + IP`, ou assouplir le seuil (ex. 10 échecs).
6. **Droits des responsables** (RGPD) : à rouvrir si le rôle doit différencier les actions (suppression de données, export).
7. **LOT-4** : échappement HTML des e-mails avant l'envoi groupé ; vérification de la rétention des envois (`mailing_recipients`).

## Signalement

Tout problème de sécurité se signale au responsable du projet, sans ouvrir d'issue publique avec le détail de l'exploit.
