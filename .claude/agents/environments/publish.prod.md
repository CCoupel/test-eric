# Publish — PROD (mecanisme : rebuild-ci) — adaptation projet

> Compagnon de `publish.prod.template.md` : **prevaut sur le template**. Charge par
> `agents/deploy.md`, Tache PUBLISH PROD, etape [2. MECANISME]. Pipeline :
> `.github/workflows/release.yml` (declenche par le tag `vX.Y.Z`).
> **N'est execute que sur ordre explicite de l'utilisateur (`/publish prod` / `/deploy prod`).**

PUBLISH PROD = version officielle `X.Y.Z` → merge dans `main` → tag `vX.Y.Z` → la CI reconstruit
depuis ce commit fige (meme `scripts/ci.sh`), cree la GitHub Release avec le livrable
`inscriptions-club-X.Y.Z.tar.gz` + `.sha256` → telechargement et verification locale.
**Aucun build local** (BORE, mecanisme « rebuild deterministe »).

## Prerequis (confirmes par le teamleader avant l'ordre)

- QUALIF validee (GATE 4) sur la derniere version `X.Y.Z.a` publiee.
- `CHANGELOG.md` contient la section `## [X.Y.Z]` (DOC FINALIZE du doc-updater) : `release.yml`
  en extrait les notes de la Release (sinon notes generees + avertissement).
- Checklist pre-PROD de `deploy.prod.md` revue avec l'utilisateur (points bloquants).

## Variables attendues

Aucune dans `.env`/`prod.env` : `git`/`gh` utilisent l'authentification ambiante (`gh auth status`).
La CI n'utilise que `GITHUB_TOKEN` (aucun secret de depot a creer).

```bash
set -uo pipefail
REPO_ROOT=$(git rev-parse --show-toplevel); cd "$REPO_ROOT" || exit 1
MILESTONE_BRANCH=$(git branch --show-current)            # ex. milestone/v0.1.0 (HEAD du teamleader)
case "$MILESTONE_BRANCH" in milestone/v*) ;; *) echo "HEAD hors branche milestone ($MILESTONE_BRANCH) — STOP"; exit 1 ;; esac
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "Arbre de travail non propre — STOP"; exit 1; }

# 1. Version officielle : X.Y.Z.a -> X.Y.Z dans package.json ET package-lock.json
DEV_VERSION=$(node -p "require('./package.json').version")   # ex. 0.1.0.7
VERSION=$(echo "$DEV_VERSION" | cut -d. -f1-3)                 # ex. 0.1.0
[ "v$VERSION" = "${MILESTONE_BRANCH#milestone/}" ] || { echo "Version $VERSION != milestone $MILESTONE_BRANCH — STOP"; exit 1; }
grep -qE "^## \[?v?$VERSION\]?( |$)" CHANGELOG.md || { echo "CHANGELOG.md sans section $VERSION — STOP (doc-updater)"; exit 1; }
# Reecriture JSON en conservant la mise en forme d'origine (package.json compact, lock indente)
node -e '
const fs = require("fs"); const v = process.argv[1];
for (const f of ["package.json", "package-lock.json"]) {
  const s = fs.readFileSync(f, "utf8"); const j = JSON.parse(s);
  j.version = v; if (j.packages && j.packages[""]) j.packages[""].version = v;
  const ind = (/\n([ \t]+)"/.exec(s) || [, ""])[1];
  fs.writeFileSync(f, JSON.stringify(j, null, ind) + (s.endsWith("\n") ? "\n" : ""));
}' "$VERSION"
[ "$(node -p "const l=require('./package-lock.json');[require('./package.json').version,l.version,l.packages[''].version].join(' ')")" = "$VERSION $VERSION $VERSION" ] \
  || { echo "Versions incoherentes apres reecriture — STOP"; git checkout -- package.json package-lock.json; exit 1; }
git add package.json package-lock.json
git commit -m "chore(version): Release $VERSION"

# 2. BARRIERE — pre-validation verte sur le SHA exact a merger (un tag ne sert jamais de test)
git push origin "$MILESTONE_BRANCH"
SHA=$(git rev-parse HEAD)
RUN_ID=""
for _ in $(seq 30); do      # le push declenche ci-branch.yml (filtre milestone/**)
  RUN_ID=$(gh run list --workflow ci-branch.yml --commit "$SHA" --json databaseId --jq '.[0].databaseId // empty')
  [ -n "$RUN_ID" ] && break; sleep 10
done
[ -n "$RUN_ID" ] || { gh workflow run ci-branch.yml --ref "$MILESTONE_BRANCH"; sleep 15
  RUN_ID=$(gh run list --workflow ci-branch.yml --commit "$SHA" --json databaseId --jq '.[0].databaseId // empty'); }
[ -n "$RUN_ID" ] && gh run watch "$RUN_ID" --exit-status \
  || { echo "Pre-validation ci-branch non verte sur $SHA (run ${RUN_ID:-absent}) — PUBLISH FAILED, ni merge ni tag"; exit 1; }

# 3. Merge dans main (worktree detache : le HEAD du checkout principal ne bouge pas)
REL=.claude/worktrees/release
git fetch origin main
git worktree add --detach "$REL" origin/main
git -C "$REL" merge --no-ff "$MILESTONE_BRANCH" -m "Release v$VERSION" \
  || { git -C "$REL" merge --abort; git worktree remove --force "$REL"; echo "Conflit de merge — STOP (teamleader)"; exit 1; }
git -C "$REL" push origin HEAD:main

# 4. Tag officiel sur le commit de merge — declenche release.yml
git -C "$REL" tag -a "v$VERSION" -m "Release v$VERSION"
git push origin "v$VERSION"
git worktree remove "$REL"

# 5. Suivi du run release.yml de CE tag (pas « le dernier run » : evite de suivre un autre workflow)
RUN_ID=""
for _ in $(seq 30); do
  RUN_ID=$(gh run list --workflow release.yml --event push --json databaseId,headBranch \
           --jq ".[] | select(.headBranch==\"v$VERSION\") | .databaseId" | head -1)
  [ -n "$RUN_ID" ] && break; sleep 10
done
[ -n "$RUN_ID" ] || { echo "Aucun run release.yml pour v$VERSION — categorie INFRA"; exit 1; }
gh run watch "$RUN_ID" --exit-status
CI_STATUS=$?

# 6. Livrable : telechargement + verification sha256 (consomme par DEPLOY PROD)
if [ "$CI_STATUS" -eq 0 ]; then
  PROD_DIR="$REPO_ROOT/build/prod_v$VERSION"; mkdir -p "$PROD_DIR"
  gh release download "v$VERSION" -p "inscriptions-club-$VERSION.tar.gz*" -D "$PROD_DIR" --clobber
  ( cd "$PROD_DIR" && sha256sum -c "inscriptions-club-$VERSION.tar.gz.sha256" ) || CI_STATUS=1
fi
```

**CI_STATUS = 0 → Notification.** **CI_STATUS ≠ 0 → Echec ci-dessous.**

```bash
# 7. Notification
echo "Publication PROD terminee - v$VERSION - $(gh release view "v$VERSION" --json url --jq .url)"
echo "Livrable : build/prod_v$VERSION/inscriptions-club-$VERSION.tar.gz (sha256 OK)"
```

## Echec

`gh run view "$RUN_ID" --log-failed`, puis classification du template (CODE → `dev`, FLAKY → `qa`,
CONFIG/INFRA → `infra`) et rapport `PUBLISH FAILED` au teamleader. Jamais de re-tag pour
« retester » ; correction sur la branche milestone, nouvelle pre-validation, puis Rollback ci-dessous
avant de rejouer `/publish prod`. Un FLAKY se relance une seule fois (`gh run rerun "$RUN_ID" --failed`).

## Rollback (echec apres merge/tag)

```bash
# Supprimer la Release creee par la CI (si elle existe) et le tag, local + remote
gh release delete "v$VERSION" --yes --cleanup-tag 2>/dev/null || true
git tag -d "v$VERSION" 2>/dev/null || true
git push origin --delete "v$VERSION" 2>/dev/null || true
# Annuler le merge sur main (worktree detache, jamais de checkout dans le checkout principal)
git fetch origin main && git worktree add --detach .claude/worktrees/rollback origin/main
git -C .claude/worktrees/rollback revert -m 1 HEAD --no-edit     # HEAD = commit de merge --no-ff
git -C .claude/worktrees/rollback push origin HEAD:main
git worktree remove .claude/worktrees/rollback
rm -rf "build/prod_v$VERSION"
# Revenir a la version de dev X.Y.Z.a sur la branche milestone (sinon le prochain /build lirait
# une version a 3 composantes) — revert du commit de version, HEAD inchange :
VCOMMIT=$(git log -1 --format=%H --grep="^chore(version): Release $VERSION\$")
[ -n "$VCOMMIT" ] && git revert --no-edit "$VCOMMIT" && git push origin "$MILESTONE_BRANCH"
```

> Apres un revert de merge, un nouveau merge de la meme branche n'apporte pas les commits deja
> revertes : avant de rejouer `/publish prod`, faire un « revert du revert » sur `main` (ou
> remonter au teamleader) — ne jamais forcer `main`.
