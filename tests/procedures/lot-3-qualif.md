# Procedure de Test — LOT-3 : inscription publique (QUALIF, GATE 4)

**Version** : 0.1.0.x   **Date** : ____   **Testeur** : QA

## Prerequis

- [ ] QUALIF deploye, `/health` 200 ; compte responsable disponible (`ADMIN_*`)
- [ ] Une activite **ouverte** (capacite 2) creee par le responsable ; son lien `/a/<slug>` note
- [ ] Un **smartphone** (ou emulation 375 px) et un navigateur desktop ; deux adresses e-mail de test

## Scenarios

### Scenario 1 — Parcours parent sur mobile (inscription d'un enfant)

| Etape | Action | Resultat Attendu | Resultat Obtenu | OK ? |
|-------|--------|-----------------|----------------|------|
| 1 | Ouvrir `/a/<slug>` sur mobile, sans etre connecte | Fiche lisible (titre, date, lieu, places restantes), pas de defilement horizontal | | |
| 2 | « J'inscris mon enfant (mineur) » : saisir enfant, parent, e-mail du parent | Champs lisibles, clavier e-mail propose | | |
| 3 | Valider SANS cocher le consentement | Refus, message clair | | |
| 4 | Cocher le consentement (texte RGPD lisible, lien politique de confidentialite), « Confirmer l'inscription » | Confirmation « Inscription confirmee » + lien de gestion `/r/<token>` | | |
| 5 | « Copier le lien » puis coller dans les notes | Lien complet copie | | |
| 6 | Cote responsable : detail de l'activite | Inscrit visible, indicateur mineur, parent en contact, « 1 / 2 » | | |

**Verdict** : [ ] PASS  [ ] FAIL

### Scenario 2 — Refus d'inscription

| Etape | Action | Resultat Attendu | Resultat Obtenu | OK ? |
|-------|--------|-----------------|----------------|------|
| 1 | Re-inscrire le meme enfant avec le meme e-mail | Message « deja inscrit » | | |
| 2 | Inscrire un second enfant (meme e-mail parent) | Confirmation | | |
| 3 | Une troisieme inscription (activite complete) | Message « complet », formulaire indisponible | | |
| 4 | Responsable : « Fermer les inscriptions » puis rouvrir `/a/<slug>` | Fiche « inscriptions fermees » | | |
| 5 | Ouvrir le lien d'une activite en brouillon | Page « introuvable » | | |

**Verdict** : [ ] PASS  [ ] FAIL

### Scenario 3 — Gestion et desinscription (RGPD)

| Etape | Action | Resultat Attendu | Resultat Obtenu | OK ? |
|-------|--------|-----------------|----------------|------|
| 1 | Ouvrir le lien `/r/<token>` | Resume de l'inscription uniquement (aucun autre inscrit) | | |
| 2 | Modifier un caractere du token | Page « introuvable » (identique a un lien inconnu) | | |
| 3 | « Me desinscrire et supprimer mes donnees » (confirmer) | Confirmation de suppression | | |
| 4 | Recharger `/r/<token>` | « Introuvable » | | |
| 5 | Responsable : liste des inscrits | Personne retiree, place liberee | | |

**Verdict** : [ ] PASS  [ ] FAIL

### Scenario 4 — Securite et donnees personnelles

| Etape | Action | Resultat Attendu | Resultat Obtenu | OK ? |
|-------|--------|-----------------|----------------|------|
| 1 | `logs app` apres les scenarios 1-3 | Ni e-mail, ni nom, ni token en clair ; acces du responsable aux inscrits journalise sans donnees personnelles | | |
| 2 | Lancer la purge : `npm run data:purge` avec `RETENTION_MONTHS` (ex. 12) en environnement | Seules les inscriptions de plus de N mois sont supprimees ; sortie sans donnee personnelle | | |
| 3 | 21 inscriptions en moins d'une minute depuis la meme IP | Refus « trop de requetes » des la 21e | | |

**Verdict** : [ ] PASS  [ ] FAIL

## Criteres de Validation

- [ ] Parcours parent mobile sans friction, textes en francais
- [ ] Aucune donnee personnelle dans les logs ; desinscription = suppression effective
- [ ] Aucune regression LOT-1 / LOT-2

## Notes QA

