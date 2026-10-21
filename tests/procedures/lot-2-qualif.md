# Procedure de Test — LOT-2 : espace responsable (QUALIF)

**Version** : 0.1.0.x   **Date** : ____   **Testeur** : QA

## Prerequis

- [ ] Environnement : QUALIF deploye (`/deploy qualif`), `/health` 200 (voir `lot-1-qualif.md`)
- [ ] Compte responsable seede : `ADMIN_EMAIL` / `ADMIN_PASSWORD` du `.env` QUALIF
- [ ] Navigateur desktop ; URL de base `http://localhost:<APP_PORT>`

## Scenarios

### Scenario 1 — Connexion / deconnexion

| Etape | Action | Resultat Attendu | Resultat Obtenu | OK ? |
|-------|--------|-----------------|----------------|------|
| 1 | Ouvrir `/activities` sans etre connecte | Redirection vers `/login` | | |
| 2 | Saisir un mauvais mot de passe, valider | Message d'erreur generique, reste sur `/login` | | |
| 3 | Saisir un e-mail inconnu, valider | Meme message qu'a l'etape 2 | | |
| 4 | Saisir les bons identifiants | Arrivee sur `/activities` | | |
| 5 | Recharger la page (F5) | Toujours connecte | | |
| 6 | Cliquer « Se deconnecter » | Retour `/login` ; retour arriere du navigateur n'affiche plus les activites | | |

**Verdict** : [ ] PASS  [ ] FAIL

### Scenario 2 — Creation et cycle de vie d'une activite

| Etape | Action | Resultat Attendu | Resultat Obtenu | OK ? |
|-------|--------|-----------------|----------------|------|
| 1 | « + Nouvelle activite », valider avec le titre vide | Erreur de validation, pas de creation | | |
| 2 | Remplir titre, date, lieu, places = 20, description ; « Enregistrer (brouillon) » | Detail affiche, badge « Brouillon », pas de lien partageable | | |
| 3 | « Ouvrir aux inscriptions » | Badge « Ouverte », lien `/a/<12 caracteres>` affiche, « Copier » le place dans le presse-papiers | | |
| 4 | « Modifier » : changer le titre, enregistrer | Titre mis a jour, statut inchange | | |
| 5 | « Fermer les inscriptions » | Badge « Fermee » | | |
| 6 | « Rouvrir » | Badge « Ouverte », meme lien public | | |
| 7 | Retour a la liste ; filtrer par statut | Liste filtree correctement, tri par date decroissante | | |
| 8 | Section « Inscrits » | « 0 / 20 (20 places restantes) », aucun inscrit | | |
| 9 | « Supprimer » (activite sans inscription), confirmer | Retour a la liste, activite absente | | |

**Verdict** : [ ] PASS  [ ] FAIL

### Scenario 3 — Securite

| Etape | Action | Resultat Attendu | Resultat Obtenu | OK ? |
|-------|--------|-----------------|----------------|------|
| 1 | Devtools > Application > Cookies | Cookie `sid` : HttpOnly, SameSite=Lax (Secure si HTTPS) | | |
| 2 | Supprimer le cookie `sid`, recharger `/activities` | Redirection `/login` | | |
| 3 | 11 tentatives de connexion fausses en moins d'une minute | Message « trop de tentatives » (429) a partir de la 11e | | |
| 4 | Logs du conteneur (`logs app`) | Ni mot de passe ni cookie en clair | | |

**Verdict** : [ ] PASS  [ ] FAIL

## Criteres de Validation

- [ ] Les 3 scenarios passent
- [ ] Messages d'erreur lisibles, libelles identiques aux maquettes
- [ ] Aucune regression du LOT-1 (`/health` 200)

## Notes QA

