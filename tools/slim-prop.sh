#!/usr/bin/env bash
# tools/slim-prop.sh <in.glb> <out.glb> [textureSize=1024] [simplifyRatio]
# Static props only (never a skinned GLB: optimize breaks skinning). WebP texture + meshopt geometry;
# a simplify ratio (e.g. 0.45) for props instanced many times.
set -euo pipefail
if [ -n "${4:-}" ]; then SIMP=(--simplify true --simplify-ratio "$4" --simplify-error 0.004); else SIMP=(--simplify false); fi
npx gltf-transform optimize "$1" "$2" --texture-compress webp --texture-size "${3:-1024}" --compress meshopt "${SIMP[@]}" >/dev/null
