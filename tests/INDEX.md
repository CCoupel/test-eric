# Index des tests

> Tests de specification ecrits par le test-writer, ranges en lots `<famille>/<theme>/<lot>/` ; statuts tenus par le CDP.
> Le chemin porte l'identite ; cet index ne porte que l'etat : une ligne par lot (chemin termine par `/`),
> plus des lignes fichier pour les exceptions (quarantaine). Lot sans ligne = `feature`.
> Convention : `context/COMMON.md` section 15. Statuts : `feature` | `regression` | `quarantaine`.
> Tags : `smoke`, `critical`, `slow`.

| Chemin | Niveau | Composant | Feature | Statut | Tags |
|--------|--------|-----------|---------|--------|------|
| e2e/socle/smoke/ | e2e | frontend | Smoke : accueil + /health | feature | smoke |
| tests/integration/socle/health/ | integration | backend | GET /health (DB up 200 / DB down 503) | feature | smoke |
| tests/integration/auth/login/ | integration | backend | Auth : login/me/logout, validation, rate-limit, securite (scope security) | feature | critical |
| tests/integration/activities/crud/ | integration | backend | Activites : creation, lecture, liste/filtre, modification, suppression | feature | |
| tests/integration/activities/etats/ | integration | backend | Activites : transitions d'etat, liste des inscrits | feature | |
| e2e/activites/creation/ | e2e | frontend | Connexion, creation et ouverture d'une activite, lien public | feature | critical |
| tests/integration/inscription/creation/ | integration | backend | Inscription publique : fiche, creation, validation, conflits 409, concurrence, rate-limit | feature | critical |
| tests/integration/inscription/gestion/ | integration | backend | Gestion par token, anonymisation RGPD, vue responsable, interactions LOT-2, securite/logs | feature | |
| tests/integration/inscription/retention/ | integration | backend | Purge RGPD `data:purge` (RETENTION_MONTHS) | feature | |
| e2e/inscription/parcours/ | e2e | frontend | Parcours parent : inscription, confirmation, desinscription | feature | critical |
| e2e/inscription/retrait-responsable/ | e2e | frontend | Retrait d'un inscrit par le responsable (droit a l'effacement) | feature | critical |
| tests/integration/mailing/envoi/ | integration | backend | Envoi groupe (stub), apercu, validation stricte, rate-limit, anti double-envoi | feature | |
| tests/integration/mailing/smtp/ | integration | backend | SMTP de test : succes/partiel/echec, en-tetes, HTML echappe, config au demarrage | feature | slow |
| tests/integration/mailing/robustesse/ | integration | backend | Un envoi a la fois, deconnexion client, recuperation des orphelins, plafonds | feature | slow |
| tests/integration/mailing/historique/ | integration | backend | Historique, detail, anonymisation, journaux sans donnees personnelles | feature | |
| tests/integration/mailing/confirmation/ | integration | backend | E-mail de confirmation d'inscription (non bloquant, jeton protege) | feature | slow |
| tests/integration/mailing/desabonnement/ | integration | backend | Desabonnement en un clic RFC 8058 (jeton unique, 404 uniformes) | feature | slow |
| tests/integration/mailing/retention/ | integration | backend | Purge des mailings anciens (RETENTION_MONTHS) | feature | |
| e2e/mailing/composer/ | e2e | frontend | Composer : apercu, envoi stub, historique, page de desabonnement inconnue | feature | critical |
