# Twin Moon River — design

Approved by Manuel 2026-11-18.

A browser game starring the VYBS astronaut. It keeps the gameplay beats of the fal showcase game
"Saffron River" (https://fal-video-to-game.vercel.app/saffron-river/), but the code is our own and
every asset is generated new for our own world. Nothing is copied from the reference: not its code,
models, textures, sounds or music.

## World

A pastel alien river planet under a lavender sky with two moons. VYBS palette: icy white-blue
`#E6F9FE`, deep indigo `#3A43C4`, lavender `#A8B1E7`, VYBS indigo `#5B69FE`, warm yellow `#FFD401`.
Soft painted 3D with toon lighting.

## Level beats (forward is -Z)

1. Canyon trail on foot, star medals to collect.
2. Chasm: throw the rope at a glowing alien branch and swing between two giant stone astronaut helmets.
3. Landing, then steps up between crystal pillars to a quay.
4. Hop onto the pod-raft. Row and steer down a river through a flooded space-colony ruin.
5. Duck under a fallen antenna mast.
6. Pass under a crashed-rocket arch.
7. Rapids and drops, then a calm lagoon ending (cheer, stats).

Failing (falling into the chasm, hitting obstacles hard) respawns at the last checkpoint.

## Controls

- Keyboard: Up/W run and row, Left/Right steer, Space jump / throw rope / let go, hold Space on the raft to duck, Enter start, P pause, M mute, R restart.
- Gamepad: stick plus A.
- Touch: the hero runs and rows on its own; drag to steer, tap to jump / throw / let go, hold to duck. Landscape recommended.

## Code layout (plain ES modules, Three.js vendored, no build step)

| File | Job |
|---|---|
| `index.html` | canvas, overlays (loading, title, end, pause), import map |
| `src/config.js` | palette stops along the level, camera rigs, hero clip map, strings |
| `src/level.js` | the course as analytic functions: trail centre/width/ground, chasm, steps, river spline, level/width/current, beam/arch positions, checkpoints |
| `src/world.js` | builds terrain, river mesh, props, backdrops, foliage, medals |
| `src/hero.js` | loads the rigged hero, animation state machine, foot controller, rope swing, raft controller |
| `src/audio.js` | WebAudio one-shots, loops, music crossfade |
| `src/main.js` | renderer, post (grade, bloom), camera, loop, input, UI, `window.__game` test hooks |
| `tools/` | fal generation scripts and `fal-log.jsonl` (endpoint, prompt, cost of every call) |
| `art-src/` | concepts and intermediate images (not shipped) |
| `assets/` | shipped GLBs, textures, backdrops, sprites, audio |

## Asset list (reference role → our twin)

| Role | Twin |
|---|---|
| Hero, rigged | VYBS astronaut; clips idle, run, walk, jump, throw, hang, swing, fall, land, sit, cheer, crouch |
| `face` (chasm) | giant stone astronaut helmet set into the cliff |
| `bust` (river) | half-sunken helmet statue |
| `pillar` | crystal pillar |
| `cliff` | lavender alien cliff |
| `boulders` | moon-rock boulders |
| `tree` | alien tree with a glowing branch (rope anchor) |
| `arch` | crashed-rocket arch |
| `column` | broken colony column; fallen antenna mast for the duck beam |
| `raft` | pod-raft |
| Textures (6) | alien moss, dust trail, lavender rock, colony tiles, lilac-teal water, alien bark |
| Backdrops (2) | canyon mesas under two moons; flooded colony skyline |
| Atlases | glowing alien foliage; foam |
| Medals | gold four-point star (the visor sparkle) |
| Audio | 19 SFX (steps, jump, land, rope throw, rope creak, swing whoosh, waterfall, ambience, river, paddle, raft creak, bump, splash, rapids, collect, respawn, duck, drop, stone step) + 3 music (canyon, river, ending) |

## Pipeline

- Concepts: `fal-ai/nano-banana-pro/edit` with the astronaut refs (`fal-workflows/astronaut/refs.json`) for style. Manuel approves each concept.
- 3D: `tripo3d/h3.1/image-to-3d` per prop; hero via four clean A-pose views → `tripo3d/h3.1/multiview-to-3d` → `fal-ai/meshy/rigging/multi-animation`. Fallback if the auto-rig fails on the big helmet: hand-built bone rig in code.
- Cut-outs: `fal-ai/birefnet/v2`. Audio: `fal-ai/elevenlabs/sound-effects/v2`, `elevenlabs/music/v2.5`.
- GLBs are slimmed (texture resize + webp) before shipping.

## Steps (a check-in with Manuel after each)

1. Hero
2. Rough playable level with placeholder shapes
3. Props, three at a time
4. Textures, backdrops, atlases
5. Sound and music
6. Polish and scripted playtest (whole level by keyboard, 0 console errors, screenshots at each beat)
7. Deploy: public repo `manuelvybs/twin-moon-river`, GitHub Pages from `main` → `https://manuelvybs.github.io/twin-moon-river/` (ask before pushing)

## Budget

About $10–15 of fal calls.
