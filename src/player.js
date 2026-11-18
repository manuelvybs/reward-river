// Reward River — the player: modes, physics, events. Pure logic (runs in Node for tests and in the browser).
//
// modes: foot (run the trail / landing / steps) -> air (jump, fall, stumble) -> rope (pendulum under the anchor)
//        -> board (hop from the quay onto the raft) -> raft (ride the river) -> end (lagoon)
// input: { up, down, left, right, jump (held), jumpPressed (this step only) }
// events (onEvent(name, data)): jump, land, stumble, throw, release, collect, respawn, board, bump, beamHit, splash,
//                               checkpoint, end
import * as THREE from 'three';
import { FOOT, footGround, footCenter, footWidth, RIVER, riverAt, OBSTACLES, MEDALS, CHECKPOINTS, ROOTS, COLLIDERS } from './level.js';
import { TUNING as T } from './config.js';

const clamp = THREE.MathUtils.clamp;
const ease = t => t * t * (3 - 2 * t);
const angleTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const tmp = new THREE.Vector3(), center = new THREE.Vector3();
const axis = i => ((i.right ? 1 : 0) - (i.left ? 1 : 0));

export class Player {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;                 // model faces +Z at yaw 0; forward (-Z) is PI
    this.speed = 0;                     // along the trail, + = forward
    this.airTime = 0; this.coyote = 0; this.jumpBuf = 0; this.stumble = 0; this.throwT = 0;
    this.rope = { len: 0 };
    this.raft = { s: 0, off: 0, vd: 0, y: 0, vy: 0, speed: 0, duck: false, rowing: false, bump: 0, bumpCool: 0 };
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
    this.vel.set(0, 0, 0); this.speed = 0; this.airTime = 0; this.coyote = 0; this.jumpBuf = 0; this.stumble = 0; this.throwT = 0; this.board = null;
    if (half === 'foot') {
      const z = CHECKPOINTS.foot[i].z, x = footCenter(z);
      this.pos.set(x, footGround(x, z), z);
      this.mode = 'foot'; this.yaw = Math.PI;
    } else {
      const r = this.raft, f = riverAt(CHECKPOINTS.raft[i].s);
      Object.assign(r, { s: f.s, off: 0, vd: 0, y: f.y, vy: 0, speed: f.current, duck: false, rowing: false, bump: 0, bumpCool: 0 });
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
  center() { return center.copy(this.pos).add(tmp.set(0, this.mode === 'raft' || this.mode === 'end' ? 1.0 : 0.7, 0)); }

  update(dt, input) {
    this.time += dt;
    this.jumpBuf = input.jumpPressed ? T.jumpBuffer : Math.max(0, this.jumpBuf - dt);
    if (this.mode === 'foot') this.updateFoot(dt, input);
    else if (this.mode === 'air') this.updateAir(dt, input);
    else if (this.mode === 'rope') this.updateRope(dt, input);
    else if (this.mode === 'board') this.updateBoard(dt);
    else if (this.mode === 'raft') this.updateRaft(dt, input);
    else if (this.mode === 'end') this.updateEnd(dt);
    this.collect();
  }

  // the canyon walls, boulders and roots (shared by foot and air)
  collide(prevZ) {
    const c = footCenter(this.pos.z), hw = footWidth(this.pos.z) / 2 - 0.45;
    if (this.pos.y > -3) this.pos.x = clamp(this.pos.x, c - hw, c + hw);
    for (const o of COLLIDERS) {
      const dx = this.pos.x - o.x, dz = this.pos.z - o.z, r = o.r + 0.35, d2 = dx * dx + dz * dz;
      if (d2 < r * r && this.pos.y < 3 + footGround(o.x, o.z)) { const d = Math.sqrt(d2) || 1; this.pos.x = o.x + dx / d * r; this.pos.z = o.z + dz / d * r; }
    }
    for (const o of ROOTS) {
      const xx = this.pos.x - footCenter(o.z);
      if (xx < o.x0 - 0.3 || xx > o.x1 + 0.3) continue;
      const crossed = (prevZ - o.z) * (this.pos.z - o.z) < 0;
      if (!crossed && Math.abs(this.pos.z - o.z) > 0.45) continue;
      const top = footGround(this.pos.x, o.z) + o.h;
      if (this.pos.y >= top - 0.05) continue;
      const side = Math.sign(prevZ - o.z) || 1;
      this.pos.z = o.z + 0.46 * side;
      if (this.mode === 'foot' && Math.abs(this.speed) > 1) {          // tripped: bounce back, slowed for a moment
        this.mode = 'air'; this.airTime = 0; this.coyote = 0;
        this.vel.set(0, 3.5, 1.5 * side); this.speed = 0; this.stumble = T.stumble;
        this.emit('stumble', o);
      } else { this.vel.z = 0.5 * side; this.speed = 0; }
      return;
    }
  }

  // ---------------------------------------------------------------------------------------------- on foot
  updateFoot(dt, i) {
    this.stumble = Math.max(0, this.stumble - dt);
    const want = ((i.up ? 1 : 0) - (i.down ? T.back : 0)) * T.run * (this.stumble > 0 ? 0.35 : 1);
    this.speed += (want - this.speed) * Math.min(1, T.accel * dt);
    const lat = axis(i) * T.strafe;
    const z0 = this.pos.z, x0 = this.pos.x;
    this.pos.z -= this.speed * dt;
    this.pos.x += footCenter(this.pos.z) - footCenter(z0) + lat * dt;   // follow the trail's bends
    this.collide(z0);
    if (this.mode !== 'foot') return;                                  // tripped on a root
    const vx = (this.pos.x - x0) / dt;
    if (Math.abs(this.speed) > 0.3 || Math.abs(lat) > 0.1) this.yaw += angleTo(this.yaw, Math.atan2(vx, -this.speed || -0.01)) * Math.min(1, 12 * dt);

    const g = footGround(this.pos.x, this.pos.z);
    if (g === -Infinity) {                               // ran off the lip: a short grace to still jump
      this.mode = 'air'; this.airTime = 0; this.coyote = T.coyote; this.vel.set(vx, 0, -this.speed);
    } else {
      this.pos.y = g;
      if (this.jumpBuf > 0) { this.jumpBuf = 0; this.mode = 'air'; this.airTime = 0; this.coyote = 0; this.vel.set(vx, T.jump, -this.speed); this.emit('jump'); }
    }
    const hs = Math.abs(this.speed);
    this.anim = hs > T.walkBelow ? 'run' : hs > 0.6 ? 'walk' : 'idle';
    this.animSpeed = this.anim === 'run' ? 0.85 + hs / T.run * 0.35 : this.anim === 'walk' ? 0.7 + hs / 3 : 1;

    const cps = CHECKPOINTS.foot, k = this.checkpoint.i + 1;
    if (this.mode === 'foot' && this.checkpoint.half === 'foot' && k < cps.length && this.pos.z < cps[k].z) { this.checkpoint = { half: 'foot', i: k }; this.emit('checkpoint', this.checkpoint); }
    if (this.mode === 'foot' && this.pos.z <= FOOT.quayZ + 0.5) this.startBoard();
  }

  // ---------------------------------------------------------------------------------------------- air
  updateAir(dt, i) {
    this.airTime += dt;
    this.coyote = Math.max(0, this.coyote - dt);
    if (this.coyote > 0 && this.jumpBuf > 0) { this.jumpBuf = 0; this.coyote = 0; this.vel.y = T.jump; this.emit('jump'); }
    this.vel.y -= T.gravity * dt;
    this.vel.x += (axis(i) * T.strafe - this.vel.x) * Math.min(1, 3 * dt);
    const z0 = this.pos.z;
    this.pos.addScaledVector(this.vel, dt);
    this.collide(z0);
    // cliff faces of the chasm: below the far landing you hit the wall and slide; falling back hits the near wall
    if (this.pos.z < FOOT.farZ && this.pos.z > FOOT.farZ - 1.5 && this.pos.y < FOOT.landY - 0.05) { this.pos.z = FOOT.farZ + 0.02; this.vel.z = Math.max(0, this.vel.z); }
    if (this.pos.z > FOOT.edgeZ - 0.4 && this.pos.z < FOOT.edgeZ + 1 && this.pos.y < -0.2) { this.pos.z = FOOT.edgeZ - 0.42; this.vel.z = Math.min(0, this.vel.z); }

    const g = footGround(this.pos.x, this.pos.z);
    if (this.vel.y <= 0 && g !== -Infinity && this.pos.y <= g) {
      this.pos.y = g; this.mode = 'foot'; this.speed = Math.max(0, -this.vel.z);
      this.emit('land', { airTime: this.airTime });
      return;
    }
    // the rope: press Space near the branch, or keep Space held from the jump and it flies on its own
    if (this.canThrow() && (this.jumpBuf > 0 || (i.jump && this.vel.y < T.holdGrapple))) { this.attach(); return; }
    if (this.pos.y < T.deathY) { this.die(); return; }
    if (Math.hypot(this.vel.x, this.vel.z) > 0.5) this.yaw += angleTo(this.yaw, Math.atan2(this.vel.x, this.vel.z)) * Math.min(1, 6 * dt);
    this.anim = this.vel.y > -2 || this.airTime < 0.35 ? 'jump' : 'fall';
    this.animSpeed = 1.25;
  }

  // ---------------------------------------------------------------------------------------------- rope
  attach() {
    const a = FOOT.anchor;
    this.jumpBuf = 0;
    this.rope.len = clamp(this.pos.distanceTo(a), T.ropeMin, T.ropeMax);
    const n = tmp.copy(this.pos).sub(a).normalize();
    this.vel.addScaledVector(n, -this.vel.dot(n));          // keep only the speed along the swing
    this.throwT = T.throwTime;
    this.mode = 'rope'; this.emit('throw', { len: this.rope.len });
  }

  updateRope(dt, i) {
    const a = FOOT.anchor;
    this.throwT = Math.max(0, this.throwT - dt);
    this.vel.y -= T.gravity * dt;
    const d = tmp.copy(this.pos).sub(a);
    if (i.up) {                                          // pump: push along the swing while moving forward
      const len = d.length(), tz = d.y / len, ty = -d.z / len;   // tangent pointing forward (-Z) at the bottom
      if (this.vel.y * ty + this.vel.z * tz > 0) { this.vel.y += ty * T.pump * dt; this.vel.z += tz * T.pump * dt; }
    }
    this.vel.x += (axis(i) * T.strafe * 0.5 - this.vel.x) * Math.min(1, 3 * dt);
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
    if (this.pos.z < FOOT.farZ && this.pos.y <= FOOT.landY + 0.05) { this.pos.y = FOOT.landY; this.mode = 'foot'; this.speed = Math.max(0, -this.vel.z); this.emit('land', { airTime: 1 }); return; }
    if (this.jumpBuf > 0 && this.throwT < 0.05) {
      this.jumpBuf = 0;
      this.mode = 'air'; this.airTime = 0.4;
      this.vel.z -= T.releaseBoost; this.vel.y += 1.0;
      this.emit('release');
      return;
    }
    this.swingAngle = Math.atan2(a.z - this.pos.z, a.y - this.pos.y);   // > 0 once past the anchor
    this.yaw += angleTo(this.yaw, Math.PI) * Math.min(1, 4 * dt);
    this.anim = this.throwT > 0 ? 'throw' : 'hang'; this.animSpeed = this.throwT > 0 ? 1.4 : 1;
  }

  // ---------------------------------------------------------------------------------------------- board the raft
  startBoard() {
    const f = riverAt(0);
    this.board = { t: 0, from: this.pos.clone(), to: new THREE.Vector3(f.x, f.y, f.z) };
    this.mode = 'board'; this.emit('board');
    Object.assign(this.raft, { s: 0, off: 0, vd: 0, y: f.y, vy: 0, speed: 0, duck: false, rowing: false, bump: 0, bumpCool: 0 });
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
  bumpRaft(strength, data) {
    const r = this.raft;
    if (r.bumpCool > 0) return;
    r.speed *= 1 - strength; r.bump = 0.5; r.bumpCool = 0.6;
    this.emit('bump', data);
  }

  updateRaft(dt, i) {
    const r = this.raft;
    let f = riverAt(r.s);
    r.duck = !!i.jump; r.rowing = !!i.up && !r.duck;
    const target = f.current + (r.rowing ? T.row : 0) - (r.duck ? T.duckDrag : 0) - (i.down ? T.brake : 0);
    r.speed += (Math.max(0.5, target) - r.speed) * Math.min(1, 1.6 * dt);
    if (r.bump > 0) r.bump -= dt;
    r.bumpCool = Math.max(0, r.bumpCool - dt);
    const s0 = r.s;
    r.s += r.speed * dt;
    f = riverAt(r.s);

    // sideways drift with momentum (+off = the river's left bank); bounce off the banks
    r.vd += axis({ left: i.right, right: i.left }) * T.raftSteerAccel * dt;
    r.vd *= Math.exp(-T.raftSteerDamp * dt);
    r.off += r.vd * dt;
    const lim = f.width / 2 - 1.6;
    if (Math.abs(r.off) > lim) {
      const sg = Math.sign(r.off); r.off = sg * lim;
      if (Math.abs(r.vd) > T.bankBounce) this.bumpRaft(0.35, { bank: sg });
      r.vd = -sg * T.bankBounce;
    }
    for (const o of OBSTACLES) {
      if (Math.abs(o.s - r.s) > o.r + T.raftRadius) continue;
      const d = r.off - o.off, min = o.r + T.raftRadius;
      if (Math.abs(d) < min) {
        const sg = d >= 0 ? 1 : -1;
        r.off = clamp(o.off + sg * min, -lim, lim); r.vd = sg * 2;
        this.bumpRaft(0.5, o);
      }
    }
    if (s0 < RIVER.beamS && r.s >= RIVER.beamS && !r.duck) { this.emit('beamHit'); this.die(); return; }

    if (r.y > f.y + 0.05) {                               // over a drop: fall to the new water level
      r.vy -= T.gravity * dt; r.y += r.vy * dt;
      if (r.y <= f.y) { if (r.vy < -4) this.emit('splash', { v: r.vy }); r.y = f.y; r.vy = 0; }
    } else { r.y = f.y; r.vy = 0; }

    this.pos.set(f.x + f.nx * r.off, r.y, f.z + f.nz * r.off);
    this.yaw += angleTo(this.yaw, Math.atan2(f.tx, f.tz) + r.vd * 0.06) * Math.min(1, 5 * dt);
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
  const i = { up: true, down: false, left: false, right: false, jump: false, jumpPressed: false };
  const steer = (dx, dead) => { if (dx > dead) i.right = true; else if (dx < -dead) i.left = true; };
  if (p.mode === 'foot') {
    let tx = footCenter(p.pos.z - 4);
    const k = MEDALS.findIndex((m, k) => !m.river && !p.medals.has(k) && m.z < p.pos.z && m.z > p.pos.z - 12 && m.y - p.pos.y < 1.2);
    if (k >= 0) tx = MEDALS[k].x;
    for (const o of COLLIDERS) {                          // run around boulders
      const ahead = p.pos.z - o.z;
      if (ahead > 0 && ahead < 7 && Math.abs(tx - o.x) < o.r + 1.0) tx = o.x + (o.x > footCenter(o.z) ? -1 : 1) * (o.r + 1.2);
    }
    steer(tx - p.pos.x, 0.12);
    const root = ROOTS.find(o => { const ahead = p.pos.z - o.z, xx = p.pos.x - footCenter(o.z); return ahead > 0.6 && ahead < 1.6 && xx > o.x0 - 0.4 && xx < o.x1 + 0.4; });
    if (root || (p.pos.z < FOOT.edgeZ + 0.9 && p.pos.z > FOOT.farZ)) i.jumpPressed = true;
  } else if (p.mode === 'air') {
    i.jump = p.pos.z < FOOT.edgeZ + 1;                    // hold Space from the jump: the rope fires on its own
    steer(FOOT.anchor.x - p.pos.x, 0.2);
  } else if (p.mode === 'rope') {
    i.up = p.vel.z < 0;
    if (p.swingAngle > THREE.MathUtils.degToRad(22) && p.vel.z < 0) i.jumpPressed = true;
  } else if (p.mode === 'raft') {
    const r = p.raft, f = riverAt(r.s), hw = f.width / 2 - 1.8;
    let best = r.off, bestCost = Infinity;
    for (let off = -hw; off <= hw; off += 0.5) {
      let cost = Math.abs(off - r.off) * 0.05;
      for (const o of OBSTACLES) {
        const ahead = o.s - r.s;
        if (ahead < -2 || ahead > 34) continue;
        const gap = Math.abs(off - o.off) - (o.r + T.raftRadius + 0.8);
        if (gap < 0) cost += 100 - gap * 10;
      }
      for (let k = 0; k < MEDALS.length; k++) {
        const m = MEDALS[k]; if (!m.river || p.medals.has(k)) continue;
        const ahead = m.s - r.s; if (ahead < 0 || ahead > 28) continue;
        cost += Math.min(6, Math.abs(off - m.off)) - 6;
      }
      if (cost < bestCost) { bestCost = cost; best = off; }
    }
    const wantVd = clamp((best - r.off) * 1.6, -3, 3);        // steer with the drift: aim for a lateral speed
    if (r.vd < wantVd - 0.35) i.left = true; else if (r.vd > wantVd + 0.35) i.right = true;
    const toBeam = RIVER.beamS - r.s;
    i.jump = toBeam < 7 && toBeam > -2;
  }
  return i;
}
