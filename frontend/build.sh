#!/usr/bin/env bash
# Bouwt een Vikunja-image met Nederlandse datumherkenning in de webpagina.
#
#   ./build.sh                  bouwt vikunja-nl:<versie>
#   ./build.sh --tag v2.8.0     kies de Vikunja-versie (kies de versie die je nu draait)
#   ./build.sh --image naam:tag eigen naam voor het image
#   ./build.sh --check          voer eerst Vikunja's typecontrole en tests uit (Node 24+ en pnpm nodig)
#   ./build.sh --no-docker      alleen de broncode klaarzetten en aanpassen, niet bouwen
#
# Wat dit doet: Vikunja ophalen op de gekozen versie, onze bestanden toevoegen en een kleine
# patch toepassen op twee bestanden van Vikunja, en dan met Vikunja's eigen Dockerfile bouwen.

set -euo pipefail

TAG="v2.8.0"
IMAGE=""
CHECK=0
DOCKER=1

while [ $# -gt 0 ]; do
  case "$1" in
    --tag) TAG="${2:?--tag heeft een waarde nodig, bijvoorbeeld v2.8.0}"; shift 2 ;;
    --image) IMAGE="${2:?--image heeft een waarde nodig}"; shift 2 ;;
    --check) CHECK=1; shift ;;
    --no-docker) DOCKER=0; shift ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "Onbekende optie: $1 (probeer --help)" >&2; exit 2 ;;
  esac
done

IMAGE="${IMAGE:-vikunja-nl:$TAG}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/.build/vikunja-$TAG"

command -v git >/dev/null || { echo "git is nodig." >&2; exit 1; }
if [ "$DOCKER" = 1 ]; then
  command -v docker >/dev/null || { echo "docker is nodig (of gebruik --no-docker)." >&2; exit 1; }
fi

echo "==> Vikunja $TAG ophalen"
rm -rf "$SRC"
mkdir -p "$HERE/.build"
git clone --quiet --depth 1 --branch "$TAG" https://github.com/go-vikunja/vikunja.git "$SRC"

echo "==> Nederlandse datumherkenning toevoegen"
MODULE="$SRC/frontend/src/modules/quickAddMagic"
cp "$HERE/files/nlDatum.generated.js" "$HERE/files/nlDatum.generated.d.ts" \
   "$HERE/files/nlDatum.ts" "$HERE/files/nlDatum.test.ts" "$MODULE/"
cp "$HERE/files/NlDateHighlight.vue" "$SRC/frontend/src/components/tasks/partials/"

if ! git -C "$SRC" apply -p1 "$HERE/patches/nl-datum.patch"; then
  cat >&2 <<EOF

De patch past niet op Vikunja $TAG. De twee bestanden die we aanpassen zijn in die versie
veranderd. Pas de wijzigingen met de hand toe (ze zijn klein, zie frontend/README.md)
en maak de patch opnieuw met "git diff" in $SRC.
EOF
  exit 1
fi

if [ "$CHECK" = 1 ]; then
  command -v pnpm >/dev/null || { echo "--check heeft pnpm nodig (en Node 24+)." >&2; exit 1; }
  echo "==> typecontrole en tests van Vikunja"
  (
    cd "$SRC/frontend"
    pnpm install --frozen-lockfile
    pnpm typecheck
    pnpm exec vitest run src/modules/quickAddMagic
  )
fi

if [ "$DOCKER" = 1 ]; then
  echo "==> image bouwen: $IMAGE (dit duurt een paar minuten)"
  docker build --build-arg RELEASE_VERSION="$TAG" -t "$IMAGE" "$SRC"
  echo
  echo "Klaar: $IMAGE"
  echo "Gebruik dit image in plaats van vikunja/vikunja en start Vikunja opnieuw."
else
  echo
  echo "Klaar: de aangepaste broncode staat in $SRC"
fi
