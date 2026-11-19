import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player, autopilot } from '../src/player.js';
import { FOOT, RIVER, MEDALS, ROOTS, GIFTCARDS, STAR_VALUE } from '../src/level.js';

const DT = 1 / 60;
const idle = () => ({ up: false, down: false, left: false, right: false, jump: false, jumpPressed: false });
function run(p, seconds, inputFn, stop = () => false) {
  const events = [];
  p.onEvent = (e, d) => events.push([e, d]);
  for (let t = 0; t < seconds; t += DT) { p.update(DT, inputFn(p, t)); if (stop(p)) break; }
  return events;
}

test('running into a root without jumping trips you back', () => {
  const p = new Player();
  const ev = run(p, 10, () => ({ ...idle(), up: true }), p => p.pos.z < ROOTS[0].z - 1 || p.stumble > 0);
  assert.ok(ev.some(([e]) => e === 'stumble'));
  assert.ok(p.pos.z > ROOTS[0].z, 'stayed on the near side of the root');
});

test('jumping the roots (autopilot on foot) reaches the chasm edge without tripping', () => {
  const p = new Player();
  const ev = run(p, 30, p => ({ ...autopilot(p), jumpPressed: autopilot(p).jumpPressed && p.pos.z > FOOT.edgeZ + 1.5 }), p => p.pos.z < FOOT.edgeZ + 1.5);
  assert.ok(!ev.some(([e]) => e === 'stumble'));
  assert.equal(p.mode, 'foot');
  assert.ok(p.pos.z < FOOT.edgeZ + 1.5);
});

test('↓ walks back', () => {
  const p = new Player(); p.respawnAt('foot', 1);
  const z0 = p.pos.z;
  run(p, 1.5, () => ({ ...idle(), down: true }));
  assert.ok(p.pos.z > z0 + 2);
  assert.equal(p.anim, 'walk');
});

test('running off the edge without the rope falls and respawns at the edge checkpoint', () => {
  const p = new Player();
  p.respawnAt('foot', 1);
  const ev = run(p, 12, () => ({ ...idle(), up: true }), p => p.respawns > 0);
  assert.ok(ev.some(([e]) => e === 'respawn'));
  assert.ok(p.pos.z > FOOT.edgeZ && p.pos.z < FOOT.edgeZ + 10);
});

test('a jump pressed just after running off the lip still works (grace window)', () => {
  const p = new Player(); p.respawnAt('foot', 1);
  let jumped = false;
  const ev = run(p, 6, (p) => { const i = { ...idle(), up: true }; if (!jumped && p.mode === 'air' && p.airTime > 0.05) { i.jumpPressed = true; jumped = true; } return i; }, p => jumped && p.vel.y < 0 && p.airTime > 0.3);
  assert.ok(ev.some(([e]) => e === 'jump'));
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

test('holding Space from the jump fires the rope on its own', () => {
  const p = new Player(); p.respawnAt('foot', 1);
  let jumped = false;
  const ev = run(p, 6, (p) => { const i = { ...idle(), up: true, jump: jumped }; if (!jumped && p.pos.z < FOOT.edgeZ + 0.8) { i.jumpPressed = true; jumped = true; } return i; }, p => p.mode === 'rope');
  assert.equal(p.mode, 'rope');
  assert.ok(ev.some(([e]) => e === 'throw'));
});

test('from the landing: climb the steps and board the raft', () => {
  const p = new Player();
  p.respawnAt('foot', 2);
  run(p, 30, p => autopilot(p), p => p.mode === 'raft');
  assert.equal(p.mode, 'raft');
  assert.ok(p.raft.s < 2);
});

test('steering into the bank bounces the raft off it', () => {
  const p = new Player(); p.respawnAt('raft', 0);
  const ev = run(p, 4, () => ({ ...idle(), left: true }), p => p.raft.bump > 0);
  assert.ok(ev.some(([e, d]) => e === 'bump' && d?.bank));
  assert.ok(p.raft.vd < 0, 'pushed back off the bank');
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

test('gift cards sit on both halves, worth $5 to $25', () => {
  assert.ok(GIFTCARDS.some(c => !c.river) && GIFTCARDS.filter(c => c.river).length >= 4);
  assert.ok(GIFTCARDS.every(c => [5, 10, 25].includes(c.value)));
});

test('a gift card is collected once and adds its value to the rewards', () => {
  const p = new Player();
  const ev = [];
  p.onEvent = (e, d) => ev.push([e, d]);
  const k = GIFTCARDS.findIndex(c => c.river);
  const c = GIFTCARDS[k];
  p.respawnAt('raft', 0);
  p.pos.set(c.x, c.y - 1.0, c.z);                        // seated on the raft right under the card
  p.collect(); p.collect();
  assert.equal(ev.filter(([e]) => e === 'card').length, 1);
  assert.equal(p.cards.size, 1);
  assert.equal(p.rewards, c.value + p.medals.size * STAR_VALUE);
});

test('autopilot plays the whole level: lagoon reached, no respawns, no trips, most medals', () => {
  const p = new Player();
  let t = 0;
  const ev = [];
  p.onEvent = (e) => ev.push(e);
  for (; t < 200 && p.mode !== 'end'; t += DT) p.update(DT, autopilot(p));
  assert.equal(p.mode, 'end', `stuck in ${p.mode} at z=${p.pos.z.toFixed(1)} s=${p.raft.s.toFixed(1)}`);
  assert.equal(p.respawns, 0);
  assert.ok(!ev.includes('stumble'), 'tripped on a root');
  assert.ok(t < 150, `took ${t.toFixed(1)} s`);
  assert.ok(p.medals.size >= MEDALS.length / 2, `${p.medals.size}/${MEDALS.length} medals`);
  assert.ok(p.cards.size >= 5, `${p.cards.size}/${GIFTCARDS.length} gift cards`);
  console.log(`autopilot: ${t.toFixed(1)} s, ${p.medals.size}/${MEDALS.length} medals, ${p.cards.size}/${GIFTCARDS.length} cards, rewards ${p.rewards.toFixed(2)}, ${ev.filter(e => e === 'bump').length} bumps, events ${[...new Set(ev)].join(' ')}`);
});
