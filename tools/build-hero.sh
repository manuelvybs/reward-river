#!/usr/bin/env bash
# Rebuilds assets/models/hero.glb from the Meshy outputs in art-src/hero/:
#   geodesic reweight (+ rigid helmet, hips) -> merge 13 clips -> resample keys -> 2048 webp texture -> verify
set -euo pipefail
cd "$(dirname "$0")/.."
H=art-src/hero; M=$H/meshy; I=$H/meshy-idles
node tools/reweight-hero.mjs $M/rigged.glb $H/rigged-fixed.glb
node tools/merge-hero.mjs $H/rigged-fixed.glb $H/hero-full.glb \
  idle=$I/idle243.glb wave=$I/wave.glb \
  run=$M/run.glb walk=$M/walk.glb jump=$M/jump.glb throw=$M/throw.glb hang=$M/hang.glb swing=$M/swing.glb \
  fall=$M/fall.glb land=$M/land.glb sit=$M/sit.glb sitCheer=$M/sitCheer.glb cheer=$M/cheer.glb 2>/dev/null
npx gltf-transform resample $H/hero-full.glb $H/_a.glb >/dev/null
npx gltf-transform resize $H/_a.glb $H/_b.glb --width 2048 --height 2048 >/dev/null
npx gltf-transform webp $H/_b.glb assets/models/hero.glb --quality 90 >/dev/null
rm -f $H/_a.glb $H/_b.glb
node tools/inspect-glb.mjs assets/models/hero.glb --expect-clips idle,wave,run,walk,jump,throw,hang,swing,fall,land,sit,sitCheer,cheer | grep -E '"MB"|"tris"|"bones"'
