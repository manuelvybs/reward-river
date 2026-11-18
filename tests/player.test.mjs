import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player, autopilot } from '../src/player.js';
import { FOOT, RIVER, MEDALS } from '../src/level.js';

const DT = 1 / 60;
const idle = () => ({ up: false, left: false, right: false, jump: false, jumpPressed: false });
function run(p, seconds, inputFn, stop = () => false) {
  const events = [];
  p.onEvent = (e, d) => events.push([e, d]);
  for (let t = 0; t < seconds; t += DT) { p.update(DT, inputFn(p, t)); if (stop(p)) break; }
  return events;
}

test('holding Up runs the trail to the chasm edge', () => {
  const p = new Player();
  run(p, 30, () => ({ ...idle(), up: true }), p => p.pos.z < FOOT.edgeZ + 1);
  assert.equal(p.mode, 'foot');
  assert.ok(p.pos.z < FOOT.edgeZ + 1);
});

test('running off the edge without the rope falls and respawns at the edge checkpoint', () => {
  const p = new Player();
  p.respawnAt('foot', 1);
  const ev = run(p, 12, () => ({ ...idle(), up: true }), p => p.respawns > 0);
  assert.ok(ev.some(([e]) => e === 'respawn'));
  assert.ok(p.pos.z > FOOT.edgeZ && p.pos.z < FOOT.edgeZ + 10);
});

test('jump, throw the rope, release past the anchor: lands on the far side', () => {
  const p = new Player();
  p.respawnAt('foot', 1);
  let jumped = false, thrown = false, released = false;
  const ev = run(p, 20, (p) => {
    const i = { ...idle(), up: true };
    if (!jumped && p.mode === 'foot' && p.pos.z < FOOT.edgeZ + 0.8) { i.jumpPressed = true; jumped = true; }
    else if (jumped && !thrown && p.mode === 'air' && p.canThrow()) { i.jumpPressed = true; thrown = true; }
    else if (thrown && !released && p.mode === 'rope' && p.pos.z < FOOT.anchor.z - 5 && p.vel.z < 0) { i.jumpPressed = true; released = true; }
    return i;
  }, p => released && p.mode === 'foot');
  assert.ok(ev.some(([e]) => e === 'throw'), 'rope thrown');
  assert.equal(p.mode, 'foot');
  assert.ok(p.pos.z < FOOT.farZ, `landed at z=${p.pos.z.toFixed(1)}`);
  assert.equal(p.respawns, 0);
});

test('reaching the quay boards the raft', () => {
  const p = new Player();
  p.respawnAt('foot', 2);
  run(p, 30, () => ({ ...idle(), up: true }), p => p.mode === 'raft');
  assert.equal(p.mode, 'raft');
  assert.ok(p.raft.s < 2);
});

test('not ducking at the antenna beam knocks you back to the checkpoint; ducking passes', () => {
  const a = new Player(); a.respawnAt('raft', 1);
  const ev = run(a, 30, () => ({ ...idle(), up: true }), p => p.respawns > 0 || p.raft.s > RIVER.beamS + 5);
  assert.ok(ev.some(([e]) => e === 'beamHit'));
  assert.ok(a.raft.s < RIVER.beamS);

  const b = new Player(); b.respawnAt('raft', 1);
  run(b, 30, (p) => ({ ...idle(), up: true, jump: RIVER.beamS - p.raft.s < 6 }), p => p.raft.s > RIVER.beamS + 5);
  assert.ok(b.raft.s > RIVER.beamS + 5);
  assert.equal(b.respawns, 0);
});

test('autopilot plays the whole level: lagoon reached, no respawns, most medals', () => {
  const p = new Player();
  let t = 0;
  const ev = [];
  p.onEvent = (e) => ev.push(e);
  for (; t < 200 && p.mode !== 'end'; t += DT) p.update(DT, autopilot(p));
  assert.equal(p.mode, 'end', `stuck in ${p.mode} at z=${p.pos.z.toFixed(1)} s=${p.raft.s.toFixed(1)}`);
  assert.equal(p.respawns, 0);
  assert.ok(t < 150, `took ${t.toFixed(1)} s`);
  assert.ok(p.medals.size >= MEDALS.length / 2, `${p.medals.size}/${MEDALS.length} medals`);
  console.log(`autopilot: ${t.toFixed(1)} s, ${p.medals.size}/${MEDALS.length} medals, events ${[...new Set(ev)].join(' ')}`);
});
