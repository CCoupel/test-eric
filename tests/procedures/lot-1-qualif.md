# Procedure de Test — LOT-1 : deploiement QUALIF (GATE)

**Version** : 0.1.0.x (version candidate deployee)
**Date** : ____
**Testeur** : QA

## Prerequis

- [ ] Environnement : QUALIF (`docker compose -f docker-compose.qualif.yml up -d --build`)
- [ ] Donnees : base vide ; `.env` QUALIF renseigne (`APP_PORT`, `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_*`)
- [ ] Acces : shell sur l'hote QUALIF, navigateur

## Scenarios

### Scenario 1 — Sante de l'application

**Objectif** : verifier que `/health` repond 200 conformement au contrat.

| Etape | Action | Resultat Attendu | Resultat Obtenu | OK ? |
|-------|--------|-----------------|----------------|------|
| 1 | `docker compose -f docker-compose.qualif.yml ps` | Services `app` et `db` a l'etat `running`/`healthy` | | |
| 2 | `curl -i http://localhost:<APP_PORT>/health` | HTTP 200, JSON `{"status":"ok","version":"<version deployee>","db":"ok"}` | | |
| 3 | Comparer `version` a la version candidate (CHANGELOG / tag) | Identique | | |

**Verdict** : [ ] PASS  [ ] FAIL

---

### Scenario 2 — Page d'accueil

| Etape | Action | Resultat Attendu | Resultat Obtenu | OK ? |
|-------|--------|-----------------|----------------|------|
| 1 | Ouvrir `http://localhost:<APP_PORT>/` | Page chargee (200), contenu visible, version affichee | | |
| 2 | Ouvrir `http://localhost:<APP_PORT>/une-route-inconnue` | Page applicative (fallback SPA), pas d'erreur serveur | | |
| 3 | Console navigateur (F12) | Aucune erreur de chargement des assets | | |

**Verdict** : [ ] PASS  [ ] FAIL

---

### Scenario 3 — Resilience base de donnees

| Etape | Action | Resultat Attendu | Resultat Obtenu | OK ? |
|-------|--------|-----------------|----------------|------|
| 1 | `docker compose -f docker-compose.qualif.yml stop db` | Base arretee | | |
| 2 | `curl -i http://localhost:<APP_PORT>/health` | HTTP 503, `"db":"error"`, aucune chaine de connexion dans la reponse | | |
| 3 | `docker compose -f docker-compose.qualif.yml start db`, attendre ~10 s, relancer `curl` | HTTP 200 retabli sans redemarrer l'application | | |

**Verdict** : [ ] PASS  [ ] FAIL

---

### Scenario 4 — Logs sans donnees sensibles

| Etape | Action | Resultat Attendu | Resultat Obtenu | OK ? |
|-------|--------|-----------------|----------------|------|
| 1 | `docker compose -f docker-compose.qualif.yml logs app` | Logs de demarrage et de requetes presents | | |
| 2 | Rechercher `password`, `SESSION_SECRET`, `postgres://`, mot de passe `ADMIN_*` | Aucune occurrence en clair | | |

**Verdict** : [ ] PASS  [ ] FAIL

## Criteres de Validation

- [ ] Tous les scenarios passent
- [ ] `/health` 200 sur `http://localhost:<APP_PORT>` apres `/deploy qualif`
- [ ] Aucune donnee sensible dans les logs

## Notes QA

