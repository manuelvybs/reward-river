// Reward River — the rigged astronaut: loads the GLB, crossfades to the player's animation, places it in the
// world and layers the procedural bits the clips don't have (rope tilt, rowing arms, ducking).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TUNING, HERO, PALETTE } from './config.js';
import { FOOT } from './level.js';

const ONCE = new Set(['jump', 'sit', 'throw', 'land']);
const UP = new THREE.Vector3(0, 1, 0);
const qTilt = new THREE.Quaternion(), qYaw = new THREE.Quaternion(), q = new THREE.Quaternion(), v = new THREE.Vector3();

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
    this.duck = 0;
    this.row = 0;
    this.rowPhase = 0;
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
    this.play(p.anim, p.animSpeed, p.anim === 'jump' ? 0.08 : 0.2);
    this.mixer.update(dt);

    const onRaft = p.mode === 'raft' || p.mode === 'end' || (p.mode === 'board' && p.board?.t > 0.9);
    this.root.position.copy(p.pos);
    if (onRaft) this.root.position.y += 0.25;           // seated on the raft deck
    qYaw.setFromAxisAngle(UP, p.yaw);
    if (p.mode === 'rope') {                             // hang along the rope: the body's up points at the anchor
      v.copy(FOOT.anchor).sub(p.pos).normalize();
      qTilt.setFromUnitVectors(UP, v);
      this.root.quaternion.copy(qTilt).multiply(qYaw);
    } else this.root.quaternion.copy(qYaw);

    // procedural layers on top of the clips (bones were just written by the mixer)
    const r = p.raft || {};
    this.duck += ((onRaft && r.duck ? 1 : 0) - this.duck) * Math.min(1, 12 * dt);
    this.row += ((onRaft && r.rowing ? 1 : 0) - this.row) * Math.min(1, 6 * dt);
    this.rowPhase += dt * 7;
    const b = this.bones;
    if (this.duck > 0.01 && b.spine && b.spine2) {
      q.setFromAxisAngle(v.set(1, 0, 0), 0.55 * this.duck); b.spine.quaternion.multiply(q); b.spine2.quaternion.multiply(q);
      if (b.head) { q.setFromAxisAngle(v.set(1, 0, 0), 0.35 * this.duck); b.head.quaternion.multiply(q); }
    }
    if (this.row > 0.01 && b.lArm && b.rArm) {
      const s = Math.sin(this.rowPhase) * 0.6 * this.row;
      q.setFromAxisAngle(v.set(1, 0, 0), s); b.lArm.quaternion.multiply(q); b.rArm.quaternion.multiply(q);
    }
    // where the hands are (for the rope end): roughly the top of the body along its up axis
    this.hands = (this.hands || new THREE.Vector3()).copy(UP).applyQuaternion(this.root.quaternion).multiplyScalar(TUNING.heroHeight * 0.95).add(this.root.position);
  }
}
