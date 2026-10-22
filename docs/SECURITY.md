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
| Injection d'en-têtes e-mail | `From` toujours `MAIL_FROM` (validé au démarrage). Schémas `strictObject` : `from`, `to`, `cc`, `bcc`, `headers` refusés (400). Sujet sans caractère de contrôle, corps sans caractère de contrôle. `To` doit être une adresse simple. |
| Injection HTML dans les e-mails | Corps échappé (`& < > " '`) puis converti en paragraphes. Aucun HTML client conservé, aucune autolinkification. Tests : `<script>`, `<img onerror>`, `javascript:`, CRLF. |
| Fuite d'adresses entre destinataires | Un message par destinataire, `To` unique, pas de `Bcc` ni de `Cc`. L'aperçu ne renvoie que des compteurs. |
| Fuite de jetons ou d'adresses dans les journaux d'envoi | Logs d'événements sans adresse, sans corps, sans jeton, sans objet d'erreur Nodemailer (qui peut contenir l'hôte). Transport stub : sujet tronqué à 40 caractères seulement. |
| Vol des identifiants SMTP | `SMTP_PASS` jamais journalisé ni renvoyé. `/api/mail/status` ne renvoie que le mode et l'expéditeur. Transport SMTP seul (pas de sendmail ni shell). |
| Interception SMTP | TLS vérifié (`rejectUnauthorized`), TLS imposé dès qu'un identifiant est fourni (`SMTP_REQUIRE_TLS`). Timeouts 10 s. |
| Relais de spam via le formulaire public | Confirmations plafonnées (3/h par adresse, 300/h au total). Honeypot sans e-mail. Limites LOT-3 sur l'inscription. Pas de double opt-in (accepté). |
| Envois en rafale ou doublons | Un seul envoi à la fois (verrou). Anti-doublon : même envoi en moins de 5 minutes refusé. 500 destinataires maximum. 5 envois par 10 minutes et par responsable. |
| Désabonnement forgé ou rejoué | Jeton de 256 bits par destinataire et par message, stocké haché, usage unique. Réponse uniforme (404) si inconnu ou utilisé. Limite par IP dédiée (300/min). |
| Lien de gestion dans un e-mail groupé | Interdit : le jeton de gestion n'est stocké que haché, et un e-mail groupé ne le contient jamais. Seul l'e-mail de confirmation le contient, sans être journalisé ni stocké. |
| Dépannage et erreurs de transport | Erreurs réduites à un code grossier (`timeout`, `connection`, `auth`, `rejected`, `other`). Aucune adresse, aucun nom d'hôte dans l'historique. |
| Dépendances vulnérables | `npm audit --audit-level=high` : 0 vulnérabilité à la dernière revue. Exécuté par la CI. |

## E-mails groupés

- **Expéditeur** : toujours `MAIL_FROM`, adresse unique validée au démarrage. Aucun en-tête fourni par le client. Pas de `Reply-To` : le contact figure dans le pied de page.
- **Transport** : Nodemailer en mode SMTP uniquement, avec accès fichiers et URL désactivés, une connexion par message (pas de connexion persistante),
  version épinglée. Mode **stub** : aucun envoi, statut `stubbed`, signalé dans l'interface comme « simulé ».
- **Désabonnement en un clic** (décision utilisateur, RFC 8058) : **la désinscription supprime aussi les données personnelles** de l'adresse pour les activités de l'envoi.
  Le pied de page l'annonce : « Se désinscrire (supprime l'inscription et vos données) ». Un clic dans la messagerie ne demande pas de confirmation ; la page `/u/<token>` n'agit qu'après clic.
- **Confirmation d'inscription** : asynchrone, jamais bloquante. Le nom est tronqué à 60 caractères et échappé. Le jeton de gestion n'est ni journalisé ni stocké.
- **Historique** : les envois sont purgés avec les inscriptions (`RETENTION_MONTHS`). L'accès au détail d'un envoi est journalisé (`mailing_viewed`).

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
- **Désabonnement one-click destructif** : un clic dans la messagerie supprime l'inscription et les données. Décision utilisateur, confirmée.
  Le risque est qu'un utilisateur veuille seulement arrêter les e-mails. Mitigation : libellé explicite du pied de page et de la page de confidentialité.
- **Lien de désabonnement rattaché à une seule inscription** : si cette inscription est supprimée seule, le lien devient « introuvable » alors que d'autres inscriptions de l'adresse subsistent.
  Le parent peut utiliser son lien de gestion. Rattacher par adresse obligerait à conserver l'e-mail après anonymisation.
- **Pas de double opt-in** pour les confirmations d'inscription : une adresse saisie par un tiers reçoit la confirmation (plafonnée).
- **Un envoi par connexion SMTP** : coût en temps (plusieurs minutes pour 500 destinataires), pas de risque de sécurité. Reconsidérer si un fournisseur limite les connexions.
- **Envoi interrompu au redémarrage** : jamais repris, pour éviter les doublons. Les destinataires restants sont visibles en `failed` (`interrupted`).

## Points à traiter

1. **Avant PROD — `TRUST_PROXY`** : renseigner le nombre réel de proxys (ex. `1`) derrière un reverse proxy TLS, et vérifier que le proxy
   écrase `X-Forwarded-For` entrant. Le serveur émet un avertissement au démarrage si la production est en HTTPS sans `TRUST_PROXY`.
   Les exemples `qualif.env.example` et `prod.env.example` ont encore `TRUST_PROXY=0` (à corriger avant PROD).
2. **Avant PROD — journaux du reverse proxy** : son journal d'accès contient `/r/<token>`. Masquer le chemin ou le jeton, et limiter la rétention à 30 jours au plus.
   Cette mesure relève du déploiement, pas de l'application.
3. **Avant PROD — rétention des IP** : 30 jours au plus dans les journaux de l'application.
4. **Réinitialisation de mot de passe** : aucune fonction en v1. À prévoir (`user:reset-password`), avec révocation des sessions du compte.
5. **Décision F-a** : garder la clé e-mail seule, ou passer à une clé `e-mail + IP`, ou assouplir le seuil (ex. 10 échecs).
6. **Droits des responsables** (RGPD) : à rouvrir si le rôle doit différencier les actions (suppression de données, export).
7. **Checklist PROD** : voir la section dédiée ci-dessous (DKIM sur `List-Unsubscribe`, HTTPS, SPF/DMARC, `TRUST_PROXY`, journaux du proxy).

## Checklist PROD (e-mails et déploiement)

À valider avant la mise en production. Les points marqués **bloquant** ne doivent pas être ignorés.

| # | Contrôle | Bloquant |
|---|----------|----------|
| 1 | `APP_BASE_URL` en **HTTPS** : les en-têtes `List-Unsubscribe` et le lien de désabonnement l'exigent (RFC 8058). | oui |
| 2 | **DKIM** : le relais signe les en-têtes `List-Unsubscribe` et `List-Unsubscribe-Post`. Vérifier avec un message réel. | oui |
| 3 | **SPF** du domaine de `MAIL_FROM` inclut le serveur SMTP. **DMARC** publié (`p=none` puis `quarantine`). Alignement du `From`. | oui |
| 4 | `SMTP_REQUIRE_TLS` non désactivé ; `SMTP_USER` et `SMTP_PASS` dans un coffre de secrets, jamais dans le dépôt. Compte SMTP dédié, privilège minimal. | oui |
| 5 | `TRUST_PROXY` renseigné avec le nombre réel de proxys (ex. `1`). Les fichiers `qualif.env.example` et `prod.env.example` ont encore `TRUST_PROXY=0` : à corriger. Vérifier que le proxy écrase `X-Forwarded-For`. | oui |
| 6 | Journal d'accès du reverse proxy : masquer `/r/<token>`, `/u/<token>` et `/api/public/*/<token>`, rétention 30 jours au plus. | oui |
| 7 | Journaux de l'application : adresses IP en clair dans les événements d'authentification et d'inscription. Rétention 30 jours au plus. | non |
| 8 | `stop_grace_period: 60s` dans `docker-compose.prod.yml` pour laisser un envoi se clore à l'arrêt. | non |
| 9 | `CONTACT_EMAIL` renseigné (adresse de contact réelle, jamais `ADMIN_EMAIL`). | oui |
| 10 | `MAIL_FROM` validé au démarrage ; pas de mode stub en production (avertissement au démarrage à lire). | oui |
| 11 | `ADMIN_PASSWORD` non trivial, `SESSION_SECRET` ≥ 32 caractères. Le compte initial n'est pas le compte de production définitif. | oui |
| 12 | Mono-instance : deux instances en parallèle ne sont pas supportées (compteurs de limites et envois). À revoir avant tout passage multi-instances. | oui |
| 13 | Décision produit confirmée : désabonnement en un clic = désinscription et suppression des données. | oui |
| 14 | Secrets E2E de `playwright.config.ts` (valeurs de test) jamais utilisés hors du serveur local des tests. | oui |
| 15 | `npm audit --audit-level=high` sans vulnérabilité, avant chaque mise en production. | oui |

## Signalement

Tout problème de sécurité se signale au responsable du projet, sans ouvrir d'issue publique avec le détail de l'exploit.
