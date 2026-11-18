// Twin Moon River — every tuning number, colour, camera and string lives here.

// gameplay tuning (meters, seconds)
export const TUNING = {
  heroHeight: 1.35,
  run: 6.4, back: 0.5, walkBelow: 3.5, accel: 9, strafe: 3.8,          // on foot (back = fraction of run)
  jump: 7.4, gravity: 16, coyote: 0.12, jumpBuffer: 0.14, stumble: 0.6,
  ropeMin: 7, ropeMax: 15.5, pump: 3.0, releaseBoost: 1.2, throwTime: 0.22, holdGrapple: 2.5,
  row: 3.2, brake: 2.5, duckDrag: 0.8, raftSteerAccel: 9, raftSteerDamp: 3, bankBounce: 1.5, raftRadius: 1.4,   // raft
  collectRadius: 1.4,
  deathY: -30,
};

// palette (sRGB hex): warm golden hour on the river planet, VYBS astronaut colours
export const PALETTE = {
  skyTop: 0xf2b27e, skyHorizon: 0xffe7c2, sunGlow: 0xfff1cf, fog: 0xf4d7ae,
  sun: 0xffd29a, hemiSky: 0xffe9cc, hemiGround: 0xb07c55,
  rock: 0xd99561, rockDark: 0xa45d3d, rockLight: 0xf3c68f,
  moss: 0xadbb5c, mossDark: 0x71893c, path: 0xf2d9a6, pathDark: 0xe2bd84,
  crystal: 0x8fe8ff, crystalDeep: 0x3fa7d6,
  stone: 0xf1ddb9, stoneDark: 0xcfac7e,
  water: 0x6fd2c0, waterDeep: 0x37979a, foam: 0xffffff,
  bark: 0x7b4b31, oar: 0xead0a2, rope: 0xd9b179,
  helmet: 0xe6f9fe, visor: 0x3a43c4, visorRim: 0xa8b1e7,
  gold: 0xffd401, indigo: 0x3a43c4, vybs: 0x5b69fe,
  moonA: 0xfff7ea, moonB: 0xffd6c6,
};

// low golden-hour sun, ahead down the river (backlit), shared by the light and the sky glow
export const SUN = { dir: [0.55, 0.4, -0.73], intensity: 2.6 };

// chase camera rigs per mode: dist/height behind the hero, lookHeight above the feet, ahead = look-at distance
export const CAMERAS = {
  foot: { fov: 52, dist: 5.4, height: 2.1, lookHeight: 1.1, ahead: 10, lag: 6, heightLag: 3 },
  rope: { fov: 40, dist: 8.0, height: 0.8, lookHeight: 0.9, ahead: 14, lag: 4.5, heightLag: 2.2 },   // longer lens, low: the helmets loom
  raft: { fov: 50, dist: 7.0, height: 2.6, lookHeight: 0.9, ahead: 18, lag: 4, heightLag: 4 },
};

export const HERO = {
  url: 'assets/models/hero.glb',
  // the GLB faces +Z; game forward is -Z: the player's yaw already accounts for it
  bones: { spine: 'Spine01', spine2: 'Spine', lArm: 'LeftArm', rArm: 'RightArm', lFore: 'LeftForeArm', rFore: 'RightForeArm', head: 'Head' },
};

export const GAME = {
  title: 'Twin Moon River',
  subtitle: 'run the canyon · swing the chasm · ride the river',
  controls: '↑ / W run and row · ↓ / S back, brake · ← → steer · Space jump, throw the rope (or hold it), let go · hold Space on the raft to duck · Enter start · P pause',
  controlsTouch: 'drag to steer · tap: jump, throw the rope, let go · hold on the raft: duck',
};
