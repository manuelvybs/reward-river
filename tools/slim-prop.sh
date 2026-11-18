#!/usr/bin/env bash
# tools/slim-prop.sh <in.glb> <out.glb> [textureSize=1024]
# Static props only (never a skinned GLB: optimize breaks skinning). WebP texture + meshopt geometry.
set -euo pipefail
npx gltf-transform optimize "$1" "$2" --texture-compress webp --texture-size "${3:-1024}" --compress meshopt --simplify false >/dev/null
