// Reward River — painted surfaces: textures, the terrain material, backdrops and sprite atlases.
// Everything is optional: a texture that fails to load leaves the flat palette colour in place.
import * as THREE from 'three';

const TEXTURES = ['moss', 'path', 'rock', 'stone', 'water', 'bark'];
const BACKDROPS = ['canyon', 'colony'];
const SPRITES = ['foliage', 'foam'];

export async function loadPaint() {
  const loader = new THREE.TextureLoader();
  const retry = (fn, n = 1) => fn().catch(e => (n > 0 ? new Promise(r => setTimeout(r, 400)).then(() => retry(fn, n - 1)) : Promise.reject(e)));
  const load = (url, repeat) => retry(() => loader.loadAsync(url)).then(t => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }).catch(() => { console.warn('paint missing', url); return null; });
  const P = { tex: {}, backdrops: {}, sprites: {} };
  await Promise.all([
    ...TEXTURES.map(async n => { P.tex[n] = await load(`assets/tex/${n}.webp`, true); }),
    ...BACKDROPS.map(async n => { P.backdrops[n] = await load(`assets/backdrops/${n}.webp`, false); }),
    ...SPRITES.map(async n => { P.sprites[n] = await load(`assets/sprites/${n}.webp`, n === 'foam'); }),
  ]);
  return P;
}

// a repeat-able copy of a texture (shares the image)
export function tiled(t, rx, ry) { if (!t) return null; const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(rx, ry); c.needsUpdate = true; return c; }

// Terrain: up to three textures blended per vertex. Vertex colour = (brightness, moss weight, alt weight).
// With no textures it falls back to a flat colour so the greybox still renders.
export function terrainMaterial({ base, alt, moss, fallback = 0xcccccc, flat = false, side = THREE.DoubleSide }) {
  if (!base) return new THREE.MeshStandardMaterial({ color: fallback, roughness: 0.95, flatShading: flat, side });
  const m = new THREE.MeshStandardMaterial({ map: base, vertexColors: true, roughness: 0.95, flatShading: flat, side });
  m.onBeforeCompile = sh => {
    sh.uniforms.tAlt = { value: alt || base };
    sh.uniforms.tMoss = { value: moss || base };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tAlt;\nuniform sampler2D tMoss;')
      .replace('#include <map_fragment>', `
        vec3 cBase = texture2D(map, vMapUv).rgb;
        vec3 cAlt = texture2D(tAlt, vMapUv).rgb;
        vec3 cMoss = texture2D(tMoss, vMapUv * 0.7).rgb;
        diffuseColor.rgb *= mix(mix(cBase, cAlt, vColor.b), cMoss, vColor.g) * vColor.r;`)
      .replace('#include <color_fragment>', '');
  };
  m.customProgramCacheKey = () => 'terrain';
  return m;
}

// world-scale UVs on a BoxGeometry(w, h, d): one texture tile every `tile` meters on every face
export function boxWorldUV(geo, w, h, d, tile = 3) {
  const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
  uv.needsUpdate = true;
  return geo;
}

// one cell of a 2×2 atlas (col, row from the top-left)
export function atlasCell(col, row) { return { u0: col * 0.5, v0: 1 - (row + 1) * 0.5, u1: (col + 1) * 0.5, v1: 1 - row * 0.5 }; }
