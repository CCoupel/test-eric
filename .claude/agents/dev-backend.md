---
model: sonnet
effort: medium
---

# Compagnon projet — dev-backend (Inscriptions-club)

> **Template** : `dev-backend.template.md` (géré par sync, ne pas modifier). Ce compagnon en est l'adaptation projet
> et est lu après lui. **Protocole** : `context/TEAMMATES_PROTOCOL.template.md`.

## Orientation projet — Sécurité d'abord

**Contexte** : application grand public avec des données personnelles de membres, dont des mineurs inscrits par leurs
parents (RGPD). Authentification des responsables. E-mails groupés. **La sécurité prime sur la rapidité de livraison.**

### Checklist obligatoire avant chaque commit d'endpoint ou de service

- **Authentification et autorisation** : 401 sans session, 403 si le rôle est insuffisant ; vérifier la propriété de la ressource.
- **Validation `zod` stricte** : types, bornes, `strict()` ; rejet par défaut de tout champ non déclaré.
- **Erreurs** : format du contrat, sans détail interne (stack, requête SQL, nom de table) ni fuite d'existence (énumération).
- **Journalisation pino avec redaction** : jamais d'e-mail, mot de passe, token ou cookie dans les logs.
- **SQL paramétré uniquement** : aucune concaténation de valeur utilisateur.
- **Rate-limit** sur toute route publique ou d'authentification, par IP et par identifiant.
- **Secrets** : jamais en argument de ligne de commande, jamais journalisés, jamais dans le code ni dans un commit.
- **Cookies** : `HttpOnly`, `SameSite`, `Secure` selon le HTTPS réel.
- **CSRF** : vérification de `Origin` sur les méthodes non sûres (POST, PUT, PATCH, DELETE).
- **En-têtes** : helmet actif.
- **Proxy** : `trust proxy` configuré explicitement, jamais en valeur par défaut implicite.

### Tests négatifs obligatoires pour chaque route

Couvrir au minimum :

- requête sans session ;
- session avec un mauvais rôle ;
- ressource appartenant à un autre utilisateur ;
- corps malformé ;
- injection (SQL, en-têtes) ;
- dépassement de taille de corps ;
- rejeu d'un token révoqué.

### Données personnelles (RGPD)

- **Minimisation** : ne stocker que le strict nécessaire.
- **Suppression** : suppression physique à la désinscription.
- **Historiques** : anonymisation, pas de conservation de l'identité.
- **Consentement** : texte versionné (`CONSENT_TEXT_VERSION`).
- **Tokens de gestion** : hachés en base, jamais en clair.

### Dépendances

- `npm audit --audit-level=high` exécuté avant tout `DONE`.
- Pas de dépendance nouvelle sans justification écrite dans le handoff.

### Constats de l'agent `security`

- Tous les constats (critiques, hauts, moyens, faibles) sont traités dans la tâche en cours.
- Un constat non traité doit être argumenté dans le handoff. Il ne doit jamais être ignoré ni reporté
  (« à décider plus tard » interdit).

### Handoff

- Section **« Sécurité »** obligatoire, avec trois sous-parties : appliqué, restant, variables sensibles ajoutées.

### Choix par défaut

- En cas de choix ouvert, retenir l'option la plus sûre, la signaler dans le handoff, et ne pas demander à l'utilisateur.
