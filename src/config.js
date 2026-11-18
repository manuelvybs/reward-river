// Twin Moon River — every tuning number, colour, camera and string lives here.

// gameplay tuning (meters, seconds)
export const TUNING = {
  heroHeight: 1.25,
  run: 6.2, accel: 9, strafe: 3.6,               // on foot
  jump: 7.0, gravity: 16,
  ropeMin: 8, ropeMax: 17.5, pump: 3.0, releaseBoost: 1.2,
  row: 3.5, raftSteer: 4.5, raftRadius: 1.4,    // raft
  collectRadius: 1.4,
  deathY: -30,
};

// palette (sRGB hex): pastel alien river planet, VYBS astronaut colours
export const PALETTE = {
  skyTop: 0xb6a6ea, skyHorizon: 0xf4e9f7, fog: 0xe6daf3,
  sun: 0xfff3e2, hemiSky: 0xf1ebff, hemiGround: 0x8e7fc2,
  rock: 0xa695d6, rockDark: 0x7d6cb8, rockLight: 0xcbbff0,
  moss: 0x8fd3c1, mossDark: 0x5fb3a6, path: 0xeadff4, pathDark: 0xd9c9ec,
  crystal: 0x9debff, crystalDeep: 0x6fa8ff,
  stone: 0xd7d0ea, stoneDark: 0xa99fc9,
  water: 0x6fc3d0, waterDeep: 0x3d6fa6, foam: 0xffffff,
  helmet: 0xe6f9fe, visor: 0x3a43c4, visorRim: 0xa8b1e7,
  gold: 0xffd401, indigo: 0x3a43c4, vybs: 0x5b69fe,
  moonA: 0xf2fbff, moonB: 0xf6c6e8,
};

// chase camera rigs per mode: dist/height behind the hero, lookHeight above the feet, ahead = look-at distance
export const CAMERAS = {
  foot: { fov: 52, dist: 5.4, height: 2.1, lookHeight: 1.1, ahead: 10, lag: 6, heightLag: 3 },
  rope: { fov: 46, dist: 8.5, height: 1.2, lookHeight: 0.6, ahead: 12, lag: 4, heightLag: 2.5 },
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
  controls: '↑ / W run and row · ← → steer · Space jump, throw the rope, let go · hold Space on the raft to duck · Enter start · P pause',
  controlsTouch: 'drag to steer · tap: jump, throw the rope, let go · hold on the raft: duck',
};
