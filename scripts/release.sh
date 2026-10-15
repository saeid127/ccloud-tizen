#!/bin/sh
# Builds the release zip: the web app with template config.json
# Usage: scripts/release.sh   -> release/ccloud-tv-<version>.zip
set -e
cd "$(dirname "$0")/.."
VERSION="$(node -p 'require("./package.json").version')"
OUT="release/ccloud-tv"

# Empty API keys in the environment so custom keys stay out of the public release bundle
VITE_CCLOUD_API_KEY= VITE_API_KEY= npm run build

rm -rf release && mkdir -p "$OUT"
cp -R dist/. "$OUT/"
printf '{\n  "apiBase": "https://server-hi-speed-iran.info/api",\n  "apiKey": "",\n  "helperServers": [\n    "https://hostinnegar.com",\n    "https://windowsdiba.info"\n  ]\n}\n' > "$OUT/config.json"
(cd release && zip -qr "ccloud-tv-$VERSION.zip" ccloud-tv)
echo "release/ccloud-tv-$VERSION.zip"
