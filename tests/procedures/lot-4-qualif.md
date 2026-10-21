# Procedure de Test — LOT-4 : e-mails groupes (QUALIF, GATE 4)

**Version** : 0.1.0.x   **Date** : ____   **Testeur** : QA (avec l'utilisateur pour le scenario SMTP reel)

## Prerequis

- [ ] QUALIF deploye, `/health` 200 ; compte responsable ; au moins une activite ouverte avec 3 inscrits (adresses de test que vous controlez, dont 1 sur un domaine different)
- [ ] Scenarios 1-2 : `SMTP_HOST` vide (mode stub). Scenarios 3-5 : SMTP reel configure par l'utilisateur (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`/`SMTP_PASS`, `MAIL_FROM`, `CONTACT_EMAIL`) — **seul test de delivrabilite reelle**
- [ ] DNS du domaine de `MAIL_FROM` : SPF incluant le relais, DKIM actif, DMARC publie (voir README / `deploy.qualif.md`)

## Scenarios

### Scenario 1 — Envoi en mode stub (SMTP non configure)

| Etape | Action | Resultat Attendu | Resultat Obtenu | OK ? |
|-------|--------|-----------------|----------------|------|
| 1 | Ouvrir `/mailings/new` | Bandeau « mode simule : aucun e-mail ne part » visible | | |
| 2 | Cocher l'activite | Apercu : nombre de destinataires correct (dedoublonne, sans adresses) ; bouton « Envoyer a N destinataires » | | |
| 3 | Objet + message saisis, envoyer ; bouton desactive pendant l'envoi | Detail de l'envoi, badge « Simule », N destinataires `stubbed` | | |
| 4 | Rejouer exactement le meme envoi | Refuse (envoi identique recent) | | |
| 5 | `logs app` | Ni adresse, ni corps ; evenement d'envoi avec compteurs | | |

**Verdict** : [ ] PASS  [ ] FAIL

### Scenario 2 — Historique

| Etape | Action | Resultat Attendu | Resultat Obtenu | OK ? |
|-------|--------|-----------------|----------------|------|
| 1 | `/mailings` | Liste triee du plus recent au plus ancien, sans corps | | |
| 2 | Ouvrir un envoi | Message, destinataires avec statut/detail | | |
| 3 | Desinscrire un destinataire (lien `/r/...`), rouvrir le detail | Son adresse a disparu (« desinscrit »), ligne conservee | | |

**Verdict** : [ ] PASS  [ ] FAIL

### Scenario 3 — Envoi reel (delivrabilite)

| Etape | Action | Resultat Attendu | Resultat Obtenu | OK ? |
|-------|--------|-----------------|----------------|------|
| 1 | Bandeau stub ? | Absent ; `/api/mail/status` : `smtp` + expediteur seulement | | |
| 2 | Envoyer a 3 inscrits de test (dont 1 chez un autre fournisseur) | Statut « Envoye 3/3 » | | |
| 3 | Boites de reception ET courrier indesirable | Message recu, **hors spam** ; une seule adresse en « A » (pas de Cc/Bcc, pas d'autres destinataires visibles) | | |
| 4 | Afficher les en-tetes d'origine | `From` = `MAIL_FROM`, SPF/DKIM/DMARC = pass, `List-Unsubscribe` + `List-Unsubscribe-Post` presents | | |
| 5 | Lire le corps | Texte lisible (accents), pied de page : motif de reception, activite, lien de desinscription, confidentialite, contact | | |
| 6 | Envoyer un message contenant `<script>` et `http://exemple.test` | Affiche tel quel en texte, aucun lien actif ajoute, aucun script | | |

**Verdict** : [ ] PASS  [ ] FAIL

### Scenario 4 — Echec partiel

| Etape | Action | Resultat Attendu | Resultat Obtenu | OK ? |
|-------|--------|-----------------|----------------|------|
| 1 | Ajouter un inscrit avec une adresse inexistante sur un domaine reel, envoyer | Statut « Partiel », ligne en echec avec **code** (rejete/connexion…) sans adresse ni hote SMTP dans le detail | | |

**Verdict** : [ ] PASS  [ ] FAIL

### Scenario 5 — Confirmation d'inscription et desinscription en un clic

| Etape | Action | Resultat Attendu | Resultat Obtenu | OK ? |
|-------|--------|-----------------|----------------|------|
| 1 | S'inscrire via `/a/<slug>` avec une adresse de test | E-mail de confirmation recu avec le lien de gestion `/r/<jeton>` fonctionnel | | |
| 2 | Couper le SMTP (mauvais port) puis s'inscrire | Inscription creee, page de confirmation avec le lien, aucune erreur | | |
| 3 | Dans un message groupe recu : cliquer le lien de pied de page | Page de desinscription (sans effet tant qu'on ne confirme pas) | | |
| 4 | Confirmer | Inscription supprimee, message de confirmation ; rouvrir le lien : « introuvable » | | |
| 5 | Dans le client de messagerie (Gmail/Outlook) : bouton « Se desabonner » natif | Desinscription effective (POST one-click) | | |
| 6 | Responsable : liste des inscrits et detail de l'envoi | Personne retiree, adresse effacee de l'historique | | |

**Verdict** : [ ] PASS  [ ] FAIL

### Scenario 6 — Abus et robustesse

| Etape | Action | Resultat Attendu | Resultat Obtenu | OK ? |
|-------|--------|-----------------|----------------|------|
| 1 | Lancer un envoi puis un second pendant le premier | Second refuse (« envoi deja en cours ») | | |
| 2 | Lancer un envoi, fermer l'onglet | Statut final correct dans l'historique | | |
| 3 | `docker compose restart app` pendant un envoi | Au redemarrage : envoi en echec/partiel, **aucun renvoi automatique** | | |
| 4 | Purge : `npm run data:purge` avec `RETENTION_MONTHS` bas | Mailings anciens supprimes, sortie sans donnee personnelle | | |

**Verdict** : [ ] PASS  [ ] FAIL

## Criteres de Validation

- [ ] Delivrabilite reelle validee (reception hors spam, SPF/DKIM/DMARC pass)
- [ ] Aucune adresse, corps, jeton ni secret SMTP dans les logs
- [ ] Aucune regression LOT-1 a LOT-3

## Notes QA

