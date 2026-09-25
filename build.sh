#!/bin/sh
# Assemble the Plugin and Content Manager archive.
#
#   ./build.sh                -> dist/planar-studio-<version>.zip
#   ./build.sh --install DIR  -> also copy the plugin into DIR (a KiCad
#                                plugins folder), for testing without the PCM
#
# The archive layout is what PCM expects: metadata.json and a listing icon at
# the root, everything the plugin actually runs under plugins/. KiCad unpacks
# plugins/ into <documents>/<version>/plugins/<identifier>/ and finds
# plugin.json there.
set -e

VERSION=$(sed -n 's/.*"version": "\([0-9][^"]*\)".*/\1/p' metadata.json | head -1)
NAME=planar-studio
OUT=dist
STAGE=$OUT/stage

rm -rf "$STAGE" "$OUT/$NAME-$VERSION.zip"
mkdir -p "$STAGE/plugins" "$STAGE/resources"

cp metadata.json "$STAGE/"
cp resources/icon.png "$STAGE/resources/icon.png"

# Everything the plugin needs at runtime, and nothing else. Tests, the dev
# scratch files and the screenshots stay out of the archive.
cp plugin.json requirements.txt ipc_entry.py LICENSE README.md "$STAGE/plugins/"
cp -R planar_studio "$STAGE/plugins/"
cp -R web "$STAGE/plugins/"
mkdir -p "$STAGE/plugins/docs"
cp docs/directional-antennas.md "$STAGE/plugins/docs/"
cp docs/winding-obstacles.md docs/publishing-motor-update.md docs/motor-families.png docs/motor-families.md docs/motor-shapes.png docs/motor-coils.md docs/design-tools.md docs/creators.md docs/creator-families.md docs/stack-load-antennas.md "$STAGE/plugins/docs/"
mkdir -p "$STAGE/plugins/resources"
cp resources/icon-light-24.png resources/icon-dark-24.png "$STAGE/plugins/resources/"

find "$STAGE" -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
find "$STAGE" -name '*.pyc' -delete 2>/dev/null || true
find "$STAGE" -name '.DS_Store' -delete 2>/dev/null || true

( cd "$STAGE" && zip -q -r "../$NAME-$VERSION.zip" . )

SIZE=$(wc -c < "$OUT/$NAME-$VERSION.zip" | tr -d ' ')
SHA=$(sha256sum "$OUT/$NAME-$VERSION.zip" 2>/dev/null | cut -d' ' -f1 \
      || shasum -a 256 "$OUT/$NAME-$VERSION.zip" | cut -d' ' -f1)
INSTALL=$(du -sk "$STAGE" | cut -f1)

printf 'wrote %s\n' "$OUT/$NAME-$VERSION.zip"
printf '  version      %s\n' "$VERSION"
printf '  size         %s bytes\n' "$SIZE"
printf '  sha256       %s\n' "$SHA"
printf '  install size %s KB\n' "$INSTALL"
printf '\nFor a hosted PCM repository, add download_url, download_sha256 (%s),\n' "$SHA"
printf 'download_size (%s) and install_size to the version entry.\n' "$SIZE"

if [ "$1" = "--install" ] && [ -n "$2" ]; then
  DEST="$2/planar-studio"
  rm -rf "$DEST"
  mkdir -p "$DEST"
  cp -R "$STAGE/plugins/." "$DEST/"
  printf '\ninstalled to %s\n' "$DEST"
  printf 'Restart KiCad, or Preferences -> Plugins -> Refresh.\n'
fi
