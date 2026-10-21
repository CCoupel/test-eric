# Publish — QUALIF (mecanisme : promote, sans registre) — adaptation projet

> Compagnon de `publish.qualif.template.md` : **prevaut sur le template** (variante « copie
> locale » uniquement — pas de registre d'images, pas de `docker login`/`push`, decision GATE 1.5).
> Variables `$REPO_ROOT`, `$DIR_VERSION`, `$VERSION`, `$BUILD_DIR` heritees de la Tache BUILD.

Reutilise tel quel le candidat produit par BUILD — zero rebuild (BORE, `agents/infra.md` §3).

## Artefact attendu de BUILD (packaging projet)

Dans la Tache BUILD (`agents/deploy.md`, etape 3), la commande generique `npm run build:qualif`
n'existe pas dans ce projet. Packaging a utiliser, depuis `$REPO_ROOT` :

```bash
npm ci && npm run build
tar -czf "$BUILD_DIR/app-$VERSION.tar.gz" \
  dist Dockerfile .dockerignore docker-compose.qualif.yml package.json package-lock.json
```

Le conteneur est construit plus tard (DEPLOY) a partir de ce contenu : l'image **emballe**
`dist/` sans recompiler (voir en-tete du `Dockerfile`).

## Variables attendues

Aucune.

```bash
# 1. Verification
ARTIFACT="$BUILD_DIR/app-$VERSION.tar.gz"
test -f "$ARTIFACT" || { echo "Aucun candidat trouve ($ARTIFACT) — executer /build d'abord"; exit 1; }
CONTENT=$(tar -tzf "$ARTIFACT" | sed 's|^\./||')   # liste capturee une fois (pas de SIGPIPE sous pipefail)
for f in dist/server/index.js dist/web/index.html Dockerfile .dockerignore docker-compose.qualif.yml package.json package-lock.json; do
  grep -qxF "$f" <<<"$CONTENT" || { echo "Candidat incomplet : $f absent de $ARTIFACT"; exit 1; }
done

# 2. Promotion — copie telle quelle (dossier SANS `a`, artefact AVEC `a`)
TARGET_DIR="$REPO_ROOT/build/qualif_v$DIR_VERSION"
mkdir -p "$TARGET_DIR"
cp "$ARTIFACT" "$TARGET_DIR/app-$VERSION.tar.gz"
( cd "$TARGET_DIR" && sha256sum "app-$VERSION.tar.gz" > "app-$VERSION.tar.gz.sha256" )

# 3. Notification
echo "Publication QUALIF terminee - $VERSION -> $TARGET_DIR/app-$VERSION.tar.gz"
```

## Echec

- Candidat manquant ou incomplet -> agent responsable `dev` (rejouer `/build`).
- Copie impossible (droits, disque plein) -> agent responsable `infra`.

```
SendMessage({ to: "main", content: "PUBLISH FAILED\nEnvironnement : QUALIF\nVersion  : v[X.Y.Z.a]\nProbleme : [candidat manquant | candidat incomplet | cible inaccessible]" })
```

## Rollback

Aucun etat distant (pas de merge, pas de tag, pas de registre) :

```bash
rm -f "$TARGET_DIR/app-$VERSION.tar.gz" "$TARGET_DIR/app-$VERSION.tar.gz.sha256"
```
