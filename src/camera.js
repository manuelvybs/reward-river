// Reward River — chase camera. One rig per mode (config CAMERAS), blended when the mode changes; never under
// the ground or the water.
import * as THREE from 'three';
import { CAMERAS } from './config.js';
import { footCenter, footGround, riverAt } from './level.js';

const KEYS = ['fov', 'dist', 'height', 'lookHeight', 'ahead', 'lag', 'heightLag'];
const dir = new THREE.Vector3(), target = new THREE.Vector3(), want = new THREE.Vector3(), lookWant = new THREE.Vector3();

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.rig = { ...CAMERAS.foot };
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, -1);
    this.shakeAmt = 0;
  }

  shake(a) { this.shakeAmt = Math.min(0.6, this.shakeAmt + a); }

  rigFor(p) { return p.mode === 'rope' ? CAMERAS.rope : (p.mode === 'raft' || p.mode === 'end' || p.mode === 'board') ? CAMERAS.raft : CAMERAS.foot; }

  update(dt, p, snap = false) {
    const r = this.rig, to = this.rigFor(p), k = snap ? 1 : Math.min(1, 1.8 * dt);
    for (const key of KEYS) r[key] += (to[key] - r[key]) * k;

    // forward: along the trail on foot, straight down the chasm on the rope, along the river on the raft
    if (p.mode === 'raft' || p.mode === 'end' || p.mode === 'board') { const f = riverAt((p.raft?.s || 0) + 8); dir.set(f.x - p.pos.x, 0, f.z - p.pos.z); }
    else if (p.mode === 'foot') dir.set(footCenter(p.pos.z - 6) - footCenter(p.pos.z), 0, -6);
    else dir.set(0, 0, -1);
    dir.normalize();
    this.dir.lerp(dir, snap ? 1 : Math.min(1, 3 * dt)).normalize();

    target.copy(p.pos); target.y += r.lookHeight;
    want.copy(target).addScaledVector(this.dir, -r.dist); want.y += r.height;
    lookWant.copy(target).addScaledVector(this.dir, r.ahead);
    if (snap) { this.pos.copy(want); this.look.copy(lookWant); }
    else {
      const a = 1 - Math.exp(-r.lag * dt), b = 1 - Math.exp(-r.heightLag * dt);
      this.pos.x += (want.x - this.pos.x) * a; this.pos.z += (want.z - this.pos.z) * a; this.pos.y += (want.y - this.pos.y) * b;
      this.look.lerp(lookWant, 1 - Math.exp(-6 * dt));
    }
    // keep clear of the ground (on foot) and the water (on the river)
    const g = footGround(this.pos.x, this.pos.z);
    if (Number.isFinite(g) && this.pos.y < g + 0.8) this.pos.y = g + 0.8;
    if (p.mode === 'raft' || p.mode === 'end' || p.mode === 'board') {
      const f = riverAt(Math.max(0, (p.raft?.s || 0) - r.dist));
      if (this.pos.y < f.y + 1.2) this.pos.y = f.y + 1.2;
      // stay inside the river channel on bends: never behind a bank wall
      const off = (this.pos.x - f.x) * f.nx + (this.pos.z - f.z) * f.nz, lim = f.width / 2 - 0.6;
      if (Math.abs(off) > lim) { const k = Math.sign(off) * lim - off; this.pos.x += f.nx * k; this.pos.z += f.nz * k; }
    }

    this.shakeAmt *= Math.exp(-7 * dt);
    const sh = this.shakeAmt;
    this.camera.position.set(this.pos.x + (Math.random() - 0.5) * sh, this.pos.y + (Math.random() - 0.5) * sh, this.pos.z + (Math.random() - 0.5) * sh);
    this.camera.lookAt(this.look);
    // the lens widens a little with raft speed (the rapids feel fast)
    const fov = r.fov + (p.mode === 'raft' ? Math.min(4, Math.max(0, (p.raft.speed - 6) * 0.7)) : 0);
    this.fovNow = (this.fovNow ?? fov) + (fov - (this.fovNow ?? fov)) * Math.min(1, 2 * dt);
    if (Math.abs(this.camera.fov - this.fovNow) > 0.01) { this.camera.fov = this.fovNow; this.camera.updateProjectionMatrix(); }
  }
}
