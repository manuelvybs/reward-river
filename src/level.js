// Twin Moon River — the course as analytic functions. No scene objects here: this module runs in Node (tests,
// headless autopilot) and in the browser. Forward is -Z. Meters.
//
//   canyon trail -> chasm (rope swing between two giant stone helmets) -> landing -> crystal steps -> quay
//   -> pod-raft down the river through a flooded colony -> antenna beam (duck) -> crashed-rocket arch
//   -> rapids (three drops) -> lagoon
import * as THREE from 'three';

const ease = t => t * t * (3 - 2 * t);

// piecewise table on z (keys sorted by decreasing z), eased between keys, clamped at both ends
export function table(keys) {
  return z => {
    if (z >= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (z >= keys[i][0]) {
        const [z0, v0] = keys[i - 1], [z1, v1] = keys[i];
        return v0 + (v1 - v0) * ease((z - z0) / (z1 - z0));
      }
    }
    return keys[keys.length - 1][1];
  };
}

// ------------------------------------------------------------------------------------------------ on foot
export const FOOT = {
  startZ: 18,
  edgeZ: -56,           // near lip of the chasm
  farZ: -74,            // far lip
  landY: -2.6,          // landing plateau height
  stepsZ0: -94, stepsZ1: -106, stepN: 14, stepTop: 3.6,
  quayZ: -116,          // end of the quay: the raft waits below
  anchor: new THREE.Vector3(0, 12.5, -65),   // rope anchor: the glowing alien branch
};
export const footCenter = table([[20, 0], [2, 0], [-14, 1.4], [-28, -1.1], [-42, 0.5], [-52, 0], [-80, 0], [-86, 1.0], [-93, 0], [-130, 0]]);
export const footWidth = table([[20, 6.0], [-36, 5.6], [-48, 5.0], [-56, 4.6], [-74, 4.4], [-90, 4.6], [-93, 3.8], [-106, 3.8], [-109, 9.0], [-130, 10]]);
const bumps = z => 0.22 * Math.sin(z * 0.13) + 0.1 * Math.sin(z * 0.37 + 1.1);

// walkable height at (x, z); -Infinity over the chasm (and past the quay: the river)
export function footGround(x, z) {
  if (z > FOOT.edgeZ) return bumps(z) * (1 - ease(Math.min(1, Math.max(0, (z - (FOOT.edgeZ + 8)) / -8)))) * (z < 14 ? 1 : (18 - z) / 4);
  if (z > FOOT.farZ) return -Infinity;
  if (z > FOOT.stepsZ0) return FOOT.landY;
  if (z > FOOT.stepsZ1) {
    const i = Math.min(FOOT.stepN, Math.floor((FOOT.stepsZ0 - z) / ((FOOT.stepsZ0 - FOOT.stepsZ1) / FOOT.stepN)) + 1);
    return FOOT.landY + i * (FOOT.stepTop - FOOT.landY) / FOOT.stepN;
  }
  if (z > FOOT.quayZ - 2.5) return FOOT.stepTop;
  return -Infinity;
}

// ------------------------------------------------------------------------------------------------ the river
const RIVER_XZ = [[2, -118], [5, -132], [10, -150], [10, -172], [3, -196], [-6, -228], [-4, -262], [6, -296], [8, -330],
  [2, -362], [-3, -395], [0, -428], [0, -460], [0, -500], [0, -540], [0, -580], [0, -640]];
const level = table([[-118, 3.0], [-476, 3.0], [-480, 2.4], [-484, 0.4], [-503, 0.1], [-507, -1.6], [-511, -2.2], [-527, -2.4],
  [-531, -4.6], [-535, -5.2], [-700, -5.2]]);
const width = table([[-118, 14], [-150, 13], [-200, 22], [-440, 22], [-470, 18], [-540, 18], [-566, 54], [-700, 80]]);
const current = table([[-118, 4.5], [-200, 5.5], [-460, 6.0], [-474, 9.5], [-540, 10.5], [-562, 4.0], [-600, 1.5], [-700, 0.6]]);

const curve = new THREE.CatmullRomCurve3(RIVER_XZ.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
const N = 1400;
const PTS = curve.getSpacedPoints(N);
const LEN = curve.getLength();
const STEP = LEN / N;

// river frame at arc length s (clamped): center, water height, width, current speed, tangent and left normal
export function riverAt(s) {
  const f = Math.min(N - 1e-6, Math.max(0, s / STEP)), i = Math.floor(f), t = f - i;
  const a = PTS[i], b = PTS[i + 1];
  const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
  let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
  return { s: Math.min(LEN, Math.max(0, s)), x, z, y: level(z), width: width(z), current: current(z), tx, tz, nx: tz, nz: -tx };
}
// arc length where the river centre crosses z (z decreases along the river)
export function sAtZ(z) {
  if (z >= PTS[0].z) return 0;
  for (let i = 1; i <= N; i++) if (PTS[i].z <= z) { const a = PTS[i - 1], b = PTS[i]; return (i - 1 + (a.z - z) / (a.z - b.z)) * STEP; }
  return LEN;
}

export const RIVER = { startZ: -118, endZ: -605, beamZ: -370, archZ: -450, length: LEN, level, width, current };
RIVER.endS = sAtZ(RIVER.endZ);
RIVER.beamS = sAtZ(RIVER.beamZ);
RIVER.archS = sAtZ(RIVER.archZ);
RIVER.drops = [-481, -508, -532].map(sAtZ);

// obstacles in the water: s along the river, lateral offset from the centre (+ = left normal), radius, kind
const OB = [
  [-160, -4, 2.2, 'bust'], [-205, 6, 1.4, 'pillar'], [-205, -7, 1.4, 'pillar'], [-240, 3.5, 2.2, 'bust'],
  [-280, -5, 2.2, 'bust'], [-280, 7.5, 1.4, 'pillar'], [-315, 0, 1.6, 'rock'], [-345, 6, 2.2, 'bust'],
  [-400, -6.5, 1.4, 'pillar'], [-400, 6.5, 1.4, 'pillar'], [-425, -3, 2.2, 'bust'],
  [-492, 4, 1.5, 'rock'], [-518, -4, 1.5, 'rock'], [-546, 3, 1.5, 'rock'],
];
export const OBSTACLES = OB.map(([z, off, r, kind]) => { const s = sAtZ(z); const f = riverAt(s);
  return { s, off, r, kind, x: f.x + f.nx * off, z: f.z + f.nz * off, y: f.y }; });

// gold star medals
const M_FOOT = [[1.2, 8], [-1.4, -4], [1.4, -16], [-1.2, -27], [1.0, -37], [-0.8, -47]];
const M_RIVER = [[-2, -140], [3, -185], [-4, -222], [4, -256], [-3, -300], [2, -334], [-4, -358], [4, -390], [0, -414],
  [-3, -440], [2, -466], [-3, -497], [3, -522], [-2, -556], [0, -588]];
export const MEDALS = [
  ...M_FOOT.map(([x, z]) => ({ x: footCenter(z) + x, y: footGround(footCenter(z) + x, z) + 0.9, z })),
  { x: 0, y: 1.2, z: -60.5 }, { x: 0, y: 0.1, z: -65 }, { x: 0, y: 1.2, z: -69.5 },        // along the rope arc
  { x: 0.8, y: FOOT.landY + 0.9, z: -84 }, { x: 0, y: FOOT.stepTop + 0.9, z: -110 },
  ...M_RIVER.map(([off, z]) => { const s = sAtZ(z), f = riverAt(s);
    return { river: true, s, off, x: f.x + f.nx * off, y: f.y + 1.0, z: f.z + f.nz * off }; }),
];

export const CHECKPOINTS = {
  foot: [{ z: FOOT.startZ - 2 }, { z: FOOT.edgeZ + 6 }, { z: FOOT.farZ - 4 }],
  raft: [{ s: 0 }, { s: RIVER.beamS - 40 }, { s: sAtZ(-462) }],
};
