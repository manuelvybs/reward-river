// node tools/reweight-hero.mjs <in.glb> <out.glb> [--sigma 0.015] [--report]
// Replaces an auto-rig's skin weights with geodesic ones. Meshy's auto-weights on the chibi astronaut leaked across
// limbs (36% of vertices weighted to an unrelated limb or the helmet: mittens hang next to the thighs in the A-pose),
// which tore the mesh in run / hang / cheer. Here every vertex is weighted by distance measured ALONG THE SURFACE to
// each bone, so a mitten is far from the thigh it hangs beside. Blending is limited to a bone and its direct
// parent / children, which keeps limbs, helmet and torso from ever mixing.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as THREE from 'three';

const args = process.argv.slice(2);
const [inPath, outPath] = args;
const SIGMA = +(args[args.indexOf('--sigma') + 1] || 0) || 0.015;
const MARKERS = new Set(['head_end', 'headfront']);          // end markers: never get weights
const MAIN_CHILD = { Hips: 'Spine02', Spine: 'neck', Head: 'head_end' };

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inPath);
const root = doc.getRoot();
const skin = root.listSkins()[0];
const joints = skin.listJoints();
const names = joints.map(j => j.getName());
const idx = new Map(names.map((n, i) => [n, i]));
const parentOf = joints.map(j => { const p = j.getParentNode(); return p && idx.has(p.getName()) ? idx.get(p.getName()) : -1; });
const childrenOf = joints.map((_, i) => parentOf.flatMap((p, c) => (p === i ? [c] : [])));

// joint origins in mesh (bind) space = inverse(IBM) * origin
const ibm = skin.getInverseBindMatrices();
const jp = joints.map((_, i) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(ibm.getElement(i, [])).invert()));

// one segment per influencing bone: from the joint to its main child (or an extension for end bones)
const segs = joints.map((j, i) => {
  if (MARKERS.has(names[i])) return null;
  const kids = childrenOf[i];
  let end;
  const main = MAIN_CHILD[names[i]] ? idx.get(MAIN_CHILD[names[i]]) : kids.length === 1 ? kids[0] : -1;
  if (main >= 0) end = jp[main].clone();
  else { const p = parentOf[i]; const dir = jp[i].clone().sub(jp[p]); end = jp[i].clone().add(dir.multiplyScalar(0.6)); }
  return new THREE.Line3(jp[i].clone(), end);
});

const prim = root.listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute('POSITION');
const n = P.getCount();
const pos = Array.from({ length: n }, (_, i) => new THREE.Vector3().fromArray(P.getElement(i, [])));

// weld UV-seam duplicates so the surface graph is connected
const weldKey = v => `${Math.round(v.x * 1e5)},${Math.round(v.y * 1e5)},${Math.round(v.z * 1e5)}`;
const wid = new Int32Array(n); const wpos = []; const keyTo = new Map();
for (let i = 0; i < n; i++) { const k = weldKey(pos[i]); if (!keyTo.has(k)) { keyTo.set(k, wpos.length); wpos.push(pos[i]); } wid[i] = keyTo.get(k); }
const m = wpos.length;
const adj = Array.from({ length: m }, () => new Map());
const I = prim.getIndices().getArray();
for (let t = 0; t < I.length; t += 3) for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) {
  const A = wid[a], B = wid[b]; if (A === B) continue; const d = wpos[A].distanceTo(wpos[B]); adj[A].set(B, d); adj[B].set(A, d);
}

// multi-source Dijkstra from the surface vertices nearest each bone segment
function geodesic(seg) {
  const dist = new Float64Array(m).fill(Infinity);
  const tmp = new THREE.Vector3();
  const e = wpos.map(v => seg.closestPointToPoint(v, true, tmp).distanceTo(v));
  const dmin = Math.min(...e);
  const heap = [];   // binary heap of [d, v]
  const push = (d, v) => { heap.push([d, v]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let p = 0; for (;;) { const l = 2 * p + 1, r = l + 1; let s = p; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === p) break; [heap[p], heap[s]] = [heap[s], heap[p]]; p = s; } } return top; };
  for (let v = 0; v < m; v++) if (e[v] <= dmin + 0.01) { dist[v] = e[v]; push(e[v], v); }
  while (heap.length) { const [d, v] = pop(); if (d > dist[v]) continue; for (const [u, w] of adj[v]) { const nd = d + w; if (nd < dist[u]) { dist[u] = nd; push(nd, u); } } }
  return dist;
}
const D = segs.map(s => (s ? geodesic(s) : null));

// weights: dominant bone + its direct parent/children, softmax on geodesic distance
const J = new Uint8Array(n * 4), W = new Float32Array(n * 4);
const wj = new Uint8Array(m * 4), ww = new Float32Array(m * 4);
let unreached = 0;
for (let v = 0; v < m; v++) {
  let best = -1, bd = Infinity;
  for (let b = 0; b < D.length; b++) if (D[b] && D[b][v] < bd) { bd = D[b][v]; best = b; }
  if (best < 0 || !isFinite(bd)) { unreached++; best = idx.get('Hips'); bd = 0; }
  const cand = [best, parentOf[best], ...childrenOf[best]].filter(b => b >= 0 && D[b]);
  const list = cand.map(b => [b, Math.exp(-((D[b][v] ?? Infinity) - bd) / SIGMA)]).filter(([, w]) => w > 0.02)
    .sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = list.reduce((s, [, w]) => s + w, 0);
  list.forEach(([b, w], k) => { wj[v * 4 + k] = b; ww[v * 4 + k] = w / sum; });
}
// Two height rules on top of the geodesic weights (bind pose, +Y up):
// 1. The helmet is a rigid shell: anything above the collar follows Head alone (a neck/head or shoulder/head blend
//    shears the visor and smears its sparkles). The helmet overhangs the shoulders, so its underside is the surface
//    nearest the shoulder bones and the geodesic pass hands half of it to them: shoulders are NOT exempt here, only
//    the arm proper (upper arm, forearm, hand). A short band at the collar blends neck -> Head.
// 2. The round lower torso above the hip joints follows Hips, not the thighs (else it swings with each stride and
//    tears into strips at the belt); a band just below the hip joints blends thigh -> Hips.
const iHead = idx.get('Head'), iNeck = idx.get('neck'), iHips = idx.get('Hips');
const yRigid = (jp[iNeck].y + jp[iHead].y) / 2 + 0.01, yBand = jp[iNeck].y - 0.005;
const yHipTop = jp[idx.get('LeftUpLeg')].y, yHipBand = yHipTop - 0.05;
const isArmLimb = b => /^(Left|Right)(Arm|ForeArm|Hand)$/.test(names[b]);
const isLeg = b => /^(Left|Right)(UpLeg|Leg|Foot|ToeBase)$/.test(names[b]);
const set = (v, pairs) => { for (let k = 0; k < 4; k++) { wj[v * 4 + k] = 0; ww[v * 4 + k] = 0; } pairs.forEach(([b, w], k) => { wj[v * 4 + k] = b; ww[v * 4 + k] = w; }); };
let rigid = 0, hip = 0;
for (let v = 0; v < m; v++) {
  const y = wpos[v].y, dom = wj[v * 4];
  if (y >= yBand && !isArmLimb(dom)) {
    const t = Math.min(1, (y - yBand) / (yRigid - yBand));
    if (t >= 1) { set(v, [[iHead, 1]]); rigid++; } else set(v, [[iHead, t], [iNeck, 1 - t]]);
  } else if (y >= yHipBand && isLeg(dom)) {
    const thigh = idx.get(wpos[v].x >= 0 ? 'LeftUpLeg' : 'RightUpLeg');
    const t = Math.min(1, (y - yHipBand) / (yHipTop - yHipBand));
    set(v, t >= 1 ? [[iHips, 1]] : [[iHips, t], [thigh, 1 - t]]); hip++;
  }
}
console.error(`helmet: ${rigid} welded verts rigid on Head above y=${yRigid.toFixed(3)} (collar band from ${yBand.toFixed(3)}); hips: ${hip} verts moved off the thighs above y=${yHipBand.toFixed(3)}`);
for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { J[i * 4 + k] = wj[wid[i] * 4 + k]; W[i * 4 + k] = ww[wid[i] * 4 + k]; }

const buffer = root.listBuffers()[0];
prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(J).setBuffer(buffer));
prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(W).setBuffer(buffer));
await io.write(outPath, doc);

// report: dominant bone counts, and vertices that still mix unrelated chains (should be 0)
const chain = s => /^Left(Shoulder|Arm|ForeArm|Hand)/.test(s) ? 'LA' : /^Right(Shoulder|Arm|ForeArm|Hand)/.test(s) ? 'RA'
  : /^Left(UpLeg|Leg|Foot|Toe)/.test(s) ? 'LL' : /^Right(UpLeg|Leg|Foot|Toe)/.test(s) ? 'RL' : /^(Head|neck)/.test(s) ? 'H' : 'S';
let mixed = 0; const dom = {};
for (let v = 0; v < m; v++) {
  const cs = new Set(); for (let k = 0; k < 4; k++) if (ww[v * 4 + k] > 0.05) cs.add(chain(names[wj[v * 4 + k]]));
  if ([...cs].filter(c => c !== 'S').length > 1) mixed++;
  dom[names[wj[v * 4]]] = (dom[names[wj[v * 4]]] || 0) + 1;
}
console.error(`${n} verts (${m} welded), sigma ${SIGMA}, unreached ${unreached}, cross-limb verts ${mixed}`);
if (args.includes('--report')) console.error(dom);
