// Twin Moon River — boot, renderer, game loop (fixed 120 Hz physics), overlays, HUD and window.__game.
//   ?autopilot  plays itself     ?cp=foot:1 | raft:2  start at a checkpoint     ?lowq  no shadows     ?cam=px,py,pz,tx,ty,tz[,fov]
import * as THREE from 'three';
import { Player, autopilot } from './player.js';
import { buildWorld } from './world.js';
import { loadHero } from './hero.js';
import { loadProps } from './props.js';
import { loadPaint } from './paint.js';
import { ChaseCamera } from './camera.js';
import { Input } from './input.js';
import { PALETTE, GAME, SUN } from './config.js';
import { MEDALS, RIVER, FOOT } from './level.js';

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
const input = new Input(renderer.domElement);
const cam = new ChaseCamera(camera);
const player = new Player();
let hero = null;

// ------------------------------------------------------------------------------------------ UI
$('gameTitle').textContent = GAME.title;
$('gameSub').textContent = GAME.subtitle;
$('gameControls').textContent = matchMedia('(pointer: coarse)').matches ? GAME.controlsTouch : GAME.controls;
$('medalTotal').textContent = MEDALS.length;
const show = (id, on) => $(id).classList.toggle('on', on);
let state = 'loading', paused = false, auto = Q.has('autopilot'), acc = 0, t = 0;

function setMedals() { $('medalCount').textContent = player.medals.size; }
function fade() { const f = $('fade'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 380); }

player.onEvent = (e, d) => {
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
  const inp = input.sample();
  if (state === 'title' && inp.start) start();
  else if (state === 'end' && (inp.restart || inp.start)) restart();
  else if (state === 'play') {
    if (inp.pause) { paused = !paused; show('pause', paused); }
    if (inp.restart) restart();
  }

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
    camera.position.set(player.pos.x + Math.sin(a) * 4.2, player.pos.y + 1.6, player.pos.z + Math.cos(a) * 4.2);
    camera.lookAt(player.pos.x, player.pos.y + 0.8, player.pos.z);
  } else cam.update(paused ? 0 : dt, player);
  if (DEBUG_CAM) { camera.position.set(DEBUG_CAM[0], DEBUG_CAM[1], DEBUG_CAM[2]); camera.lookAt(DEBUG_CAM[3], DEBUG_CAM[4], DEBUG_CAM[5]); if (DEBUG_CAM[6]) { camera.fov = DEBUG_CAM[6]; camera.updateProjectionMatrix(); } }

  world.update(paused ? 0 : dt, t, player, hero, camera);
  sun.position.copy(player.pos).addScaledVector(SUN_DIR, 60);
  sun.target.position.copy(player.pos);
  renderer.render(scene, camera);
}

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ------------------------------------------------------------------------------------------ boot
window.__game = {
  ready: false, player, world, scene, camera, level: { beamS: RIVER.beamS, archS: RIVER.archS, endS: RIVER.endS, edgeZ: FOOT.edgeZ, farZ: FOOT.farZ },
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
  if (Q.has('autostart') || auto) start();
}).catch(e => { $('loading').textContent = 'could not load the astronaut: ' + e.message; console.error(e); });
renderer.setAnimationLoop(frame);
