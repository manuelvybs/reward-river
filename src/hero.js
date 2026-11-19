// Reward River — the rigged astronaut: loads the GLB, crossfades to the player's animation, places it in the
// world and layers the procedural bits the clips don't have (rope tilt, rowing arms, ducking).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TUNING, HERO, PALETTE } from './config.js';
import { FOOT } from './level.js';
import { raftPose } from './player.js';

const ONCE = new Set(['jump', 'sit', 'throw', 'land']);
const UP = new THREE.Vector3(0, 1, 0);
const qTilt = new THREE.Quaternion(), qYaw = new THREE.Quaternion(), v = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), E = new THREE.Euler();

export async function loadHero(url = HERO.url) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url).catch(() => new Promise(r => setTimeout(r, 400)).then(() => loader.loadAsync(url)));
  const model = gltf.scene;
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  const box = new THREE.Box3().setFromObject(model);
  model.scale.setScalar(TUNING.heroHeight / (box.max.y - box.min.y));
  model.position.y = -box.min.y * model.scale.y;
  const root = new THREE.Group();
  root.add(model);
  return new Hero(root, model, gltf.animations);
}

class Hero {
  constructor(root, model, clips) {
    this.root = root;
    this.model = model;
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const c of clips) {
      const a = this.mixer.clipAction(c);
      if (ONCE.has(c.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[c.name] = a;
    }
    this.bones = {};
    for (const [k, name] of Object.entries(HERO.bones)) this.bones[k] = model.getObjectByName(name);
    this.current = null;
    this.name = '';
    this.base = null;
  }

  play(name, speed = 1, fade = 0.2) {
    const a = this.actions[name] || this.actions.idle;
    if (name !== this.name) {
      a.reset().setEffectiveWeight(1).fadeIn(fade).play();
      if (this.current && this.current !== a) this.current.fadeOut(fade);
      this.current = a; this.name = name;
    }
    a.timeScale = speed;
  }

  // place + animate from the player state
  sync(p, dt) {
    // undo last frame's procedural layer first: a clamped clip (the seated pose) is not rewritten by the mixer,
    // so additive bone rotations would pile up frame after frame
    if (this.base) { for (const [b, q0] of this.base) b.quaternion.copy(q0); this.base = null; }
    this.play(p.anim, p.animSpeed, p.anim === 'jump' ? 0.08 : 0.2);
    this.mixer.update(dt);

    const r = p.raft || {}, onRaft = p.mode === 'raft' || p.mode === 'end';
    if (onRaft) {                                        // ride the raft: same bob / roll / pitch, seated near the stern
      const P = raftPose(p);
      E.set(P.pitch, p.yaw, P.roll, 'YXZ');
      this.root.quaternion.setFromEuler(E);
      v.set(0, 0.25 + P.bob - r.duck * 0.1, 0.1).applyQuaternion(this.root.quaternion);
      this.root.position.copy(p.pos).add(v);
    } else {
      this.root.position.copy(p.pos);
      qYaw.setFromAxisAngle(UP, p.yaw);
      if (p.mode === 'rope') {                           // hang along the rope: the body's up points at the anchor
        v.copy(FOOT.anchor).sub(p.pos).normalize();
        qTilt.setFromUnitVectors(UP, v);
        this.root.quaternion.copy(qTilt).multiply(qYaw);
      } else this.root.quaternion.copy(qYaw);
    }

    // rowing + ducking on top of the seated clip, around WORLD axes (bone local axes on an auto-rig point anywhere)
    if (onRaft && this.bones.spine) {
      const b = this.bones;
      this.base = [b.spine, b.spine2, b.head, b.lArm, b.rArm, b.lFore, b.rFore].filter(Boolean).map(x => [x, x.quaternion.clone()]);
      this.root.updateMatrixWorld(true);
      const right = v1.set(1, 0, 0).applyQuaternion(this.root.quaternion), fwd = v2.set(0, 0, 1).applyQuaternion(this.root.quaternion);
      const st = Math.sin(r.phase || 0), duck = r.duck || 0, row = p.mode === 'raft' ? 1 : 0;
      turn(b.spine, right, ((st * 0.14 + 0.05) * row) * (1 - duck) + duck * 0.7);   // lean into the catch, fold to duck
      turn(b.spine2, right, duck * 0.3);
      turn(b.head, right, -duck * 0.25);
      for (const [arm, fore, side] of [[b.lArm, b.lFore, 1], [b.rArm, b.rFore, -1]]) {
        turn(arm, right, -(0.5 + st * 0.3) * row * (1 - duck * 0.5));                 // swing forward (catch) and back (finish)
        turn(arm, fwd, side * (0.62 - st * 0.1) * row);                                // out to the oars (keeps the visor clear)
        turn(fore, right, -(0.35 - st * 0.25) * row * (1 - duck * 0.5));
      }
    }
    // where the hands are (for the rope end): roughly the top of the body along its up axis
    this.hands = (this.hands || new THREE.Vector3()).copy(UP).applyQuaternion(this.root.quaternion).multiplyScalar(TUNING.heroHeight * 0.95).add(this.root.position);
  }
}

// rotate a bone by `angle` around a world-space axis (converted into the bone's parent space), then refresh its subtree
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), la = new THREE.Vector3();
function turn(bone, axis, angle) {
  if (!bone || !angle) return;
  bone.parent.getWorldQuaternion(qa);
  la.copy(axis).applyQuaternion(qa.invert());
  bone.quaternion.premultiply(qb.setFromAxisAngle(la, angle));
  bone.updateMatrixWorld(true);
}
