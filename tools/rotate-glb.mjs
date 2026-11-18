// node tools/rotate-glb.mjs <in.glb> <out.glb> <degreesAboutY>
// Bakes a rotation about +Y into every mesh's vertices (static meshes, before rigging).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { transformMesh } from '@gltf-transform/functions';
const [inPath, outPath, deg] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inPath);
const a = (+deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
const m = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];   // column-major rotation about Y
for (const mesh of doc.getRoot().listMeshes()) transformMesh(mesh, m);
await io.write(outPath, doc);
const P = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION');
console.error('bounds', P.getMin([]).map(v => +v.toFixed(3)), P.getMax([]).map(v => +v.toFixed(3)));
