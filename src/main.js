// Reward River — boot, renderer, game loop (fixed 120 Hz physics), overlays, HUD and window.__game.
//   ?autopilot  plays itself (?autopilot=keys: through synthetic key presses, the real input path)
//   ?cp=foot:1 | raft:2  start at a checkpoint     ?lowq  no bloom, no shadows     ?cam=px,py,pz,tx,ty,tz[,fov]
import * as THREE from 'three';
import { Player, autopilot } from './player.js';
import { buildWorld } from './world.js';
import { loadHero } from './hero.js';
import { loadProps } from './props.js';
import { loadPaint } from './paint.js';
import { ChaseCamera } from './camera.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Post } from './post.js';
import { FX } from './fx.js';
import { PALETTE, GAME, SUN } from './config.js';
import { MEDALS, RIVER, FOOT, riverAt } from './level.js';

const Q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const STEP = 1 / 120;
const DEBUG_CAM = Q.get('cam')?.split(',').map(Number);   // review shots: ?cam=px,py,pz,tx,ty,tz[,fov]

// ------------------------------------------------------------------------------------------ renderer + scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = !Q.has('lowq');
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;   // count every post pass of a frame (reset in frame())
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PALETTE.fog, 40, 520);
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 3000);
scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.65));
const sun = new THREE.DirectionalLight(PALETTE.sun, SUN.intensity);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);
const SUN_DIR = new THREE.Vector3(...SUN.dir).normalize();

const world = buildWorld(scene, await loadPaint());
const post = new Post(renderer, scene, camera, Q);
const fx = new FX(scene); fx.setScale(innerHeight);
{ // sky reflections on the water: a PMREM environment rendered once from the sky dome
  const pmrem = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(world.sky.geometry, world.sky.material));
  const env = pmrem.fromScene(envScene, 0.03).texture;
  for (const m of world.waterMats) { m.envMap = env; m.envMapIntensity = 0.85; m.roughness = 0.14; m.needsUpdate = true; }
  pmrem.dispose();
}
const input = new Input(renderer.domElement);
const cam = new ChaseCamera(camera);
const player = new Player();
const sound = new Sound();
let hero = null;
for (const ev of ['keydown', 'pointerdown', 'gamepadconnected']) addEventListener(ev, () => sound.start());   // audio needs a gesture

// ------------------------------------------------------------------------------------------ UI
$('gameTitle').textContent = GAME.title;
$('gameSub').textContent = GAME.subtitle;
$('gameControls').textContent = matchMedia('(pointer: coarse)').matches ? GAME.controlsTouch : GAME.controls;
$('medalTotal').textContent = MEDALS.length;
const show = (id, on) => $(id).classList.toggle('on', on);
let state = 'loading', paused = false, auto = Q.has('autopilot') && Q.get('autopilot') !== 'keys', acc = 0, t = 0;
const keysPilot = Q.get('autopilot') === 'keys';

// keyboard autopilot: the autopilot's decisions become key events, so Input (holds, edges) runs exactly as for a player
const held = {};
function pressKey(code, down) { if (!!held[code] === down) return; held[code] = down; dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code })); }
function keyPilot() {
  const a = autopilot(player);
  pressKey('ArrowUp', a.up); pressKey('ArrowDown', !!a.down); pressKey('ArrowLeft', a.left); pressKey('ArrowRight', a.right);
  if (a.jumpPressed) { pressKey('Space', false); pressKey('Space', true); } else pressKey('Space', !!a.jump);
}

function setMedals() { $('medalCount').textContent = player.medals.size; }
function fade() { const f = $('fade'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 380); }

const SAND = [0.92, 0.8, 0.62], SPRAY = [0.93, 0.99, 1], GOLD = [1, 0.84, 0.32], v3 = new THREE.Vector3();
const feet = () => v3.copy(player.pos);
const SFX = {
  jump: () => { sound.play('jump', 0.55, 0.95 + Math.random() * 0.1); fx.emit('soft', feet(), 6, { color: SAND, size: 0.5, life: 0.6, speed: 0.8, up: 0.4, alpha: 0.55 }); },
  land: d => { const a = d?.airTime || 0; sound.play('land', Math.min(0.9, 0.3 + a * 0.5)); fx.emit('soft', feet(), Math.round(6 + a * 10), { color: SAND, size: 0.7, life: 0.8, speed: 1.6, up: 0.3, alpha: 0.6, grow: 1.2 }); if (a > 0.7) cam.shake(0.25); },
  stumble: () => { sound.play('stumble', 0.9); fx.emit('soft', feet(), 16, { color: SAND, size: 0.7, life: 0.8, speed: 1.6, up: 0.6, alpha: 0.6 }); cam.shake(0.3); },
  throw: () => sound.play('rope_throw', 0.8),
  release: () => sound.play('swing_whoosh', 0.8),
  collect: k => { sound.play('collect', 0.55, 1 + (player.medals.size % 5) * 0.05); const m = MEDALS[k]; fx.emit('glow', v3.set(m.x, m.y, m.z), 18, { color: GOLD, size: 0.55, life: 0.7, speed: 2.4, up: 2, gravity: 3, alpha: 1 }); },
  respawn: () => { sound.play('respawn', 0.6); setTimeout(() => fx.emit('glow', v3.copy(player.pos).add({ x: 0, y: 0.7, z: 0 }), 26, { color: [1, 0.95, 0.8], size: 0.5, life: 0.9, speed: 1.6, up: 1.4, alpha: 0.9 }), 120); },
  board: () => { sound.play('board', 0.8); setTimeout(() => fx.emit('soft', feet(), 22, { color: SPRAY, size: 0.6, life: 0.9, speed: 2, up: 2.8, gravity: 9, alpha: 0.8 }), 700); },
  bump: () => { sound.play('bump', 0.9, 0.9 + Math.random() * 0.2); fx.emit('soft', feet(), 16, { color: SPRAY, size: 0.6, life: 0.8, speed: 2.2, up: 2.4, gravity: 9, alpha: 0.8 }); cam.shake(0.22); },
  beamHit: () => { sound.play('beam_hit', 0.9); cam.shake(0.4); },
  splash: d => { sound.play('splash_big', Math.min(1, -(d?.v || 6) / 10)); fx.emit('soft', feet(), 44, { color: SPRAY, size: 0.9, life: 1.1, speed: 3.2, up: 4.2, gravity: 10, alpha: 0.85 }); cam.shake(0.35); },
};
player.onEvent = (e, d) => {
  SFX[e]?.(d);
  if (e === 'collect') { world.collect(d); setMedals(); }
  if (e === 'respawn') { fade(); setTimeout(() => cam.update(1 / 60, player, true), 200); }
  if (e === 'end') endGame(d);
};

function start() {
  if (state !== 'title') return;
  state = 'play'; show('title', false); show('hud', true);
  const cp = Q.get('cp');
  if (cp) { const [half, i] = cp.split(':'); player.respawnAt(half, +i); }
  player.time = 0;
  cam.update(1 / 60, player, true);
}
function restart() {
  player.respawnAt('foot', 0); player.medals.clear(); player.respawns = 0; player.time = 0; player.mode = 'foot';
  world.resetMedals(); setMedals(); show('end', false); show('hud', true); state = 'play'; fade();
  cam.update(1 / 60, player, true);
}
function endGame(d) {
  state = 'end';
  setTimeout(() => {
    const m = Math.floor(d.time / 60), s = Math.floor(d.time % 60);
    $('endStats').textContent = `${player.medals.size} / ${MEDALS.length} stars · ${m}:${String(s).padStart(2, '0')} · ${player.respawns} ${player.respawns === 1 ? 'retry' : 'retries'}`;
    show('end', true);
  }, 1600);
}

// ------------------------------------------------------------------------------------------ loop
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  t += dt;
  if (keysPilot && state === 'play' && !paused) keyPilot();
  const inp = input.sample();
  if (state === 'title' && inp.start) start();
  else if (state === 'end' && (inp.restart || inp.start)) restart();
  else if (state === 'play') {
    if (inp.pause) { paused = !paused; show('pause', paused); if (sound.ctx) paused ? sound.ctx.suspend() : sound.ctx.resume(); }
    if (inp.restart) restart();
  }

  if (inp.mute) sound.mute();
  if (state === 'play' && !paused) {
    acc += dt;
    let first = true;
    while (acc >= STEP) {
      const i = auto ? autopilot(player) : inp;
      player.update(STEP, i);
      if (first) { inp.jumpPressed = false; first = false; }
      acc -= STEP;
    }
  } else if (state === 'end') player.update(dt, inp);

  if (hero) {
    if (state === 'title') { player.anim = 'wave'; player.animSpeed = 1; }
    hero.sync(player, paused ? 0 : dt);
  }
  if (state === 'title') {       // slow orbit around the hero waving at the trail head
    const a = t * 0.15 + 2.6;
    camera.position.set(player.pos.x + Math.sin(a) * 4.8, player.pos.y + 1.2, player.pos.z + Math.cos(a) * 4.8);
    camera.lookAt(player.pos.x, player.pos.y + 2.1, player.pos.z);       // aim above: the hero waves in the lower third, under the title
  } else cam.update(paused ? 0 : dt, player);
  if (DEBUG_CAM) { camera.position.set(DEBUG_CAM[0], DEBUG_CAM[1], DEBUG_CAM[2]); camera.lookAt(DEBUG_CAM[3], DEBUG_CAM[4], DEBUG_CAM[5]); if (DEBUG_CAM[6]) { camera.fov = DEBUG_CAM[6]; camera.updateProjectionMatrix(); } }

  world.update(paused ? 0 : dt, t, player, hero, camera);
  if (!paused) { updateSound(dt); fx.update(dt); }
  post.watch(dt, state === 'play' && !paused);
  sun.position.copy(player.pos).addScaledVector(SUN_DIR, 60);
  sun.target.position.copy(player.pos);
  renderer.info.reset();
  post.render();
}

// ------------------------------------------------------------------------------------------ sound beds, steps, strokes
let stepT = 0, paddleT = 0, wasDuck = false;
function updateSound(dt) {   // sound calls are no-ops until audio is ready; the particles here always run
  const p = player, onRiver = p.mode === 'raft' || p.mode === 'end' || p.mode === 'board';
  sound.music(state === 'end' || p.mode === 'end' ? 'music_end' : onRiver ? 'music_river' : 'music_canyon');
  const toFall = Math.hypot(p.pos.x + 10.6, p.pos.z + 61);
  let rap = 0;
  if (onRiver) for (const sd of RIVER.drops) rap = Math.max(rap, 1 - Math.abs(p.raft.s - sd) / 40);
  sound.loop('canyon', onRiver ? 0 : 0.45);
  sound.loop('waterfall', onRiver ? 0 : Math.max(0, 1 - toFall / 55) * 0.9);
  sound.loop('rope_creak', p.mode === 'rope' ? 0.7 : 0, 0.9 + Math.min(0.3, p.vel.length() / 30));
  sound.loop('river', onRiver ? 0.55 * (1 - rap * 0.6) : 0);
  sound.loop('rapids', onRiver ? rap * 0.85 : 0);
  sound.loop('raft_creak', p.mode === 'raft' ? 0.35 : 0);
  if (p.mode === 'foot' && Math.abs(p.speed) > 0.6) {                // a step every ~1.5 m
    stepT -= dt * Math.abs(p.speed);
    if (stepT <= 0) { stepT = 1.55; const stone = p.pos.z < FOOT.stepsZ0 + 0.5 && p.pos.z > FOOT.quayZ - 3; sound.play(stone ? 'step_stone' : 'steps', 0.35 + 0.2 * Math.random(), 0.9 + Math.random() * 0.2); if (!stone) fx.emit('soft', feet(), 3, { color: SAND, size: 0.45, life: 0.6, speed: 0.6, up: 0.3, alpha: 0.45 }); }
  } else stepT = 0;
  if (p.mode === 'raft' && p.raft.rowing) {   // in step with the oars: a splash at each blade
    paddleT -= dt;
    if (paddleT <= 0) {
      paddleT = 2 * Math.PI / 7; sound.play('paddle', 0.5, 0.9 + Math.random() * 0.2);
      for (const sd of [-1, 1]) fx.emit('soft', v3.set(p.pos.x + Math.cos(p.yaw) * sd * 1.9, p.pos.y, p.pos.z - Math.sin(p.yaw) * sd * 1.9), 5, { color: SPRAY, size: 0.4, life: 0.6, speed: 0.8, up: 1.4, gravity: 8, alpha: 0.75 });
    }
  } else paddleT = 0.15;
  if (p.mode === 'raft' && p.raft.duck && !wasDuck) sound.play('duck', 0.6);
  wasDuck = p.mode === 'raft' && p.raft.duck;
  // raft wake and rapids spray
  if (p.mode === 'raft' || p.mode === 'end') {
    wakeT -= dt;
    if (wakeT <= 0 && p.raft.speed > 1) { wakeT = 0.06; fx.emit('soft', v3.set(p.pos.x - Math.sin(p.yaw) * 1.4, p.pos.y + 0.05, p.pos.z - Math.cos(p.yaw) * 1.4), 2, { color: SPRAY, size: 0.7, life: 1.3, speed: 0.5, up: 0.05, grow: 1.4, alpha: 0.55 }); }
    if (rap > 0.55) { sprayT -= dt; if (sprayT <= 0) { sprayT = 0.05; const sd = RIVER.drops.reduce((a, b) => Math.abs(b - p.raft.s) < Math.abs(a - p.raft.s) ? b : a), f = riverAt(sd), o = (Math.random() - 0.5) * f.width;
      fx.emit('soft', v3.set(f.x + f.nx * o, f.y, f.z + f.nz * o), 3, { color: SPRAY, size: 1.1, life: 1.0, speed: 1, up: 2.4, gravity: 5, alpha: 0.7 }); } }
  }
}
let wakeT = 0, sprayT = 0;

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); post.setSize(innerWidth, innerHeight); fx.setScale(innerHeight); });

// ------------------------------------------------------------------------------------------ boot
window.__game = {
  ready: false, player, world, scene, camera, sound, post, renderer,
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, fps: +post.fps.toFixed(0), quality: post.level }), level: { beamS: RIVER.beamS, archS: RIVER.archS, endS: RIVER.endS, edgeZ: FOOT.edgeZ, farZ: FOOT.farZ },
  state: () => ({ state, mode: player.mode, z: +player.pos.z.toFixed(2), y: +player.pos.y.toFixed(2), s: +player.raft.s.toFixed(1), medals: player.medals.size, respawns: player.respawns, time: +player.time.toFixed(1), checkpoint: player.checkpoint }),
  start: () => start(), restart: () => restart(), autopilot: on => { auto = on; },
};

Promise.all([loadHero(), loadProps()]).then(([h, props]) => {
  world.useProps(props);
  hero = h; scene.add(hero.root);
  hero.sync(player, 0);
  renderer.compile(scene, camera);
  state = 'title'; show('loading', false); show('title', true);
  window.__game.ready = true;
  if (Q.has('autostart') || auto || keysPilot) start();
}).catch(e => { $('loading').textContent = 'could not load the astronaut: ' + e.message; console.error(e); });
renderer.setAnimationLoop(frame);
