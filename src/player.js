// Twin Moon River — the player: modes, physics, events. Pure logic (runs in Node for tests and in the browser).
//
// modes: foot (run the trail / landing / steps) -> air (jump, fall) -> rope (pendulum under the anchor)
//        -> board (hop from the quay onto the raft) -> raft (ride the river) -> end (lagoon)
// input: { up, left, right, jump (held), jumpPressed (this step only) }
// events (onEvent(name, data)): jump, land, throw, release, collect, respawn, board, bump, beamHit, splash, checkpoint, end
import * as THREE from 'three';
import { FOOT, footGround, footCenter, footWidth, RIVER, riverAt, OBSTACLES, MEDALS, CHECKPOINTS } from './level.js';
import { TUNING as T } from './config.js';

const clamp = THREE.MathUtils.clamp;
const ease = t => t * t * (3 - 2 * t);
const angleTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const tmp = new THREE.Vector3(), center = new THREE.Vector3();

export class Player {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;                 // model faces +Z at yaw 0; forward (-Z) is PI
    this.speed = 0;
    this.airTime = 0;
    this.landT = 0;
    this.rope = { len: 0 };
    this.raft = { s: 0, off: 0, y: 0, vy: 0, speed: 0, duck: false, rowing: false, bump: 0, bumpCool: 0 };
    this.board = null;
    this.medals = new Set();
    this.respawns = 0;
    this.time = 0;
    this.anim = 'idle';
    this.animSpeed = 1;
    this.onEvent = null;
    this.respawnAt('foot', 0);
  }

  emit(e, d) { this.onEvent?.(e, d); }

  respawnAt(half, i) {
    this.checkpoint = { half, i };
    this.vel.set(0, 0, 0); this.speed = 0; this.airTime = 0; this.landT = 0; this.board = null;
    if (half === 'foot') {
      const z = CHECKPOINTS.foot[i].z, x = footCenter(z);
      this.pos.set(x, footGround(x, z), z);
      this.mode = 'foot'; this.yaw = Math.PI;
    } else {
      const r = this.raft, f = riverAt(CHECKPOINTS.raft[i].s);
      Object.assign(r, { s: f.s, off: 0, y: f.y, vy: 0, speed: f.current, duck: false, rowing: false, bump: 0, bumpCool: 0 });
      this.pos.set(f.x, f.y, f.z); this.yaw = Math.atan2(f.tx, f.tz);
      this.mode = 'raft';
    }
  }

  die() {
    this.respawns++;
    this.emit('respawn', this.checkpoint);
    this.respawnAt(this.checkpoint.half, this.checkpoint.i);
  }

  canThrow() {
    if (this.mode !== 'air') return false;
    const z = this.pos.z;
    return z < FOOT.edgeZ + 2 && z > FOOT.anchor.z + 1.5 && this.pos.distanceTo(FOOT.anchor) <= T.ropeMax;
  }

  // the hero's centre (for medals): feet + half height, a little higher when seated on the raft deck
  center() { return center.copy(this.pos).add(tmp.set(0, this.mode === 'raft' || this.mode === 'end' ? 1.0 : 0.65, 0)); }

  update(dt, input) {
    this.time += dt;
    if (this.mode === 'foot') this.updateFoot(dt, input);
    else if (this.mode === 'air') this.updateAir(dt, input);
    else if (this.mode === 'rope') this.updateRope(dt, input);
    else if (this.mode === 'board') this.updateBoard(dt);
    else if (this.mode === 'raft') this.updateRaft(dt, input);
    else if (this.mode === 'end') this.updateEnd(dt);
    this.collect();
  }

  // ---------------------------------------------------------------------------------------------- on foot
  updateFoot(dt, i) {
    this.speed += ((i.up ? T.run : 0) - this.speed) * Math.min(1, T.accel * dt);
    const lat = ((i.right ? 1 : 0) - (i.left ? 1 : 0)) * T.strafe;
    const z0 = this.pos.z, x0 = this.pos.x;
    this.pos.z -= this.speed * dt;
    this.pos.x += footCenter(this.pos.z) - footCenter(z0) + lat * dt;   // follow the trail's bends
    const c = footCenter(this.pos.z), hw = footWidth(this.pos.z) / 2 - 0.45;
    this.pos.x = clamp(this.pos.x, c - hw, c + hw);
    const vx = (this.pos.x - x0) / dt;
    if (this.speed > 0.3 || Math.abs(lat) > 0.1) this.yaw += angleTo(this.yaw, Math.atan2(vx, -Math.max(this.speed, 0.5))) * Math.min(1, 10 * dt);

    const g = footGround(this.pos.x, this.pos.z);
    if (g === -Infinity) {                               // ran off the lip
      this.mode = 'air'; this.airTime = 0; this.vel.set(vx, 0, -this.speed);
    } else {
      this.pos.y = g;
      if (i.jumpPressed) { this.mode = 'air'; this.airTime = 0; this.vel.set(vx, T.jump, -this.speed); this.emit('jump'); }
    }
    this.landT = Math.max(0, this.landT - dt);
    this.anim = this.speed > 0.6 ? 'run' : 'idle';
    this.animSpeed = this.anim === 'run' ? 0.55 + 0.45 * this.speed / T.run : 1;

    // checkpoints along the foot half
    const cps = CHECKPOINTS.foot, k = this.checkpoint.i + 1;
    if (this.mode === 'foot' && this.checkpoint.half === 'foot' && k < cps.length && this.pos.z < cps[k].z) { this.checkpoint = { half: 'foot', i: k }; this.emit('checkpoint', this.checkpoint); }
    if (this.mode === 'foot' && this.pos.z <= FOOT.quayZ + 0.5) this.startBoard();
  }

  // ---------------------------------------------------------------------------------------------- air
  updateAir(dt, i) {
    this.airTime += dt;
    this.vel.y -= T.gravity * dt;
    const lat = ((i.right ? 1 : 0) - (i.left ? 1 : 0)) * T.strafe;
    this.vel.x += (lat - this.vel.x) * Math.min(1, 3 * dt);
    this.pos.addScaledVector(this.vel, dt);
    const c = footCenter(this.pos.z), hw = footWidth(this.pos.z) / 2 - 0.45;
    this.pos.x = clamp(this.pos.x, c - hw, c + hw);
    // the far cliff face: below the landing you hit the wall and slide down
    if (this.pos.z < FOOT.farZ && this.pos.z > FOOT.farZ - 1.5 && this.pos.y < FOOT.landY - 0.05) { this.pos.z = FOOT.farZ + 0.02; this.vel.z = Math.max(0, this.vel.z); }
    // the near cliff face, if you fall back toward it
    if (this.pos.z > FOOT.edgeZ - 0.4 && this.pos.z < FOOT.edgeZ + 1 && this.pos.y < -0.2) { this.pos.z = FOOT.edgeZ - 0.42; this.vel.z = Math.min(0, this.vel.z); }

    const g = footGround(this.pos.x, this.pos.z);
    if (this.vel.y <= 0 && g !== -Infinity && this.pos.y <= g) {
      this.pos.y = g; this.mode = 'foot'; this.speed = Math.max(0, -this.vel.z); this.landT = this.airTime > 0.7 ? 0.25 : 0;
      this.emit('land', { airTime: this.airTime });
      return;
    }
    if (i.jumpPressed && this.canThrow()) {
      this.rope.len = clamp(this.pos.distanceTo(FOOT.anchor), T.ropeMin, T.ropeMax);
      this.mode = 'rope'; this.emit('throw', { len: this.rope.len });
      return;
    }
    if (this.pos.y < T.deathY) { this.die(); return; }
    if (Math.hypot(this.vel.x, this.vel.z) > 0.5) this.yaw += angleTo(this.yaw, Math.atan2(this.vel.x, this.vel.z)) * Math.min(1, 6 * dt);
    this.anim = this.vel.y > -2 || this.airTime < 0.35 ? 'jump' : 'fall';
    this.animSpeed = 1;
  }

  // ---------------------------------------------------------------------------------------------- rope
  updateRope(dt, i) {
    const a = FOOT.anchor;
    this.vel.y -= T.gravity * dt;
    const d = tmp.copy(this.pos).sub(a);
    if (i.up) {                                          // pump: push along the swing while moving forward
      const len = d.length(), tz = d.y / len, ty = -d.z / len;   // tangent pointing forward (-Z) at the bottom
      if (this.vel.y * ty + this.vel.z * tz > 0) { this.vel.y += ty * T.pump * dt; this.vel.z += tz * T.pump * dt; }
    }
    const lat = ((i.right ? 1 : 0) - (i.left ? 1 : 0)) * T.strafe * 0.5;
    this.vel.x += (lat - this.vel.x) * Math.min(1, 3 * dt);
    this.pos.addScaledVector(this.vel, dt);
    this.pos.x = clamp(this.pos.x, a.x - 1.6, a.x + 1.6);
    d.copy(this.pos).sub(a);
    const dist = d.length();
    if (dist > this.rope.len) {
      d.multiplyScalar(1 / dist);
      this.pos.copy(a).addScaledVector(d, this.rope.len);
      const vr = this.vel.dot(d);
      if (vr > 0) this.vel.addScaledVector(d, -vr);
    }
    if (this.pos.z > FOOT.edgeZ - 0.4 && this.pos.y < 0.2) { this.pos.z = FOOT.edgeZ - 0.42; this.vel.z = Math.min(0, this.vel.z); }
    // swung low over the far ledge: drop onto it
    if (this.pos.z < FOOT.farZ && this.pos.y <= FOOT.landY + 0.05) { this.pos.y = FOOT.landY; this.mode = 'foot'; this.speed = Math.max(0, -this.vel.z); this.emit('land', { airTime: 1 }); return; }
    if (i.jumpPressed) {
      this.mode = 'air'; this.airTime = 0.4;
      this.vel.z -= T.releaseBoost; this.vel.y += 1.0;
      this.emit('release');
      return;
    }
    this.yaw += angleTo(this.yaw, Math.PI) * Math.min(1, 4 * dt);
    this.anim = 'hang'; this.animSpeed = 1;
  }

  // ---------------------------------------------------------------------------------------------- board the raft
  startBoard() {
    const f = riverAt(0);
    this.board = { t: 0, from: this.pos.clone(), to: new THREE.Vector3(f.x, f.y, f.z) };
    this.mode = 'board'; this.emit('board');
    Object.assign(this.raft, { s: 0, off: 0, y: f.y, vy: 0, speed: 0, duck: false, rowing: false, bump: 0, bumpCool: 0 });
  }

  updateBoard(dt) {
    const b = this.board;
    b.t = Math.min(1, b.t + dt / 0.75);
    this.pos.lerpVectors(b.from, b.to, ease(b.t));
    this.pos.y += Math.sin(Math.PI * b.t) * 1.6;
    this.anim = 'jump'; this.animSpeed = 1;
    if (b.t >= 1) {
      this.mode = 'raft'; this.board = null;
      this.checkpoint = { half: 'raft', i: 0 };
      this.emit('checkpoint', this.checkpoint);
    }
  }

  // ---------------------------------------------------------------------------------------------- raft
  updateRaft(dt, i) {
    const r = this.raft;
    let f = riverAt(r.s);
    r.duck = !!i.jump; r.rowing = !!i.up && !r.duck;
    r.speed += (f.current + (r.rowing ? T.row : 0) - r.speed) * Math.min(1, 1.6 * dt);
    if (r.bump > 0) { r.bump -= dt; r.speed *= 1 - Math.min(1, 2.5 * dt); }
    r.bumpCool = Math.max(0, r.bumpCool - dt);
    const s0 = r.s;
    r.s += r.speed * dt;
    f = riverAt(r.s);
    const steer = (i.left ? 1 : 0) - (i.right ? 1 : 0);   // +off = the river's left bank
    const hw = f.width / 2 - 1.6;
    r.off = clamp(r.off + steer * T.raftSteer * dt, -hw, hw);

    for (const o of OBSTACLES) {
      if (Math.abs(o.s - r.s) > o.r + T.raftRadius) continue;
      const d = r.off - o.off, min = o.r + T.raftRadius;
      if (Math.abs(d) < min) {
        r.off = clamp(o.off + (d >= 0 ? 1 : -1) * min, -hw, hw);
        if (r.bumpCool <= 0) { r.speed *= 0.5; r.bump = 0.5; r.bumpCool = 0.8; this.emit('bump', o); }
      }
    }
    if (s0 < RIVER.beamS && r.s >= RIVER.beamS && !r.duck) { this.emit('beamHit'); this.die(); return; }

    if (r.y > f.y + 0.05) {                               // over a drop: fall to the new water level
      r.vy -= T.gravity * dt; r.y += r.vy * dt;
      if (r.y <= f.y) { if (r.vy < -4) this.emit('splash', { v: r.vy }); r.y = f.y; r.vy = 0; }
    } else { r.y = f.y; r.vy = 0; }

    this.pos.set(f.x + f.nx * r.off, r.y, f.z + f.nz * r.off);
    this.yaw += angleTo(this.yaw, Math.atan2(f.tx, f.tz) - steer * 0.18) * Math.min(1, 5 * dt);
    this.anim = 'sit'; this.animSpeed = 1;

    const cps = CHECKPOINTS.raft, k = this.checkpoint.i + 1;
    if (this.checkpoint.half === 'raft' && k < cps.length && r.s > cps[k].s) { this.checkpoint = { half: 'raft', i: k }; this.emit('checkpoint', this.checkpoint); }
    if (r.s >= RIVER.endS) { this.mode = 'end'; this.endTime = this.time; this.emit('end', { time: this.time, medals: this.medals.size }); }
  }

  updateEnd(dt) {
    const r = this.raft;
    r.speed *= 1 - Math.min(1, 0.8 * dt);
    r.s += r.speed * dt;
    const f = riverAt(r.s);
    r.y = f.y;
    this.pos.set(f.x + f.nx * r.off, r.y, f.z + f.nz * r.off);
    r.duck = false; r.rowing = false;
    this.anim = 'sitCheer'; this.animSpeed = 1;
  }

  collect() {
    const c = this.center();
    for (let k = 0; k < MEDALS.length; k++) {
      if (this.medals.has(k)) continue;
      const m = MEDALS[k];
      if (Math.abs(m.z - c.z) > 3) continue;
      if (tmp.set(m.x - c.x, m.y - c.y, m.z - c.z).length() < T.collectRadius) { this.medals.add(k); this.emit('collect', k); }
    }
  }
}

// ------------------------------------------------------------------------------------------------ autopilot
// Plays the level like a careful player: used by tests, the browser playtest and ?autopilot.
export function autopilot(p) {
  const i = { up: true, left: false, right: false, jump: false, jumpPressed: false };
  const steer = (dx, dead) => { if (dx > dead) i.right = true; else if (dx < -dead) i.left = true; };
  if (p.mode === 'foot') {
    let tx = footCenter(p.pos.z - 4);
    const k = MEDALS.findIndex((m, k) => !m.river && !p.medals.has(k) && m.z < p.pos.z && m.z > p.pos.z - 12 && Math.abs(m.y - p.pos.y - 0.9) < 0.6);
    if (k >= 0) tx = MEDALS[k].x;
    steer(tx - p.pos.x, 0.12);
    if (p.pos.z < FOOT.edgeZ + 0.9 && p.pos.z > FOOT.farZ) i.jumpPressed = true;
  } else if (p.mode === 'air') {
    if (p.canThrow() && p.pos.z < FOOT.edgeZ - 1.2) i.jumpPressed = true;
    steer(FOOT.anchor.x - p.pos.x, 0.2);
  } else if (p.mode === 'rope') {
    const a = FOOT.anchor, ang = Math.atan2(a.z - p.pos.z, a.y - p.pos.y);   // > 0 once past the anchor
    i.up = p.vel.z < 0;
    if (ang > THREE.MathUtils.degToRad(22) && p.vel.z < 0) i.jumpPressed = true;
  } else if (p.mode === 'raft') {
    const r = p.raft, f = riverAt(r.s), hw = f.width / 2 - 1.8;
    let best = r.off, bestCost = Infinity;
    for (let off = -hw; off <= hw; off += 0.5) {
      let cost = Math.abs(off - r.off) * 0.05;
      for (const o of OBSTACLES) {
        const ahead = o.s - r.s;
        if (ahead < -2 || ahead > 32) continue;
        const gap = Math.abs(off - o.off) - (o.r + T.raftRadius + 0.7);
        if (gap < 0) cost += 100 - gap * 10;
      }
      for (let k = 0; k < MEDALS.length; k++) {
        const m = MEDALS[k]; if (!m.river || p.medals.has(k)) continue;
        const ahead = m.s - r.s; if (ahead < 0 || ahead > 28) continue;
        cost += Math.min(6, Math.abs(off - m.off)) - 6;
      }
      if (cost < bestCost) { bestCost = cost; best = off; }
    }
    if (best > r.off + 0.25) i.left = true; else if (best < r.off - 0.25) i.right = true;
    const toBeam = RIVER.beamS - r.s;
    i.jump = toBeam < 7 && toBeam > -2;
  }
  return i;
}
