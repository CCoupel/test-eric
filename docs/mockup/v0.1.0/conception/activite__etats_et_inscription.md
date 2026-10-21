---
mockup:
  composant: activite
  feature: etats_et_inscription
  version: 0.1.0
  type: conception
  issue: "#5, #6"
  validee_le:
  complete: []
  remplace: []
---

# Machine à états — activité et inscription

## Activité (`activities.status`)

```mermaid
stateDiagram-v2
  [*] --> draft : POST /api/activities
  draft --> open : POST :id/open
  open --> closed : POST :id/close
  closed --> open : POST :id/open (réouverture)
  draft --> [*] : DELETE (toujours autorisé)
  closed --> [*] : DELETE (si 0 inscription)
  open --> [*] : DELETE (si 0 inscription)
```

| État | Lien public `/a/:slug` | Inscription | Visible responsable |
|------|------------------------|-------------|---------------------|
| draft | 404 | non | oui (badge « Brouillon ») |
| open | fiche + formulaire | oui, si places restantes | oui (badge « Ouverte », lien partageable) |
| closed | fiche « inscriptions fermées » | non (`409 activity_closed`) | oui (badge « Fermée ») |

## Inscription (`registrations`) — cycle de vie

```mermaid
stateDiagram-v2
  [*] --> active : POST /public/activities/:slug/registrations<br/>(open, place dispo, consent=true, non doublon)
  active --> [*] : DELETE /public/registrations/:token<br/>(ligne supprimée, mailing_recipients anonymisés)
  active --> [*] : activité supprimée (cascade)
```

Règles de refus à la création (ordre d'évaluation) : `404` slug/draft → `400` validation → `409 activity_closed`
→ `409 already_registered` → `409 activity_full` (vérification en transaction `FOR UPDATE`).

## Envoi groupé (`mailings.status`)

```mermaid
stateDiagram-v2
  [*] --> sending : POST /api/mailings (ligne créée avant le 1er envoi)
  sending --> sent : tous les destinataires OK / stubbed
  sending --> partial : au moins un échec, au moins un succès
  sending --> failed : tous en échec
```
