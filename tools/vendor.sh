#!/bin/sh
# Re-creates everything in vendor/ (run once when upgrading a library; the output is committed, so deploys need no build).
# Needs Node + npm and network access. Usage: sh tools/vendor.sh
set -e
THREE=0.186.1
MP=0.10.14
TMP=$(mktemp -d)
cd "$TMP"
npm pack three@$THREE @mediapipe/tasks-vision@$MP >/dev/null
mkdir three mp && tar xzf three-$THREE.tgz -C three && tar xzf mediapipe-tasks-vision-$MP.tgz -C mp
echo "export * from './three/package/build/three.module.js';" > entry.js
npx --yes esbuild@0.25.10 entry.js --bundle --format=esm --minify --legal-comments=eof --outfile=three.module.min.js
cd - >/dev/null
mkdir -p vendor/three vendor/mediapipe/wasm
cp "$TMP/three.module.min.js" vendor/three/three.module.min.js
cp "$TMP/three/package/LICENSE" vendor/three/LICENSE
cp "$TMP/mp/package/vision_bundle.mjs" vendor/mediapipe/vision_bundle.mjs
cp "$TMP"/mp/package/wasm/* vendor/mediapipe/wasm/
curl -fsSL -o vendor/mediapipe/pose_landmarker_lite.task \
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
printf 'three %s\n@mediapipe/tasks-vision %s\npose_landmarker_lite float16/1\n' "$THREE" "$MP" > vendor/VERSIONS.txt
rm -rf "$TMP"
echo "vendor/ updated"

# Display font (SIL OFL): Barlow Condensed 600/700/800, latin subset, from @fontsource.
# TMP2=$(mktemp -d); (cd "$TMP2" && npm pack @fontsource/barlow-condensed@5.3.0 >/dev/null && tar xzf *.tgz)
# for w in 600 700 800; do cp "$TMP2/package/files/barlow-condensed-latin-$w-normal.woff2" fonts/; done
