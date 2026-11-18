import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOOT, footGround, footCenter, footWidth, RIVER, riverAt, sAtZ, OBSTACLES, MEDALS, CHECKPOINTS } from '../src/level.js';

test('trail ground is walkable before the edge, a hole over the chasm, then the landing', () => {
  for (let z = FOOT.startZ; z > FOOT.edgeZ; z -= 1.7) assert.ok(Number.isFinite(footGround(footCenter(z), z)), `z=${z}`);
  for (let z = FOOT.edgeZ - 0.1; z > FOOT.farZ; z -= 1) assert.equal(footGround(0, z), -Infinity, `z=${z}`);
  assert.equal(footGround(0, FOOT.farZ - 1), FOOT.landY);
});

test('the stairs climb in equal steps from the landing to the quay', () => {
  const ys = [];
  for (let z = FOOT.stepsZ0 + 0.01; z > FOOT.stepsZ1 - 0.5; z -= 0.05) ys.push(footGround(0, z));
  const levels = [...new Set(ys.map(y => y.toFixed(3)))].map(Number);
  assert.equal(levels.length, FOOT.stepN + 1);
  assert.equal(levels.at(-1), FOOT.stepTop);
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] > levels[i - 1]);
  assert.equal(footGround(0, FOOT.quayZ + 1), FOOT.stepTop);
});

test('trail width stays playable', () => {
  for (let z = FOOT.startZ; z > FOOT.quayZ; z -= 2) assert.ok(footWidth(z) >= 3.4, `z=${z} w=${footWidth(z)}`);
});

test('the river starts beside the quay, below it, and runs to the lagoon', () => {
  const r0 = riverAt(0);
  assert.ok(Math.abs(r0.z - RIVER.startZ) < 0.5);
  assert.ok(r0.y < FOOT.stepTop && r0.y > FOOT.stepTop - 2);
  assert.ok(RIVER.length > 450);
  assert.ok(riverAt(RIVER.endS).z <= RIVER.endZ + 0.5);
});

test('sAtZ inverts riverAt', () => {
  for (const s of [0, 37, 120, 260, 400, RIVER.endS]) assert.ok(Math.abs(sAtZ(riverAt(s).z) - s) < 0.6, `s=${s}`);
});

test('the water drops through the rapids and is calm before them', () => {
  assert.equal(riverAt(sAtZ(-300)).y, riverAt(sAtZ(-200)).y);
  assert.ok(riverAt(sAtZ(-560)).y < riverAt(sAtZ(-460)).y - 6);
});

test('every obstacle row leaves a gap the raft fits through', () => {
  const RAFT = 1.4;
  const rows = new Map();
  for (const o of OBSTACLES) { const k = Math.round(o.s / 4); rows.set(k, [...(rows.get(k) || []), o]); }
  for (const [, row] of rows) {
    const half = riverAt(row[0].s).width / 2 - 1.2;
    const blocks = row.map(o => [o.off - o.r - RAFT, o.off + o.r + RAFT]).sort((a, b) => a[0] - b[0]);
    let x = -half, free = false;
    for (const [a, b] of blocks) { if (a > x) { free = true; break; } x = Math.max(x, b); }
    if (x < half) free = true;
    assert.ok(free, `no gap at s=${row[0].s}`);
  }
});

test('medals and checkpoints exist for both halves', () => {
  assert.ok(MEDALS.length >= 20);
  assert.ok(MEDALS.some(m => m.z > FOOT.edgeZ) && MEDALS.some(m => m.river));
  assert.ok(CHECKPOINTS.foot.length >= 3 && CHECKPOINTS.raft.length >= 3);
  assert.ok(RIVER.beamS > 0 && RIVER.archS > RIVER.beamS && RIVER.endS > RIVER.archS);
});
