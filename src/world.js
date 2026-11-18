// Twin Moon River — the world, built from level.js. Step 2 greybox: every prop is a placeholder shape in the final
// palette, placed where its generated model will go (step 3 swaps them for GLBs).
import * as THREE from 'three';
import { FOOT, footCenter, footWidth, footGround, RIVER, riverAt, OBSTACLES, MEDALS, ROOTS, COLLIDERS } from './level.js';
import { PALETTE as C, SUN, TUNING } from './config.js';

const col = c => new THREE.Color(c);
const lerpC = (a, b, t) => col(a).lerp(col(b), Math.min(1, Math.max(0, t)));
const ease = t => t * t * (3 - 2 * t);
const n1 = (a, b = 0) => Math.sin(a * 0.31 + b) * 0.6 + Math.sin(a * 0.83 + b * 1.7 + 1.3) * 0.3 + Math.sin(a * 1.9 + b * 0.5) * 0.1;
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });

// a grid surface from rows of points (rows[i][j]); colors(i, j, p) -> THREE.Color
function gridMesh(rows, colors, material) {
  const R = rows.length, Cn = rows[0].length, pos = [], cols = [], idx = [];
  rows.forEach((row, i) => row.forEach((p, j) => { pos.push(p.x, p.y, p.z); const c = colors(i, j, p); cols.push(c.r, c.g, c.b); }));
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < Cn - 1; j++) {
    const a = i * Cn + j, b = a + 1, c = a + Cn, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

// four-point sparkle star (the visor sparkle, the medals)
export function starShape(ro = 0.5, ri = 0.12) {
  const s = new THREE.Shape();
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2, b = a + Math.PI / 4;
    const p = [Math.cos(a) * ro, Math.sin(a) * ro], q = [Math.cos(b) * ri, Math.sin(b) * ri];
    if (k === 0) s.moveTo(p[0], p[1]);
    const n = [Math.cos(a + Math.PI / 2) * ro, Math.sin(a + Math.PI / 2) * ro];
    s.quadraticCurveTo(q[0], q[1], n[0], n[1]);
  }
  return s;
}

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// the giant stone astronaut helmet (chasm faces, river busts): helmet, visor, rim, sparkles
function helmetHead(r, stone = true) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(r, 36, 24), std(stone ? C.stone : C.helmet, { flatShading: false, roughness: 0.9 }));
  shell.castShadow = shell.receiveShadow = true; g.add(shell);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(r * 0.72, 32, 20), std(C.visor, { roughness: 0.3 }));
  visor.scale.set(1, 0.72, 0.5); visor.position.z = r * 0.62; g.add(visor);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.7, r * 0.07, 10, 40), std(C.visorRim, { roughness: 0.6 }));
  rim.scale.set(1, 0.74, 1); rim.position.z = r * 0.74; g.add(rim);
  const star = new THREE.ShapeGeometry(starShape(r * 0.22, r * 0.05));
  const big = new THREE.Mesh(star, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  big.position.set(-r * 0.22, r * 0.08, r * 0.985); g.add(big);
  const small = new THREE.Mesh(star, new THREE.MeshBasicMaterial({ color: C.gold }));
  small.scale.setScalar(0.5); small.position.set(r * 0.25, -r * 0.14, r * 0.97); g.add(small);
  return g;
}

function crystal(r, h) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, h, 6, 1), std(C.crystal, { flatShading: true, roughness: 0.25, emissive: col(C.crystalDeep), emissiveIntensity: 0.25, transparent: true, opacity: 0.93 }));
  m.castShadow = true; m.position.y = h / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(r * 0.8, r * 1.6, 6), m.material);
  tip.position.y = h / 2 + r * 0.8; m.add(tip);
  const g = new THREE.Group(); g.add(m); return g;
}

export function buildWorld(scene) {
  const W = { medals: [], anim: [] };

  // ------------------------------------------------------------------------------------------ sky + moons
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: col(C.skyTop) }, bottom: { value: col(C.skyHorizon) }, glow: { value: col(C.sunGlow) }, sunDir: { value: new THREE.Vector3(...SUN.dir).normalize() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; uniform vec3 glow; uniform vec3 sunDir; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.6 + 0.08, 0., 1.); vec3 c = mix(bottom, top, pow(h, 0.8)); float s = max(dot(normalize(vP), sunDir), 0.); c += glow * (pow(s, 6.) * 0.35 + pow(s, 60.) * 0.6); c += vec3(1.) * pow(s, 900.) * 1.5; gl_FragColor = vec4(c, 1.);\n#include <colorspace_fragment>\n}',
  }));
  sky.renderOrder = -10; scene.add(sky);
  const moonTex = (inner, outer, ring) => canvasTex(256, 256, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    g.addColorStop(0, inner); g.addColorStop(0.62, outer); g.addColorStop(0.7, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(160,150,220,0.18)'; [[90, 100, 18], [150, 140, 12], [120, 170, 9]].forEach(([a, b, r]) => { x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); });
    if (ring) { x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 5; x.beginPath(); x.ellipse(w / 2, h / 2, 120, 26, -0.35, 0, 7); x.stroke(); }
  }, false);
  const moons = [
    { s: new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex('#ffffff', '#e8f4ff'), fog: false, depthWrite: false })), az: -22, el: 22, size: 230 },
    { s: new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex('#fff1fb', '#f6c6e8', true), fog: false, depthWrite: false })), az: 30, el: 13, size: 120 },
  ];
  moons.forEach(m => { m.s.scale.setScalar(m.size); m.s.renderOrder = -9; scene.add(m.s); });

  // far mesas: fogged silhouettes all around
  const mesaMat = std(C.rockDark, { flatShading: true });
  for (let k = 0; k < 46; k++) {
    const a = k / 46 * Math.PI * 2 + n1(k) * 0.2, d = 420 + (k * 97 % 260), h = 70 + (k * 53 % 110);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(24 + k % 5 * 6, 40 + k % 7 * 6, h, 6), mesaMat);
    m.position.set(Math.cos(a) * d, h / 2 - 20, -300 + Math.sin(a) * d * 1.3); m.rotation.y = k;
    scene.add(m);
  }

  // ------------------------------------------------------------------------------------------ canyon (on foot)
  const chasmT = z => ease(Math.min(1, Math.max(0, (FOOT.edgeZ + 3 - z) / 4))) * ease(Math.min(1, Math.max(0, (z - (FOOT.farZ - 3)) / 4)));
  const wallHalf = z => THREE.MathUtils.lerp(footWidth(z) / 2 + 0.35, 12.5, chasmT(z));
  const groundAt = z => { const g = footGround(footCenter(z), z); return Number.isFinite(g) ? g : (z > FOOT.farZ ? -46 : FOOT.landY); };
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const rows = [];
    for (let z = 42; z >= -117; z -= 1.5) {
      const xb = footCenter(z) + side * wallHalf(z), yb = Math.min(groundAt(z), groundAt(z + 1.5), groundAt(z - 1.5)) - 0.6;
      const top = 15 + 4 * n1(z * 0.5, side) + 5 * chasmT(z);
      const row = [new THREE.Vector3(xb, yb, z)];
      for (let v = 1; v <= 6; v++) row.push(new THREE.Vector3(xb + side * (0.3 * v + 0.9 * n1(z + v * 7, side * 3)), yb + (top - yb) * v / 6, z + 0.4 * n1(v * 3 + z, side)));
      row.push(new THREE.Vector3(xb + side * (3.5 + n1(z, 9)), top + 0.6, z), new THREE.Vector3(xb + side * 60, top + 3, z));
      rows.push(row);
    }
    const mesh = gridMesh(rows, (i, j, p) => j >= 7 ? lerpC(C.moss, C.mossDark, 0.5 + 0.5 * n1(p.z, j)) : lerpC(C.rockDark, C.rockLight, (p.y + 8) / 26 + 0.15 * n1(p.z * 2, j)), rockMat);
    if (side > 0) mesh.geometry.index.array.reverse();
    mesh.geometry.computeVertexNormals();
    mesh.receiveShadow = mesh.castShadow = true;
    scene.add(mesh);
  }
  // walkable floors: trail, landing, quay (ribbons out to the wall feet)
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  const floor = (z0, z1, yFn) => {
    const rows = [];
    for (let z = z0; z >= z1 - 0.01; z -= 0.75) {
      const c = footCenter(z), h = wallHalf(z) + 0.4, row = [];
      for (let j = 0; j <= 8; j++) { const x = c - h + 2 * h * j / 8; row.push(new THREE.Vector3(x, yFn(x, z), z)); }
      rows.push(row);
    }
    const m = gridMesh(rows, (i, j, p) => { const t = Math.abs(p.x - footCenter(p.z)) / (footWidth(p.z) / 2); return t < 0.6 ? lerpC(C.path, C.pathDark, 0.5 + 0.5 * n1(p.z * 3, p.x)) : lerpC(C.mossDark, C.moss, 0.5 + 0.5 * n1(p.z * 2, p.x * 2)); }, groundMat);
    m.receiveShadow = true; scene.add(m);
  };
  floor(42, FOOT.edgeZ, (x, z) => footGround(x, z));
  floor(FOOT.farZ, FOOT.stepsZ0, () => FOOT.landY);
  // roots across the trail (jump them) with glowing alien nodules, and boulders to run around
  const barkM = std(C.bark, { roughness: 0.95 }), glowM = new THREE.MeshStandardMaterial({ color: C.crystal, emissive: col(C.crystal), emissiveIntensity: 0.9 });
  for (const o of ROOTS) {
    const c = footCenter(o.z), g = footGround(c, o.z), r = o.h / 2, pts = [];
    for (let k = 0; k <= 8; k++) { const x = c + o.x0 - 0.8 + (o.x1 - o.x0 + 1.6) * k / 8; const lift = k === 0 || k === 8 ? -0.35 : 0; pts.push(new THREE.Vector3(x, g + r + lift + 0.05 * Math.sin(k * 1.7), o.z + 0.12 * Math.sin(k * 2.3))); }
    const root = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 8), barkM);
    root.castShadow = root.receiveShadow = true; scene.add(root);
    for (let k = 1; k < 8; k += 2) { const n = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), glowM); n.position.copy(pts[k]).add(new THREE.Vector3(0, r * 0.9, 0)); scene.add(n); }
  }
  for (const o of COLLIDERS) {
    const b = new THREE.Mesh(new THREE.DodecahedronGeometry(o.r * 1.15, 0), std(C.rockDark, { flatShading: true }));
    b.position.set(o.x, footGround(o.x, o.z) + o.r * 0.55, o.z); b.rotation.set(o.z, o.x, 0.3); b.castShadow = b.receiveShadow = true; scene.add(b);
  }
  // cliff faces of the chasm + mist + a waterfall
  const face = (z, yTop, flip) => {
    const rows = [];
    for (let y = yTop; y >= -46; y -= 4) { const row = []; for (let j = 0; j <= 10; j++) { const x = -13 + 26 * j / 10; row.push(new THREE.Vector3(x, y, z + (flip ? -1 : 1) * (0.5 + 0.6 * n1(x * 2 + y, z)))); } rows.push(row); }
    const m = gridMesh(rows, (i, j, p) => lerpC(C.rockDark, C.rock, (p.y + 46) / 50), rockMat);
    if (flip) m.geometry.index.array.reverse();
    m.geometry.computeVertexNormals(); m.receiveShadow = true; scene.add(m);
  };
  face(FOOT.edgeZ, 0, false);
  face(FOOT.farZ, FOOT.landY, true);
  for (const [y, o] of [[-26, 0.95], [-14, 0.45]]) {
    const mist = new THREE.Mesh(new THREE.PlaneGeometry(30, 22), new THREE.MeshBasicMaterial({ color: C.fog, transparent: true, opacity: o, depthWrite: false }));
    mist.rotation.x = -Math.PI / 2; mist.position.set(0, y, (FOOT.edgeZ + FOOT.farZ) / 2); scene.add(mist);
  }
  const fallTex = canvasTex(64, 256, (x, w, h) => { x.fillStyle = '#eef7ff'; x.fillRect(0, 0, w, h); for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(150,190,240,${0.15 + (k % 4) * 0.08})`; x.fillRect((k * 23) % w, (k * 37) % h, 3 + k % 4, 40 + k % 5 * 12); } });
  fallTex.repeat.set(2, 3);
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(6, 62), new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.88 }));
  fall.position.set(-10.6, -14, -61); fall.rotation.y = Math.PI / 2 - 0.15; scene.add(fall);
  W.anim.push(dt => { fallTex.offset.y += dt * 1.4; });

  // the two giant stone helmets facing each other across the chasm
  for (const side of [-1, 1]) {
    const h = helmetHead(6.8);
    h.position.set(side * 15.5, 2.5, FOOT.anchor.z + 1.5);
    h.rotation.y = -side * Math.PI / 2 + side * 0.45;
    scene.add(h);
  }
  // the alien tree: trunk out of the left chasm wall, a branch out to the rope anchor, a glowing pod
  const bark = std(C.bark, { roughness: 0.9 });
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-12, -30, -63), new THREE.Vector3(-10, -6, -63.5), new THREE.Vector3(-8, 8, -64.5), new THREE.Vector3(-6.5, 12, -65)]), 20, 1.1, 8), bark);
  const branch = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-7, 11.5, -65), new THREE.Vector3(-3.5, 13.6, -65), FOOT.anchor.clone().add(new THREE.Vector3(0, 0.35, 0)), new THREE.Vector3(1.8, 13.0, -65)]), 24, 0.42, 8), bark);
  trunk.castShadow = branch.castShadow = true; scene.add(trunk, branch);
  for (const [x, y, z, r] of [[-7.5, 15.5, -64, 3.6], [-4.5, 15.2, -66.5, 2.6], [-9.5, 13.5, -62, 2.8], [-1.5, 14.6, -64, 2]]) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), std(C.mossDark, { flatShading: true })); b.position.set(x, y, z); b.castShadow = true; scene.add(b);
  }
  const pod = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), new THREE.MeshStandardMaterial({ color: C.crystal, emissive: col(C.crystal), emissiveIntensity: 1.2 }));
  pod.position.copy(FOOT.anchor).add(new THREE.Vector3(0, 0.1, 0)); scene.add(pod);
  W.anim.push((dt, t) => { pod.material.emissiveIntensity = 0.9 + 0.5 * Math.sin(t * 3); });

  // steps, crystal pillars, quay
  const stoneMat = std(C.stone, { roughness: 0.9 }), stoneDark = std(C.stoneDark, { roughness: 0.9 });
  const dz = (FOOT.stepsZ0 - FOOT.stepsZ1) / FOOT.stepN, dy = (FOOT.stepTop - FOOT.landY) / FOOT.stepN;
  for (let i = 0; i < FOOT.stepN; i++) {
    const top = FOOT.landY + (i + 1) * dy, hgt = top - FOOT.landY + 0.6;
    const s = new THREE.Mesh(new THREE.BoxGeometry(5.6, hgt, dz + 0.02), i % 2 ? stoneMat : stoneDark);
    s.position.set(0, top - hgt / 2, FOOT.stepsZ0 - (i + 0.5) * dz); s.receiveShadow = s.castShadow = true; scene.add(s);
  }
  const quayLen = FOOT.stepsZ1 - (FOOT.quayZ - 2.5);
  const quay = new THREE.Mesh(new THREE.BoxGeometry(14, 9, quayLen), stoneMat);
  quay.position.set(0, FOOT.stepTop - 4.5, FOOT.stepsZ1 - quayLen / 2); quay.receiveShadow = true; scene.add(quay);
  for (const [x, z, h] of [[-3.3, -80, 7], [3.4, -88, 9], [-3.1, -96, 10], [3.1, -101, 8], [-3.1, -105.5, 11], [3.1, -105.5, 9], [-5, -114, 8], [5, -114, 10]]) {
    const c = crystal(0.75, h); c.position.set(x, footGround(0, z), z); c.rotation.y = x; scene.add(c);
  }

  // ------------------------------------------------------------------------------------------ the river
  const flowTex = canvasTex(128, 512, (x, w, h) => {
    x.fillStyle = '#e9f4f7'; x.fillRect(0, 0, w, h);
    for (let k = 0; k < 90; k++) {
      const y = (k * 61) % h, x0 = (k * 37) % w, l = 18 + (k % 6) * 9;
      x.strokeStyle = k % 3 ? 'rgba(255,255,255,0.9)' : 'rgba(170,205,225,0.55)'; x.lineWidth = 2 + (k % 3);
      x.beginPath(); x.moveTo(x0, y); x.bezierCurveTo(x0 + 6, y + l * 0.3, x0 - 6, y + l * 0.6, x0 + 2, y + l); x.stroke();
    }
  });
  const endS = RIVER.endS + 70;
  const waterRows = [], bankRows = [[], []];
  for (let s = 0; s <= endS; s += 1) {
    const f = riverAt(s), hw = f.width / 2 + 2.5, row = [];
    for (let j = 0; j <= 6; j++) { const o = -hw + 2 * hw * j / 6; row.push(new THREE.Vector3(f.x + f.nx * o, f.y, f.z + f.nz * o)); }
    waterRows.push(row);
  }
  const waterGeo = gridMesh(waterRows, (i, j) => lerpC(C.waterDeep, C.water, Math.abs(j - 3) / 3 * 0.8 + 0.2), null).geometry;
  const uv = [];
  waterRows.forEach((row, i) => row.forEach((p, j) => uv.push(j / 6 * 2, i / 9)));
  waterGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({ vertexColors: true, map: flowTex, roughness: 0.3, metalness: 0.0, transparent: true, opacity: 0.95, side: THREE.DoubleSide, emissive: col(C.water), emissiveIntensity: 0.22 }));
  water.receiveShadow = true; scene.add(water);
  W.anim.push((dt, t, p) => { flowTex.offset.y += dt * (p?.raft ? 0.55 : 0.5); });

  // foam over the three drops
  const foamTex = canvasTex(128, 128, (x, w, h) => { x.clearRect(0, 0, w, h); for (let k = 0; k < 70; k++) { x.fillStyle = `rgba(255,255,255,${0.35 + (k % 5) * 0.12})`; x.beginPath(); x.ellipse((k * 47) % w, (k * 29) % h, 4 + k % 9, 2 + k % 5, k, 0, 7); x.fill(); } });
  const foamMat = new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  for (const sd of RIVER.drops) {
    const rows = [];
    for (let s = sd - 8; s <= sd + 12; s += 1) { const f = riverAt(s), hw = f.width / 2, row = []; for (let j = 0; j <= 4; j++) { const o = -hw + 2 * hw * j / 4; row.push(new THREE.Vector3(f.x + f.nx * o, f.y + 0.06, f.z + f.nz * o)); } rows.push(row); }
    const g = gridMesh(rows, () => col(0xffffff), null).geometry;
    const fuv = []; rows.forEach((row, i) => row.forEach((p, j) => fuv.push(j, i / 5))); g.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2));
    scene.add(new THREE.Mesh(g, foamMat));
  }
  W.anim.push(dt => { foamTex.offset.y += dt * 1.6; });
  foamTex.repeat.set(3, 1);

  // banks: rock in the gorge, pale colony stone through the flooded city
  const colony = s => s > 50 && s < RIVER.archS + 20;
  for (const side of [-1, 1]) {
    const rows = [];
    for (let s = -6; s <= endS; s += 2) {
      const f = riverAt(s), base = f.width / 2 + 0.3, top = f.y + 7 + 4 * n1(s * 0.2, side) + (colony(s) ? 3 : 6), row = [];
      for (let v = 0; v <= 4; v++) { const o = side * (base + 0.35 * v + 0.5 * n1(s + v * 5, side)); row.push(new THREE.Vector3(f.x + f.nx * o, f.y - 4 + (top - f.y + 4) * v / 4, f.z + f.nz * o)); }
      const o2 = side * (base + 40); row.push(new THREE.Vector3(f.x + f.nx * o2, top + 2, f.z + f.nz * o2));
      rows.push(row);
    }
    const m = gridMesh(rows, (i, j, p) => { const s = -6 + i * 2; return j === 5 ? lerpC(C.moss, C.mossDark, 0.5 + 0.5 * n1(s, 3)) : colony(s) ? lerpC(C.stoneDark, C.stone, j / 4 + 0.1 * n1(s, j)) : lerpC(C.rockDark, C.rockLight, j / 4 + 0.15 * n1(s, j)); }, rockMat);
    if (side < 0) m.geometry.index.array.reverse();
    m.geometry.computeVertexNormals(); m.receiveShadow = true; scene.add(m);
  }
  // colony ruins along the banks
  for (let k = 0; k < 70; k++) {
    const s = 60 + k * 5.2, f = riverAt(s), side = k % 2 ? 1 : -1, o = side * (f.width / 2 + 2 + (k * 7 % 5));
    const h = 3 + (k * 13 % 9), b = new THREE.Mesh(new THREE.BoxGeometry(2 + k % 3, h, 2 + (k * 5) % 3), k % 4 ? stoneMat : stoneDark);
    b.position.set(f.x + f.nx * o, f.y + h / 2 + 2.5, f.z + f.nz * o); b.rotation.y = k; b.castShadow = true; scene.add(b);
  }

  // obstacles: half-sunken helmet statues, crystal pillars, rocks
  for (const o of OBSTACLES) {
    const f = riverAt(o.s);
    let m;
    if (o.kind === 'bust') { m = helmetHead(o.r * 1.05); m.position.set(o.x, o.y + o.r * 0.25, o.z); m.rotation.y = Math.atan2(-f.tx, -f.tz) + (o.off > 0 ? -0.3 : 0.3); }
    else if (o.kind === 'pillar') { m = crystal(o.r * 0.9, 9 + (o.s % 4)); m.position.set(o.x, o.y - 2, o.z); }
    else { m = new THREE.Mesh(new THREE.DodecahedronGeometry(o.r * 1.1, 0), std(C.rockDark, { flatShading: true })); m.position.set(o.x, o.y + 0.2, o.z); m.castShadow = true; }
    scene.add(m);
  }
  // the fallen antenna mast across the river (duck!)
  {
    const f = riverAt(RIVER.beamS), len = f.width + 8, g = new THREE.Group();
    for (let k = 0; k < 8; k++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, len / 8, 12), std(k % 2 ? 0xffffff : C.vybs, { roughness: 0.5 })); seg.position.y = -len / 2 + (k + 0.5) * len / 8; seg.castShadow = true; g.add(seg); }
    const dish = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.2, 24, 1, true), std(0xf4f4ff, { side: THREE.DoubleSide, roughness: 0.4 }));
    dish.position.y = len / 2; dish.rotation.x = Math.PI; g.add(dish);
    g.position.set(f.x, f.y + 1.28, f.z);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(f.nx, 0, f.nz));
    scene.add(g);
  }
  // the crashed-rocket arch
  {
    const f = riverAt(RIVER.archS), R = f.width / 2 + 2.2;
    const arch = new THREE.Mesh(new THREE.TorusGeometry(R, 1.5, 10, 40, Math.PI), stoneMat);
    arch.position.set(f.x, f.y - 1, f.z); arch.rotation.y = Math.atan2(-f.nz, f.nx); arch.castShadow = true; scene.add(arch);
    const rocket = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.5, 9, 6, 20), std(0xf6f8ff, { roughness: 0.5 })); rocket.add(body);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.53, 1.53, 1.2, 20), std(C.vybs)); band.position.y = 2; rocket.add(band);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.6, 20), std(C.gold, { roughness: 0.4 })); nose.position.y = 6.2; rocket.add(nose);
    for (let k = 0; k < 3; k++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.4, 1.8), std(C.vybs)); fin.position.set(Math.cos(k * 2.1) * 1.6, -4.8, Math.sin(k * 2.1) * 1.6); fin.rotation.y = -k * 2.1; rocket.add(fin); }
    rocket.position.set(f.x + f.nx * 3, f.y + R + 1.2, f.z + f.nz * 3);
    rocket.rotation.set(0.35, Math.atan2(f.tx, f.tz), 1.15);
    rocket.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(rocket);
  }
  // the lagoon
  {
    const f = riverAt(RIVER.endS + 45);
    const lag = new THREE.Mesh(new THREE.CircleGeometry(48, 48), new THREE.MeshStandardMaterial({ color: C.water, map: flowTex, roughness: 0.2, transparent: true, opacity: 0.95 }));
    lag.rotation.x = -Math.PI / 2; lag.position.set(f.x, f.y - 0.02, f.z); scene.add(lag);
    const sand = new THREE.Mesh(new THREE.RingGeometry(40, 95, 48), std(C.path)); sand.rotation.x = -Math.PI / 2; sand.position.set(f.x, f.y + 0.35, f.z); sand.receiveShadow = true; scene.add(sand);
    for (let k = 0; k < 9; k++) { const a = Math.PI * (0.15 + k * 0.09), c = crystal(1.2, 8 + k % 4 * 3); c.position.set(f.x + Math.cos(a) * 44, f.y, f.z - Math.sin(a) * 44); scene.add(c); }
  }

  // ------------------------------------------------------------------------------------------ medals
  const medalGeo = new THREE.ExtrudeGeometry(starShape(0.42, 0.1), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2 });
  medalGeo.center();
  const medalMat = std(C.gold, { roughness: 0.35, metalness: 0.3, emissive: col(0xffb000), emissiveIntensity: 0.45 });
  MEDALS.forEach((m, k) => { const mesh = new THREE.Mesh(medalGeo, medalMat); mesh.position.set(m.x, m.y, m.z); mesh.castShadow = true; scene.add(mesh); W.medals.push({ mesh, y: m.y, got: false, t: 0 }); });
  W.collect = k => { const m = W.medals[k]; if (m) { m.got = true; m.t = 0; } };
  W.resetMedals = () => W.medals.forEach(m => { m.got = false; m.mesh.visible = true; m.mesh.scale.setScalar(1); });

  // ------------------------------------------------------------------------------------------ raft + rope
  const raft = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 1.9, 6, 18), std(C.helmet, { roughness: 0.5 }));
  hull.rotation.x = Math.PI / 2; hull.scale.set(1.3, 1, 0.55); hull.position.y = 0.05; raft.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.12, 2.1), std(C.indigo, { roughness: 0.6 })); deck.position.y = 0.3; raft.add(deck);
  const oars = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.8, 0.45, 0.1);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.2, 6), std(C.oar)); shaft.rotation.z = s * 1.25; shaft.position.set(s * 0.95, -0.35, 0); pivot.add(shaft);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.28), std(C.vybs)); blade.position.set(s * 1.95, -0.72, 0); pivot.add(blade);
    raft.add(pivot); oars.push(pivot);
  }
  raft.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(raft);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6), std(C.rope, { roughness: 0.8 }));
  rope.visible = false; scene.add(rope);
  W.raft = raft;

  const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), mid = new THREE.Vector3();
  W.update = (dt, t, p, hero, camera) => {
    for (const a of W.anim) a(dt, t, p);
    sky.position.copy(camera.position);
    for (const m of moons) {
      const az = THREE.MathUtils.degToRad(m.az), el = THREE.MathUtils.degToRad(m.el);
      m.s.position.set(camera.position.x + Math.sin(az) * Math.cos(el) * 1300, camera.position.y + Math.sin(el) * 1300, camera.position.z - Math.cos(az) * Math.cos(el) * 1300);
    }
    for (const m of W.medals) {
      if (m.got) { m.t += dt; m.mesh.scale.setScalar(Math.max(0, 1 - m.t * 3)); m.mesh.position.y = m.y + m.t * 3; if (m.t > 0.4) m.mesh.visible = false; continue; }
      m.mesh.rotation.y = t * 2.2; m.mesh.position.y = m.y + Math.sin(t * 2.4 + m.mesh.position.z) * 0.12;
    }
    // the raft rides the water when the hero is on it, and waits at the quay before
    const onRaft = p.mode === 'raft' || p.mode === 'end' || p.mode === 'board';
    if (onRaft && p.mode !== 'board') { raft.position.copy(p.pos); raft.rotation.set(Math.sin(t * 2.1) * 0.03, p.yaw, Math.sin(t * 1.7) * 0.04); }
    else if (!onRaft || p.mode === 'board') { const f = riverAt(0); raft.position.set(f.x, f.y + Math.sin(t * 1.6) * 0.04, f.z); raft.rotation.set(0, Math.atan2(f.tx, f.tz), 0); }
    const row = p.raft?.rowing && p.mode === 'raft' ? 1 : 0;
    oars.forEach((o, k) => { o.rotation.x = row * Math.sin(t * 7) * 0.7; o.rotation.z = (k ? -1 : 1) * (row ? 0.15 * Math.cos(t * 7) : 0.25); });
    // rope from the glowing pod to the hands
    rope.visible = p.mode === 'rope';
    if (rope.visible && hero?.hands) {
      const k = p.throwT > 0 ? 1 - p.throwT / TUNING.throwTime : 1;          // the rope flies from the hands to the branch
      d.copy(FOOT.anchor).sub(hero.hands).multiplyScalar(-k); const len = d.length();
      mid.copy(hero.hands).addScaledVector(d, -0.5);
      rope.position.copy(mid); rope.scale.set(1, len, 1); rope.quaternion.setFromUnitVectors(up, d.normalize());
    }
  };
  return W;
}
