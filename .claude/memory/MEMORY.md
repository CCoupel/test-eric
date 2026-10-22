# Memoire projet — Inscriptions-club

> Source de verite unique au demarrage d'une session (/start-session). Mise a jour par /end-session.

## Etat courant

- **Version** : `0.1.0.7` (dev) — milestone v0.1.0 **validé au GATE 4** (2026-10-22) : 8/8 issues fermées, milestone GitHub encore `open` (clôture au `/deploy prod`).
- **Branche** : `milestone/v0.1.0`. Une commit docs locale n'est pas encore poussée (`ahead 1`) ; la CI était verte sur le SHA précédent.
  `main` = `4555f43` (rien mergé). Branche `gh-pages` = site d'attente, https://ccoupel.github.io/test-eric/ ; worktree `MARKETING/`.
- **QUALIF** : `0.1.0.7` en marche sur http://localhost:8080 (podman, mode stub e-mail), `qualif.env` local.
- **Travail en cours** : aucun DEV.
- **Issues actives** : #9 (v0.2.0, participation répétée, enfants et adultes), prêt à planifier.
- **Docs de référence** : `docs/CADRAGE.md` (§8 décisions RGPD) ; `docs/SECURITY.md` (checklist PROD, 15 points) ; `docs/EMAIL.md` ; `.claude/agents/context/PROJECT_CONTEXT.md`.

## Regles critiques

- Poste local : **podman + podman-compose** (pas Docker Desktop) ; CI GitHub : docker ; `scripts/container-env.sh` détecte le moteur.
- Node du poste = binaire Windows : `WSLENV` pour `DATABASE_URL` (géré par `scripts/ci.sh`).
- Chaque agent utilise **sa propre base de test** (port dédié, worktree `.claude/worktrees/<nom>` pour la QA). Le global-setup fait `DROP SCHEMA`.
  Ne jamais lancer `scripts/ci.sh` dans le checkout partagé pendant que d'autres agents travaillent (`npm ci` vide `node_modules`).
- Checkout partagé : un `git add -A` embarque les fichiers des autres agents. Commiter par chemins explicites.
- `dev-backend` = **sécurité d'abord** (compagnon `.claude/agents/dev-backend.md`). Dispatcher `security` tôt (grille avant implémentation, audit au jalon) sur tout lot touchant auth, données personnelles ou e-mail.
- **GATE LOT** : chaque lot est présenté à l'utilisateur (QUALIF + rapport QA) avant de lancer le suivant. La dispense accordée pour le LOT-1 ne vaut que pour ce lot.
- Maquettes : les ouvrir dans Chrome pour l'utilisateur (`cmd.exe /c start chrome file:///C:/...` si l'extension est indisponible).
- Décisions produit v0.1.0 (ne pas re-poser) : mineurs inscrits par le parent (contact = parent) ; comptes responsables seedés ; SMTP + stub ; purge 12 mois ; accès aux inscrits = tous les responsables, journalisé ; 409 doublon accepté sous rate-limit ; désabonnement one-click = désinscription + suppression des données.
- Versionnement : `0.1.0.a` en dev ; PUBLISH PROD écrit `0.1.0` dans `package.json` et le lock avant le tag (`publish.prod.md`).

## Corrections de comportement

- Ne jamais généraliser une dispense de validation donnée « sur le lot » à tous les lots.
- Ne pas faire dépendre une suggestion de sécurité du `Host` (DNS rebinding) : comparer à `APP_BASE_URL` (+ alias loopback seulement si la base est loopback).
- Les credentials de test de `qualif.env` ne sont jamais recopiés dans le chat : indiquer la commande `grep` à l'utilisateur.

## Travail restant

1. **Avant `/deploy prod`** : trancher les décisions P1 à P7 (`.claude/agents/environments/deploy.prod.md` §Decisions) : hôte, domaine HTTPS, reverse proxy TLS et `TRUST_PROXY`, SMTP, DNS SPF/DKIM/DMARC, `CONTACT_EMAIL` et admin, sauvegardes.
2. **Vérifier avant PROD** : checklist de `docs/SECURITY.md` ; `TRUST_PROXY` renseigné dans `prod.env` (vide dans l'exemple) ; `stop_grace_period` appliqué.
3. **Pousser** `milestone/v0.1.0` (commits docs en avance) avant tout tag.
4. **Milestone v0.2.0** : issue #9 (participation répétée, enfants et adultes), à planifier.
5. **Site marketing** : `/marketing` pour le contenu (direction arts martiaux, public jeune), `docs/CADRAGE.md` §7.
6. **Décisions à rouvrir** : droits identiques pour tous les responsables (RGPD) ; décision F-a (verrouillage par e-mail) ; sémantique du one-click (mineur 1 de la revue LOT-4) ; réinitialisation de mot de passe (`user:reset-password`, à prévoir).
