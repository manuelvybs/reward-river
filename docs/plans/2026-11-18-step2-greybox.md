# Twin Moon River — Step 2 (rough playable level) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The whole course playable end to end with the real rigged astronaut and placeholder shapes in the Twin Moon River palette: run the canyon, rope-swing the chasm, climb the steps, ride the pod-raft down the river (steer, row, duck the antenna beam, rapids), lagoon ending.

**Architecture:** Gameplay is pure logic that runs in Node and in the browser: `level.js` (the course as analytic functions, no scene objects) and `player.js` (modes, physics, events, autopilot). The browser side renders it: `world.js` builds placeholder meshes from `level.js`, `hero.js` drives the GLB from `player.anim`, `camera.js` follows, `input.js` merges keyboard/gamepad/touch, `main.js` glues it with a fixed 120 Hz physics step, overlays and `window.__game`.

**Tech Stack:** three.js 0.187.0 (vendored, import map), ES modules, `node:test`, Playwright 1.61.1 for the browser check.

---

## File map

| File | Responsibility | Depends on |
|---|---|---|
| `src/config.js` | palette, camera rigs per mode, hero (url, height, clip names), tuning numbers, strings | — |
| `src/level.js` | `FOOT`, `footCenter/footWidth/footGround`, river spline by arc length `riverAt(s)`, `sAtZ(z)`, `OBSTACLES`, `MEDALS`, `CHECKPOINTS`, beam/arch/end positions | three (math only) |
| `src/player.js` | `Player` (modes `foot` `air` `rope` `board` `raft` `end`), `update(dt, input)`, events, `anim`/`animSpeed`, `autopilot(player)` | level, config |
| `src/input.js` | keyboard + gamepad + touch → `{up,left,right,jump,jumpPressed,start,pause,restart}` | — |
| `src/hero.js` | load GLB, scale/yaw, crossfade to `player.anim`, rope tilt, duck/row bone overlays | three |
| `src/world.js` | sky gradient + two moons, canyon walls, trail, chasm, helmet heads, tree + glowing branch, steps + crystal pillars, quay, river ribbon with flowing texture, banks, obstacles, beam, arch, rapids foam, lagoon, raft, medals, rope | three, level, config |
| `src/camera.js` | chase camera, per-mode rig blend, no clipping under water/ground | three, config |
| `src/main.js` | renderer, lights/shadows, loop, overlays, HUD, respawn fade, `window.__game` | all |
| `index.html` | canvas, overlays, import map | — |
| `tests/level.test.mjs`, `tests/player.test.mjs` | node tests | level, player |
| `tools/playtest.mjs` | Playwright: load, start, autopilot to the end, 0 console errors, screenshots at each beat | — |

## Course numbers (meters, forward = -Z)

- Trail z 18 → edge -56, width 6 → 4.6, gentle S-curve. Chasm -56 → -74. Rope anchor (0, 12.5, -65). Landing y -2.6 to steps -94 → -106 (14 steps up to y 3.6), quay to -116.
- River from z -118 to the lagoon (end at z -605): level 3.0, drops near z -481, -508, -532 (to -5.2); width 14 → 22 → 18 → lagoon 50+; current 4.5 → 6 → 10.5 in the rapids → 1.
- Antenna beam z -370 (must duck), crashed-rocket arch z -450.
- Hero 1.25 m; run 6.2 m/s; jump 7 m/s; gravity 16 m/s²; rope length 8–17 m, pump with Up; raft row +3.5 m/s, steer 4.5 m/s.
- Checkpoints: trail start, chasm edge, landing; river start, before the beam, before the rapids.

## Tasks

- [ ] **1. level.js + tests:** footGround is finite on the trail, `-Infinity` over the chasm, stepped on the stairs; `riverAt(0)` is next to the quay; `sAtZ` inverts `riverAt(s).z`; river level drops across the rapids; every obstacle leaves a passable gap (≥ 3.2 m) somewhere across the river.
- [ ] **2. player.js + tests:** holding Up reaches the chasm edge; jumping off without the rope falls and respawns at the edge checkpoint; jump → throw → release crosses and lands on the far side; reaching the quay boards the raft; not ducking at the beam respawns before it; ducking passes.
- [ ] **3. autopilot test:** `autopilot()` drives the whole level at 60 Hz in under 150 s simulated, 0 respawns, ≥ half the medals.
- [ ] **4. browser side:** config, input, hero, world, camera, main, index.html.
- [ ] **5. playtest.mjs:** title → start → `?autopilot` to the lagoon in headless GPU Chromium, 0 console errors, screenshots at trail / swing / steps / raft / beam / rapids / end.
- [ ] **6. checkpoint with Manuel:** he plays it locally (browser pane) and approves before props (step 3).
