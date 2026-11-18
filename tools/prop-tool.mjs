// Helpers for Tripo prop GLBs.
//   node tools/prop-tool.mjs clean <in.glb> <out.glb>
//       drops detached floaters: connected pieces whose x/z centre lies outside the main piece's x/z footprint
//   node tools/prop-tool.mjs measure <in.glb>
//       bbox, plus the centroid and bbox of vertices by texture colour (indigo visor, cyan glow, gold) in model space
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import sharp from 'sharp';

const [cmd, inPath, outPath] = process.argv.slice(2);
const flag = (name, d) => { const i = process.argv.indexOf('--' + name); return i < 0 ? d : process.argv[i + 1] ?? true; };
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inPath);
const prims = doc.getRoot().listMeshes().flatMap(m => m.listPrimitives());
const r3 = v => v.map(x => +x.toFixed(3));

// world matrix of the mesh node (Tripo puts a transform on it)
function nodeMatrix() {
  const node = doc.getRoot().listNodes().find(n => n.getMesh());
  return node ? node.getWorldMatrix() : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
const apply = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];

if (cmd === 'clean') {
  for (const prim of prims) {
    const P = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray();
    const n = P.getCount(), parent = new Int32Array(n).map((_, i) => i);
    const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const key = new Map();
    for (let i = 0; i < n; i++) { const p = P.getElement(i, []); const k = p.map(x => Math.round(x * 1e4)).join(','); if (key.has(k)) parent[find(i)] = find(key.get(k)); else key.set(k, i); }
    for (let t = 0; t < idx.length; t += 3) { const a = find(idx[t]); parent[find(idx[t + 1])] = a; parent[find(idx[t + 2])] = a; }
    const comps = new Map();
    for (let t = 0; t < idx.length; t += 3) { const c = find(idx[t]); if (!comps.has(c)) comps.set(c, { tris: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], sum: [0, 0, 0], k: 0 }); const o = comps.get(c); o.tris.push(t);
      for (let j = 0; j < 3; j++) { const p = P.getElement(idx[t + j], []); for (let a = 0; a < 3; a++) { o.min[a] = Math.min(o.min[a], p[a]); o.max[a] = Math.max(o.max[a], p[a]); o.sum[a] += p[a]; } o.k++; } }
    const list = [...comps.values()].sort((a, b) => b.tris.length - a.tris.length), main = list[0];
    const pad = [0, 2].map(a => (main.max[a] - main.min[a]) * 0.02);
    const keep = flag('largest') ? [main] : list.filter(o => { const cx = o.sum[0] / o.k, cz = o.sum[2] / o.k; return o === main || (cx > main.min[0] - pad[0] && cx < main.max[0] + pad[0] && cz > main.min[2] - pad[1] && cz < main.max[2] + pad[1]); });
    const out = new Uint32Array(keep.reduce((s, o) => s + o.tris.length * 3, 0)); let w = 0;
    for (const o of keep) for (const t of o.tris) { out[w++] = idx[t]; out[w++] = idx[t + 1]; out[w++] = idx[t + 2]; }
    prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(out).setBuffer(doc.getRoot().listBuffers()[0]));
    console.error(`${list.length} pieces, kept ${keep.length} (${out.length / 3} of ${idx.length / 3} tris); dropped: ${list.filter(o => !keep.includes(o)).map(o => o.tris.length).join(', ') || 'none'}`);
  }
  await doc.transform(prune());
  await io.write(outPath, doc);
}

if (cmd === 'measure') {
  const M = nodeMatrix();
  const classes = {
    indigo: c => c[2] > c[0] + 0.25 && c[2] > c[1] + 0.15 && c[0] < 0.45,
    cyan: c => c[1] > 0.55 && c[2] > 0.6 && c[0] < 0.55 && c[1] > c[0] + 0.15,
    gold: c => c[0] > 0.75 && c[1] > 0.6 && c[2] < 0.4,
  };
  const all = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const acc = Object.fromEntries(Object.keys(classes).map(k => [k, { n: 0, sum: [0, 0, 0], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }]));
  for (const prim of prims) {
    const P = prim.getAttribute('POSITION'), UV = prim.getAttribute('TEXCOORD_0');
    const tex = prim.getMaterial()?.getBaseColorTexture();
    const img = tex ? await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true }) : null;
    for (let i = 0; i < P.getCount(); i++) {
      const p = apply(M, P.getElement(i, []));
      for (let a = 0; a < 3; a++) { all.min[a] = Math.min(all.min[a], p[a]); all.max[a] = Math.max(all.max[a], p[a]); }
      if (!img || !UV) continue;
      const [u, v] = UV.getElement(i, []);
      const x = Math.min(img.info.width - 1, Math.max(0, Math.floor(u * img.info.width))), y = Math.min(img.info.height - 1, Math.max(0, Math.floor(v * img.info.height)));
      const o = (y * img.info.width + x) * 3, c = [img.data[o] / 255, img.data[o + 1] / 255, img.data[o + 2] / 255];
      for (const [k, f] of Object.entries(classes)) if (f(c)) { const s = acc[k]; s.n++; for (let a = 0; a < 3; a++) { s.sum[a] += p[a]; s.min[a] = Math.min(s.min[a], p[a]); s.max[a] = Math.max(s.max[a], p[a]); } }
    }
  }
  const size = all.max.map((v, a) => v - all.min[a]);
  const tipAxis = flag('tip'), A = { x: 0, y: 1, z: 2 }[tipAxis];
  if (tipAxis) {   // second pass: cyan vertices near the min end of that axis (the pod at a branch tip)
    const lim = all.min[A] + size[A] * 0.12, t = { n: 0, sum: [0, 0, 0] };
    for (const prim of prims) {
      const P = prim.getAttribute('POSITION'), UV = prim.getAttribute('TEXCOORD_0'), tex = prim.getMaterial()?.getBaseColorTexture();
      const img = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let i = 0; i < P.getCount(); i++) { const p = apply(M, P.getElement(i, [])); if (p[A] > lim) continue;
        const [u, v] = UV.getElement(i, []); const x = Math.min(img.info.width - 1, Math.floor(u * img.info.width)), y = Math.min(img.info.height - 1, Math.floor(v * img.info.height));
        const o = (y * img.info.width + x) * 3, c = [img.data[o] / 255, img.data[o + 1] / 255, img.data[o + 2] / 255];
        if (classes.cyan(c)) { t.n++; for (let a = 0; a < 3; a++) t.sum[a] += p[a]; } }
    }
    console.log('tip cyan', t.n, r3(t.sum.map(v => v / t.n)));
  }
  console.log(JSON.stringify({ file: inPath, min: r3(all.min), max: r3(all.max), size: r3(size),
    ...Object.fromEntries(Object.entries(acc).filter(([, s]) => s.n > 20).map(([k, s]) => [k, { n: s.n, centroid: r3(s.sum.map(v => v / s.n)), min: r3(s.min), max: r3(s.max) }])) }, null, 1));
}
