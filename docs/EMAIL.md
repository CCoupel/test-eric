# E-mails groupés — configuration, délivrabilité, désabonnement, dépannage

> Document aligné sur le contrat réel (`contracts/http-endpoints.md`, `contracts/models.md`) et sur le code du lot 4 (issue #7).
> En cas d'écart, le contrat et les tests font foi ; signaler l'écart au teamleader.

Un responsable envoie un e-mail groupé aux inscrits d'une ou plusieurs activités. **Un message part par destinataire** :
`To` contient une seule adresse, sans `Bcc` ni `Cc`. L'historique des envois reste consultable par le responsable.

## 1. Modes de transport

| Mode | Quand | Ce qui se passe |
|------|-------|-----------------|
| **stub** (défaut) | `SMTP_HOST` absent | Rien n'est envoyé. Chaque destinataire reçoit le statut `stubbed`. Un bandeau « simulé » s'affiche dans l'écran d'envoi. |
| **smtp** | `SMTP_HOST` et `MAIL_FROM` renseignés | Envoi réel via Nodemailer (version exacte épinglée), vers le serveur SMTP du fournisseur. |

- Le mode stub sert aux tests et à la QUALIF. **Aucun parent ne reçoit rien en stub.**
- Le stub ne journalise ni adresse ni corps de message : seulement le sujet tronqué à 40 caractères, dans l'événement `mail_stubbed`.
- Dans le compteur `sent_count` de l'historique, les envois simulés sont comptés avec les envois réels. Distinguez-les par le champ `transport` (`stub`) et par le bandeau.
- Le mode actif est visible par `GET /api/mail/status` : `{ "transport": "stub|smtp", "from": "…" }`.
- En `NODE_ENV=production` sans SMTP, le serveur émet un avertissement au démarrage : aucun e-mail ne part.

## 2. Variables

| Variable | Obligatoire | Défaut | Rôle |
|----------|-------------|--------|------|
| `SMTP_HOST` | non | vide = stub | Serveur SMTP. Va avec `MAIL_FROM` |
| `SMTP_PORT` | non | `587` (ou `465` si `SMTP_SECURE=true`) | Port du serveur |
| `SMTP_SECURE` | non | `false` | `true` pour le port `465` (TLS dès la connexion) ; `false` pour `587` (STARTTLS) |
| `SMTP_USER` / `SMTP_PASS` | non (ensemble) | — | Identifiants. Le TLS est alors **exigé**. `SMTP_PASS` n'est jamais journalisé ni renvoyé |
| `SMTP_REQUIRE_TLS` | non | `true` hors hôte local | TLS exigé. Mettre `false` seulement pour un relais local de développement (déconseillé ailleurs) |
| `MAIL_FROM` | si SMTP | — | Expéditeur : `adresse` ou `Nom <adresse>`. **Une seule adresse**, sans virgule, point-virgule, `< > " \ @` dans le nom. Validé au démarrage |
| `CONTACT_EMAIL` | non | vide | Adresse de contact du pied de page et de `List-Unsubscribe` (mailto). Une adresse simple. **Jamais** `ADMIN_EMAIL` |
| `MAILING_MAX_RECIPIENTS` | non | `500` | Plafond de destinataires par envoi (max 5000) |
| `MAILING_SYNC_MAX_RECIPIENTS` | non | `100` | Au-delà, l'envoi est pris en charge en tâche de fond (réponse `202`) |
| `RATE_LIMIT_MAILING_PER_USER_10MIN` | non | `5` | Envois par responsable et par 10 minutes |
| `RATE_LIMIT_CONFIRMATION_PER_ADDRESS_HOUR` | non | `3` | E-mails de confirmation d'inscription par adresse et par heure |
| `RATE_LIMIT_CONFIRMATION_GLOBAL_HOUR` | non | `300` | E-mails de confirmation d'inscription, au total, par heure |
| `RATE_LIMIT_UNSUBSCRIBE_PER_IP_MIN` | non | `300` | Accès au désabonnement par IP et par minute |

`SMTP_HOST` et `MAIL_FROM` vont ensemble. `SMTP_USER` et `SMTP_PASS` vont ensemble. Une configuration incohérente **refuse le démarrage**.

Les timeouts SMTP sont de **10 secondes** par message. Le certificat du serveur est vérifié : un certificat invalide fait échouer l'envoi.

## 3. Exemples de configuration

Vérifiez toujours les paramètres exacts dans la documentation du fournisseur : ils changent.

### Brevo (offre gratuite limitée)

```bash
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<identifiant SMTP de votre compte>
SMTP_PASS=<clé SMTP générée dans le compte>
MAIL_FROM=Mon Club <no-reply@mon-domaine.fr>
```

### OVH (hébergement mutualisé ou e-mail pro)

```bash
SMTP_HOST=ssl0.ovh.net          # ou le serveur indiqué dans votre espace client
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=<adresse e-mail du compte>
SMTP_PASS=<mot de passe du compte>
MAIL_FROM=Mon Club <contact@mon-domaine.fr>
```

Le domaine de `MAIL_FROM` doit être celui de l'hébergement, sinon l'envoi est souvent rejeté.

### Gmail ou Google Workspace (mot de passe d'application)

Gmail n'accepte pas le mot de passe du compte. Il faut :

1. activer la validation en deux étapes sur le compte ;
2. créer un **mot de passe d'application** dans les paramètres de sécurité du compte ;
3. utiliser ce mot de passe comme `SMTP_PASS`.

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<adresse Gmail complète>
SMTP_PASS=<mot de passe d'application (16 caractères)>
MAIL_FROM=<la même adresse que SMTP_USER>
```

> Gmail limite fortement l'envoi automatisé. Pour une liste de plus de quelques dizaines de personnes, préférez un fournisseur transactionnel.

### Port 587 ou 465 ?

- **587 + `SMTP_SECURE=false`** : la connexion démarre en clair puis passe en TLS (STARTTLS). Recommandé.
- **465 + `SMTP_SECURE=true`** : TLS dès la connexion. Le choix dépend de votre fournisseur.

Quand un identifiant est fourni, le TLS est exigé quel que soit le port.

### Quotas et débit

- Chaque fournisseur impose un **quota journalier et par heure**. Les destinataires refusés pour dépassement de quota apparaissent en `failed`. Vérifiez le quota avant un envoi important.
- Un message = une connexion SMTP (pas de connexion persistante). Un envoi de 500 destinataires prend donc plusieurs minutes.
- Un seul envoi à la fois dans l'application ; un responsable est limité à 5 envois par 10 minutes.

## 4. Envoyer un e-mail groupé (responsable)

1. Ouvrir **E-mails → Composer**.
2. Cocher une ou plusieurs activités. Le nombre d'inscrits s'affiche.
3. Vérifier l'**aperçu** : nombre de destinataires (adresses dédoublonnées). Aucune adresse n'est affichée dans l'aperçu.
4. Saisir l'objet et le message (texte brut, aucun HTML).
5. Envoyer. Le bouton est désactivé pendant l'envoi.

Le corps est affiché dans l'historique tel quel, dans un bloc de texte : aucun rendu HTML.

### Réponses et messages d'erreur

| Réponse | Sous-code | Signification |
|---------|-----------|---------------|
| `201` | — | Envoi terminé. Statut final : `sent`, `partial` ou `failed` |
| `202` | — | Plus de 100 destinataires : l'envoi continue en arrière-plan. L'écran interroge le détail jusqu'au statut final |
| `409` | `no_recipients` | Aucun destinataire pour les activités choisies |
| `409` | `too_many_recipients` | Plus de 500 destinataires (`MAILING_MAX_RECIPIENTS`). Réduire la sélection |
| `409` | `mailing_in_progress` | Un envoi est déjà en cours. Attendre sa fin |
| `409` | `duplicate_mailing` | Même objet, même message et mêmes activités, il y a moins de 5 minutes. Attendre avant de renvoyer |
| `429` | `rate_limited` | Plus de 5 envois en 10 minutes. Réessayer plus tard |

### Statuts par destinataire

| Statut | Signification |
|--------|---------------|
| `sent` | Accepté par le serveur SMTP |
| `failed` | Refusé ou en erreur. Le code d'erreur figure dans la colonne « erreur » |
| `stubbed` | Mode stub : rien n'a été envoyé |
| `failed` avec `interrupted` | Envoi interrompu (serveur arrêté ou disjoncteur). Voir section 7 |

Le code d'erreur est grossier : `timeout`, `connection`, `auth`, `rejected` ou `other`. Il ne contient ni adresse ni nom de serveur.
Si un destinataire a été désinscrit depuis l'envoi, l'historique affiche « désinscrit depuis » à la place de son adresse.

## 5. Désabonnement en un clic

### Ce qui est décidé

**Le désabonnement en un clic désinscrit la personne ET supprime ses données personnelles.** Ce n'est pas une simple désactivation des e-mails :
un clic supprime l'inscription de cette adresse aux activités concernées par l'envoi, et anonymise les envois liés.

### Ce que voit le destinataire

Chaque message groupé se termine par ce pied de page (texte brut et HTML) :

```
--
Vous recevez ce message car vous êtes inscrit(e) à : <activité(s)>.
Se désinscrire (supprime l'inscription et vos données) : <lien>
Confidentialité : <adresse du site>/confidentialite
Contact : <CONTACT_EMAIL>        (si renseigné)
```

Le lien mène à une page `/u/<token>` qui liste les activités concernées. **Rien n'est supprimé tant que le destinataire n'a pas confirmé sur cette page.**

### Désabonnement en un clic depuis le client de messagerie

Le message porte les en-têtes `List-Unsubscribe` (URL HTTPS et `mailto:` si `CONTACT_EMAIL` est défini) et
`List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058). Le bouton « Se désabonner » du client de messagerie
envoie directement la demande : **la suppression a lieu sans page de confirmation**.

Pour éviter les mauvaises surprises, la page de confidentialité et le pied de page annoncent clairement l'effet.

### Effet précis

- les inscriptions de **cette adresse** aux activités **de cet envoi** sont supprimées ;
- les données personnelles des envois liés sont effacées (e-mail et lien de désabonnement) ;
- le lien est à **usage unique** ;
- une adresse qui ne figure pas dans l'envoi n'est pas touchée.

### Limites connues

- Le lien est rattaché à **une** inscription de l'adresse. Si cette inscription est supprimée seule (par le responsable, ou par le parent via son lien de gestion `/r/<token>`),
  le lien devient « introuvable » (`404` uniforme), même si d'autres inscriptions de l'adresse subsistent. Le parent peut alors utiliser son lien de gestion.
- Le lien de gestion `/r/<token>` ne figure **pas** dans les e-mails groupés : le jeton n'est stocké que haché.

## 6. Confirmation d'inscription

Après une inscription réelle, un e-mail de confirmation est envoyé, de façon **asynchrone** : une panne SMTP ne bloque jamais l'inscription.
Il contient le titre de l'activité, le nom tronqué à 60 caractères, et le **lien de gestion** `/r/<token>`.

- Au-delà de **3 confirmations par heure et par adresse**, ou de **300 par heure** au total, l'inscription reste acceptée mais **aucun e-mail n'est envoyé**.
- Le token n'est ni journalisé ni stocké hors de sa forme hachée.
- Il n'y a pas de double opt-in : une adresse saisie par erreur (ou par un tiers) reçoit la confirmation. Ce risque est accepté, avec les limites ci-dessus.
- Le honeypot ne déclenche aucun e-mail.

## 7. Interruption et arrêt du serveur

- Un envoi **n'est jamais repris automatiquement** après un redémarrage, pour éviter les doublons.
- Au démarrage, les envois restés en `sending` sont clos en `partial` ou `failed` ; les destinataires non traités apparaissent en `failed` avec le code `interrupted`.
- Un **disjoncteur** interrompt l'envoi après 5 échecs consécutifs d'infrastructure (connexion, délai, authentification). Les destinataires restants sont marqués `interrupted`.
- À l'arrêt propre, le serveur attend la fin de l'envoi en cours.
- **Recommandation d'exploitation** : prévoir `stop_grace_period: 60s` dans le fichier compose (QUALIF et PROD), pour laisser le temps à l'envoi de se clore. Sinon, les envois en cours seront clos au redémarrage suivant.
  Ce point est à valider par l'infra avant PROD.
- Architecture **mono-instance** : deux instances en parallèle ne sont pas supportées pour l'envoi.

## 8. Délivrabilité

Un message envoyé depuis le bon serveur peut quand même finir en spam si le domaine n'est pas configuré. Déclarez les trois enregistrements DNS
**sur le domaine de `MAIL_FROM`**. Les valeurs exactes sont fournies par votre fournisseur.

| Enregistrement | Type | Exemple (à adapter) | Rôle |
|----------------|------|---------------------|------|
| **SPF** | TXT sur `mon-domaine.fr` | `v=spf1 include:<serveur de votre fournisseur> -all` | Autorise le serveur SMTP à envoyer pour le domaine |
| **DKIM** | TXT sur `<sélecteur>._domainkey.mon-domaine.fr` | `v=DKIM1; k=rsa; p=<clé publique fournie>` | Signe les messages. Le fournisseur donne le sélecteur et la clé |
| **DMARC** | TXT sur `_dmarc.mon-domaine.fr` | `v=DMARC1; p=none; rua=mailto:dmarc@mon-domaine.fr` | Dit aux boîtes quoi faire des messages non authentifiés |

Points de vigilance :

- **DKIM doit aussi signer les en-têtes `List-Unsubscribe` et `List-Unsubscribe-Post`** : c'est exigé par RFC 8058 pour le désabonnement en un clic. Vérifiez la configuration du relais.
- Le lien de désabonnement doit être en **HTTPS** : `APP_BASE_URL` doit donc être une URL `https://`.
- Commencez DMARC avec `p=none` pour observer, puis passez à `p=quarantine` une fois les rapports propres.
- L'adresse `From` doit être sur le domaine que vous signez (**alignement**).
- Un compte SMTP dédié, avec le minimum de droits, est recommandé.

## 9. Dépannage

### Erreurs courantes

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| Démarrage refusé : « SMTP… » ou « MAIL_FROM… » | `SMTP_HOST` sans `MAIL_FROM`, `SMTP_USER` sans `SMTP_PASS`, ou `MAIL_FROM` invalide (plusieurs adresses, caractères interdits) | Corriger la configuration (sections 2 et 3) |
| Statut `auth` | Identifiant ou mot de passe refusé | Vérifier `SMTP_USER` et `SMTP_PASS`. Pour Gmail, utiliser un mot de passe d'application |
| Statut `timeout` | Port bloqué par le réseau, mauvais serveur ou mauvais port | Tester le port 587 puis 465. Vérifier le pare-feu de l'hébergeur |
| Statut `connection`, erreur TLS | Certificat invalide, `SMTP_SECURE` incohérent avec le port | 465 ⇒ `SMTP_SECURE=true` ; 587 ⇒ `false`. Ne jamais désactiver la vérification du certificat |
| Statut `rejected` | Expéditeur non autorisé, quota dépassé, adresse refusée | Vérifier SPF/DKIM du domaine et le quota du fournisseur |
| Tous les messages `stubbed` | `SMTP_HOST` absent | Renseigner la configuration SMTP et redémarrer |
| Envoi `interrupted` | Arrêt du serveur ou disjoncteur (5 échecs consécutifs) | Vérifier la connexion SMTP. Relancer un envoi pour les destinataires concernés |
| Messages reçus en spam | DKIM/DMARC absents ou désalignés | Revoir la section 8 |

### Test d'envoi réel

Procédure à réaliser au GATE du lot 4 :

1. Configurer SMTP en QUALIF, avec un domaine de test.
2. Créer une activité de test et une inscription avec une adresse qui vous appartient.
3. Envoyer un e-mail groupé depuis l'interface.
4. Vérifier que le message arrive, que l'expéditeur est le domaine attendu, et que SPF/DKIM/DMARC passent (« afficher l'original » dans la messagerie).
5. Tester le désabonnement sur ce message : le clic doit supprimer l'inscription de test.
6. Vérifier le statut `sent` dans l'historique.

Le test ne doit jamais utiliser les adresses de vrais participants.

## 10. Sécurité et RGPD

- Les identifiants SMTP ne sont jamais journalisés ni renvoyés par l'API. Les erreurs du transport sont réduites à un code.
- Les journaux ne contiennent ni adresse, ni corps de message, ni jeton.
- L'expéditeur est toujours `MAIL_FROM`, validé au démarrage. Aucun en-tête n'est fourni par le client.
- Le corps saisi est échappé avant d'être inséré en HTML. Pas d'autolinkification, pas de HTML conservé.
- L'historique des envois est purgé avec les inscriptions, selon `RETENTION_MONTHS` (lots de 500, en cascade).
- Tous les responsables peuvent écrire à tous les inscrits (contrat v1) : chaque envoi et chaque consultation du détail sont journalisés (`mailing_sent`, `mailing_viewed`) sans donnée personnelle.
- Voir [`SECURITY.md`](SECURITY.md) pour le modèle de menace complet et la checklist de mise en production.
