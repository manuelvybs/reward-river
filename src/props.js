// Twin Moon River — generated props (Tripo GLBs). Each spec says how to turn the raw model to face +Z, how to scale
// Tripo's unit box to meters, and named points measured on the raw model (tools/prop-tool.mjs measure), which come
// back in the prop's local space. A template's origin is the bottom centre of its footprint.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const PROPS = {
  'helmet-face': { url: 'assets/models/helmet-face.glb', yaw: 227, scale: 16.3 },                  // the two chasm statues
  tree: { url: 'assets/models/tree.glb', yaw: 270, scale: 15.8, points: { pod: [-0.041, 0.012, -0.407] } },   // branch to +X, pod = rope hook
  raft: { url: 'assets/models/raft.glb', yaw: 270, scale: 2.6 },                                   // bow to +Z
  bust: { url: 'assets/models/bust.glb', yaw: 270, scale: 6.6 },                                    // half-sunken river statues
  crystal: { url: 'assets/models/crystal.glb', yaw: 270, scale: 1, glow: 0.22 },                    // scaled per slot (radius, height)
  antenna: { url: 'assets/models/antenna.glb', yaw: 0, scale: 3.9 },                                // dish head by the duck mast
};

export async function loadProps(names = Object.keys(PROPS)) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const out = {};
  await Promise.all(names.map(async name => {
    const spec = PROPS[name];
    try {
      const gltf = await loader.loadAsync(spec.url);
      gltf.scene.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
        if (spec.glow && o.material.map) { o.material.emissive.set(0xffffff); o.material.emissiveMap = o.material.map; o.material.emissiveIntensity = spec.glow; }
      });
      const turn = new THREE.Group();
      turn.rotation.y = THREE.MathUtils.degToRad(spec.yaw);
      turn.scale.setScalar(spec.scale);
      turn.add(gltf.scene);
      const root = new THREE.Group();
      root.name = name;
      root.add(turn);
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3());
      turn.position.set(-c.x, -box.min.y, -c.z);
      root.updateMatrixWorld(true);
      const points = {};
      for (const [k, p] of Object.entries(spec.points || {})) points[k] = new THREE.Vector3(...p).applyMatrix4(turn.matrix);
      out[name] = { template: root, size: box.getSize(new THREE.Vector3()), points };
    } catch (e) { console.warn(`prop ${name} not loaded (${e.message}): keeping the placeholder`); }
  }));
  return out;
}
