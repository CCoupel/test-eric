# Cadrage — Inscriptions-club

> Produit par /init-project (brief, 2026-10-21). Source des issues de base du milestone v0.1.0.

## Brief d'origine

**Problème** : les clubs associatifs gèrent les inscriptions aux activités (cours, sorties, événements) sur des feuilles, des mails et des messageries dispersés. Impossible de savoir qui participe à quoi, ni de contacter en une fois les participants d'une activité.

**Pourquoi non résolu** : les outils existants sont pensés pour la billetterie ou les grandes fédérations, trop lourds ou payants pour un club de bénévoles.

**Impact** : communications ratées, doublons, participants oubliés, temps bénévole perdu.

**Solution** : une interface web où un responsable crée des activités, où les membres s'y inscrivent, et depuis laquelle on envoie une communication groupée aux inscrits d'une ou plusieurs activités.

**Cas d'usage v1** :
1. Un responsable crée une activité (titre, date, lieu, places) et l'ouvre aux inscriptions.
2. Un participant s'inscrit ou se désinscrit à une activité depuis un lien.
3. Le responsable envoie un e-mail groupé aux inscrits d'une activité, avec historique.

**Hors périmètre v1** : paiement en ligne, application mobile, gestion des cotisations, SMS, multi-clubs.

**Différenciateur** : simple, gratuit, pensé pour un bénévole non technique.

**Utilisateurs** : responsables d'activité (bénévoles, peu techniques), participants (tout public).

**Commanditaire** : le bureau du club. Distribution : hébergement web, accès par lien.

**Contraintes** : RGPD (données personnelles des membres, consentement, suppression), budget nul, délai souhaité : v1 en quelques semaines. Risques : adoption par les bénévoles, délivrabilité des e-mails.

**Stack suggérée** : en mode SaaS, backend Node.js, frontend React, base PostgreSQL, CI GitHub Actions, un environnement QUALIF puis PROD.

## Fiche de cadrage

### 1. Problème
- Inscriptions dispersées (feuilles, mails, messageries) ; pas de vue « qui participe à quoi » ni de contact groupé [brief]
- Outils existants orientés billetterie/fédérations, lourds ou payants pour des bénévoles [brief]
- Impact : communications ratées, doublons, participants oubliés, temps bénévole perdu [brief]

### 2. Solution
- Interface web : le responsable crée des activités, les membres s'inscrivent, communication groupée aux inscrits [brief]
- Cas d'usage v1 : (1) créer et ouvrir une activité ; (2) s'inscrire/se désinscrire depuis un lien ; (3) e-mail groupé avec historique [brief]
- Hors périmètre v1 : paiement en ligne, application mobile, cotisations, SMS, multi-clubs [brief]
- Différenciateur : simple, gratuit, avec communication groupée par activité [precision]

#### Solutions existantes
| Solution | Type | Couvre (cas d'usage v1) | Limite | Modèle |
|---|---|---|---|---|
| [Paheko](https://linuxfr.org/forums/general-cherche-logiciel/posts/logiciel-pour-la-gestion-de-mon-club-de-foot) | Open source, auto-hébergeable | Inscriptions aux activités, rappels | Gestion complète (cotisations, compta), plus lourd ; e-mail ciblé par activité : à vérifier | Gratuit |
| [HelloAsso](https://www.helloasso.com/blog/?p=53184) | Gratuit (dons des associations) | Adhésion, billetterie, paiement | Centré sur le paiement, pas sur la communication par activité | Gratuit |
| [BenevolOps](https://www.capterra.fr/software/1101878/BenevolOps) | SaaS | Bénévoles et adhérents | Gratuit seulement jusqu'à 10 membres | Freemium |
| [AssoConnect](https://www.capterra.com/p/194611/AssoConnect/reviews?page=4) | SaaS | Plateforme complète (adhérents, mailing) | Payant | Payant |
| [TimeToSignUp](https://www.timetosignup.com/info/features) / [SignUp.com](https://blog.signup.com/signup-sheet) | Freemium | Feuilles d'inscription, notifications | Gratuit limité (1 feuille) ; pas de communication groupée par activité | Freemium |

Aucune solution n'est confirmée comme couvrant les 3 cas d'usage v1 gratuitement pour ce public ; Paheko est la plus proche mais plus large. [recherche]

### 3. Parties prenantes
- Utilisateurs : responsables d'activité (bénévoles peu techniques), participants tout public [brief]
- Commanditaire : le bureau du club [brief]
- Parties prenantes externes : aucune [precision]
- Distribution : hébergement web, accès par lien [brief]

### 4. Contraintes et risques
- Délai : v1 en quelques semaines ; budget nul [brief]
- Réglementaire : RGPD (consentement, suppression) [brief]
- Technique imposée : aucune, hors budget nul [brief]
- Risques : adoption par les bénévoles, délivrabilité des e-mails [brief]

### 5. Stack et architecture
- Backend Node.js, frontend React, PostgreSQL [brief]
- CI GitHub Actions ; environnements QUALIF puis PROD [brief]
- Déploiement Docker / Docker Compose [precision]
- Tests Vitest + Playwright ; sécurité : RGPD/données sensibles + authentification [precision]
- Pas de mobile, firmware, plugin ni agent générique [brief]

### 6. Conventions d'équipe
- Standard : branches milestone/* et feature, Conventional Commits, revue de code par agent, couverture min. 70 % [precision]

### 7. Direction du site marketing
- Esprit arts martiaux, tourné vers les jeunes (ton énergique, discipline, respect, progression) [precision, 2026-10-21]
- Cible du site : jeunes pratiquants et leurs parents, en plus des responsables d'activité [precision]
- À confirmer au cadrage `/marketing` : palette, typographie, visuels, vocabulaire (dojo, ceinture, cours...)
- Point d'attention : public de mineurs, donc consentement parental à prévoir côté RGPD (à trancher au cadrage de l'issue d'inscription, #6) [propose]

### 8. Décisions RGPD (inscriptions publiques, LOT-3)
- Consentement parental : un mineur est inscrit par son parent ou tuteur, qui donne le consentement ; le consentement est tracé (version du texte, date) [décision utilisateur, 2026-10-21]
- Conservation : inscriptions purgées `RETENTION_MONTHS` (défaut 12) mois après la date de l'activité [décision utilisateur, 2026-10-21]
- Accès aux inscrits : ouvert à tous les responsables, chaque consultation journalisée [décision utilisateur, 2026-10-21]
- Doublon d'inscription : réponse 409 conservée malgré le risque de sondage, atténuée par les limites de débit [décision utilisateur, 2026-10-21]
