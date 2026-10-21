# E-mails groupés — configuration, délivrabilité, dépannage

> **Statut** : document rédigé avant l'implémentation complète du lot 4 (issue #7). Les points marqués **⚠** décrivent un
> comportement prévu ou décidé, qui n'est pas encore couvert par le contrat (`contracts/http-endpoints.md`, `contracts/models.md`).
> À relire à la livraison du lot.

Un responsable envoie un e-mail groupé aux inscrits d'une ou plusieurs activités. Un message part **par destinataire**,
sans copie cachée ni copie visible. L'historique des envois est consultable par le responsable.

## 1. Deux modes de transport

| Mode | Quand | Ce qui se passe |
|------|-------|-----------------|
| **stub** (défaut) | `SMTP_HOST` absent | Aucun e-mail n'est envoyé. Chaque destinataire est marqué `stubbed`. Un bandeau d'avertissement s'affiche dans l'écran d'envoi. |
| **smtp** | `SMTP_HOST` renseigné | Envoi réel via Nodemailer, sur le serveur SMTP du fournisseur. |

Le mode **stub** sert aux tests et à la QUALIF. Il ne doit **jamais** être utilisé pour une vraie communication : aucun parent ne reçoit rien.
Le bandeau et le statut `stubbed` ne doivent pas être présentés comme des envois réussis.

Le mode actif est visible par `GET /api/mail/status` : `{ "transport": "smtp|stub", "from": "…" }`.
En `NODE_ENV=production` sans SMTP, le serveur émet un avertissement au démarrage.

## 2. Variables

| Variable | Obligatoire | Rôle |
|----------|-------------|------|
| `SMTP_HOST` | non | Serveur SMTP. Vide = mode stub |
| `SMTP_PORT` | si SMTP | `587` (STARTTLS, recommandé) ou `465` (TLS direct) |
| `SMTP_SECURE` | non | `true` pour le port `465` (TLS dès la connexion) ; `false` pour `587` (STARTTLS) |
| `SMTP_USER` | non | Identifiant du compte SMTP. Si renseigné, le TLS est **exigé** |
| `SMTP_PASS` | si `SMTP_USER` | Mot de passe ou clé SMTP. **Jamais** journalisé, jamais renvoyé par l'API |
| `MAIL_FROM` | si SMTP | Expéditeur, par exemple `Club Judo <no-reply@mon-domaine.fr>`. Une seule adresse, sur un domaine que vous contrôlez |
| `CONTACT_EMAIL` | non | Adresse de contact affichée dans le pied de page (et en `List-Unsubscribe` si défini). Jamais `ADMIN_EMAIL` |

`SMTP_HOST` et `MAIL_FROM` vont ensemble. `SMTP_USER` et `SMTP_PASS` vont ensemble.
Une configuration incohérente **refuse le démarrage**.

Les timeouts SMTP sont de **10 secondes** au maximum. Le TLS est vérifié : un certificat invalide fait échouer l'envoi.

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

> Gmail limite fortement l'envoi automatisé (quota quotidien, réglages de sécurité du compte). Pour une liste de plus de quelques
> dizaines de personnes, préférez un fournisseur transactionnel.

### Port 587 ou 465 ?

- **587 + `SMTP_SECURE=false`** : la connexion démarre en clair puis passe en TLS (STARTTLS). Recommandé.
- **465 + `SMTP_SECURE=true`** : TLS dès la connexion. Le choix dépend de votre fournisseur.

Quel que soit le port, le serveur exige le TLS dès qu'un identifiant est fourni.

### Quotas

Chaque fournisseur impose un **quota journalier et par heure**. Un envoi qui dépasse ce quota est partiellement refusé.
Le statut de chaque destinataire le montre dans l'historique. Vérifiez le quota avant un envoi important.

Côté application ⚠ (limites prévues à la grille sécurité, à confirmer à la livraison) :

- un envoi est limité à **500 destinataires** ;
- un responsable ne peut lancer qu'un envoi à la fois, et une limite de fréquence s'applique aux envois ;
- le même envoi ne peut pas être relancé par double-clic.

## 4. Délivrabilité

Un message envoyé depuis le bon serveur peut quand même finir en spam si le domaine n'est pas configuré. Déclarez les trois enregistrements DNS
**sur le domaine de `MAIL_FROM`**. Les valeurs exactes sont fournies par votre fournisseur.

| Enregistrement | Type | Exemple (à adapter) | Rôle |
|----------------|------|---------------------|------|
| **SPF** | TXT sur `mon-domaine.fr` | `v=spf1 include:<serveur de votre fournisseur> -all` | Autorise le serveur SMTP à envoyer pour le domaine |
| **DKIM** | TXT sur `<sélecteur>._domainkey.mon-domaine.fr` | `v=DKIM1; k=rsa; p=<clé publique fournie>` | Signe les messages. Le fournisseur donne le sélecteur et la clé |
| **DMARC** | TXT sur `_dmarc.mon-domaine.fr` | `v=DMARC1; p=none; rua=mailto:dmarc@mon-domaine.fr` | Dit aux boîtes quoi faire des messages non authentifiés |

Conseils :

- Commencez DMARC avec `p=none` pour observer, puis passez à `p=quarantine` une fois les rapports propres.
- L'adresse `From` doit être sur le domaine que vous signez (**alignement**). N'utilisez pas une adresse d'un autre domaine.
- Le message contient toujours un en-tête `List-Unsubscribe` quand le désabonnement est disponible. ⚠
- Un message par destinataire : pas de `To` partagé, pas de `Bcc`. Cela évite d'exposer les autres destinataires et réduit le spam signalé.
- Un compte SMTP dédié, avec le minimum de droits, est recommandé.

## 5. Désabonnement

Chaque e-mail groupé contient un pied de page : motif de réception (inscription à l'activité concernée), contact (`CONTACT_EMAIL`),
et lien vers la page **Confidentialité** (`/confidentialite`).

⚠ **Désabonnement en un clic** (décision utilisateur, RFC 8058) : le message porte l'en-tête `List-Unsubscribe` et
`List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Un clic désinscrit le destinataire de l'activité concernée et supprime ses données
personnelles (ligne d'inscription supprimée, e-mail anonymisé dans l'historique). Ce mécanisme n'est **pas encore couvert par le contrat** :
le lien de gestion `/r/<token>` ne peut pas figurer dans l'e-mail, car le jeton n'est stocké que haché. Le mécanisme exact reste à définir (jeton dédié au désabonnement).

Ce qu'un parent voit dans un e-mail reçu :

- l'objet et le texte du responsable ;
- un pied de page avec le motif, le contact et le lien de désabonnement ;
- aucun nom ni e-mail d'un autre destinataire.

Si la désinscription est faite depuis le lien de gestion de l'inscription, l'historique affiche le destinataire comme désinscrit (`email` vide).

## 6. Dépannage

### Lire l'historique d'un envoi

Dans l'écran **Historique** du responsable, chaque destinataire a un statut :

| Statut | Signification |
|--------|---------------|
| `sent` | Accepté par le serveur SMTP |
| `failed` | Refusé ou en erreur (détail dans la colonne « erreur ») |
| `stubbed` | Mode stub : rien n'a été envoyé |

Le champ d'erreur contient un code grossier (`timeout`, `rejected`, `connection`, `auth`, `other`), sans adresse ni nom de serveur.

### Erreurs courantes

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| Démarrage refusé : « SMTP… » | `SMTP_HOST` sans `MAIL_FROM`, ou `SMTP_USER` sans `SMTP_PASS` | Compléter la configuration (voir section 2) |
| Statut `auth` | Identifiant ou mot de passe refusé | Vérifier `SMTP_USER` et `SMTP_PASS`. Pour Gmail, utiliser un mot de passe d'application |
| Statut `timeout` | Port bloqué par le réseau, mauvais serveur ou mauvais port | Tester le port 587 puis 465. Vérifier le pare-feu de l'hébergeur |
| Statut `connection` / erreur TLS | Certificat invalide, `SMTP_SECURE` incohérent avec le port | 465 ⇒ `SMTP_SECURE=true` ; 587 ⇒ `false`. Ne jamais désactiver la vérification du certificat |
| Statut `rejected` | Expéditeur non autorisé, quota dépassé, message rejeté | Vérifier SPF/DKIM du domaine et le quota du fournisseur |
| Tous les messages `stubbed` | `SMTP_HOST` absent | Renseigner la configuration SMTP et redémarrer |
| Messages reçus en spam | DKIM/DMARC absents ou désalignés | Revoir la section 4 |

### Test d'envoi réel

Procédure à réaliser à la livraison du lot 4 (GATE) :

1. Configurer SMTP en QUALIF, avec un domaine de test.
2. Créer une activité de test et une inscription avec une adresse qui vous appartient.
3. Envoyer un e-mail groupé depuis l'interface.
4. Vérifier que le message arrive, que l'en-tête `From` est le domaine attendu, et que l'authentification SPF/DKIM/DMARC passe (« afficher l'original » dans la messagerie).
5. Vérifier le statut `sent` dans l'historique.

Le test ne doit jamais utiliser les adresses de vrais participants.

## 7. Sécurité et RGPD

- ⚠ Les identifiants SMTP ne sont jamais journalisés ni renvoyés par l'API (`/api/mail/status` ne renvoie que le mode et l'expéditeur).
- ⚠ Les journaux ne contiennent ni adresse, ni corps de message, ni jeton.
- ⚠ Le contenu saisi par le responsable est échappé avant d'être inséré en HTML. Les en-têtes ne peuvent pas être injectés : l'expéditeur est toujours `MAIL_FROM`.
- L'historique des envois est purgé avec les inscriptions, selon `RETENTION_MONTHS` (défaut 12 mois). ⚠ à vérifier à la livraison.
- Voir [`SECURITY.md`](SECURITY.md) pour le modèle de menace complet.
