# Reward River

Run the canyon, swing the chasm and ride the river with the VYBS astronaut. A browser game in plain JavaScript on Three.js, no build step.

**Play:** https://manuelvybs.github.io/reward-river/

## Controls

| | Keyboard | Touch |
|---|---|---|
| Run / row | ↑ or W | automatic |
| Back / brake | ↓ or S | |
| Steer | ← → | drag sideways |
| Jump, throw the rope, let go | Space (hold it from the jump and the rope fires on its own) | tap |
| Duck on the raft | hold Space | hold |
| Start · pause · restart · sound | Enter · P · R · M | tap |

Gamepads work too. Best on a laptop, or a phone in landscape. Add `?lowq` to the URL on slow devices.

## How it was made

The gameplay beats follow fal's "Saffron River" showcase (run, rope swing, raft, rapids). The code is our own, and every asset was generated for this game:

- **Hero:** the VYBS astronaut. Four views from Nano Banana Pro, `tripo3d/h3.1/multiview-to-3d`, then a Meshy auto-rig with 13 library clips. The skin weights were rebuilt (geodesic, rigid helmet) because the auto-weights tore on chibi proportions.
- **Props:** nine concepts (Nano Banana Pro), each turned into a 3D model with `tripo3d/h3.1/image-to-3d`, then cleaned, measured and compressed (WebP + meshopt).
- **Paint:** six seamless textures, two backdrops, foliage and foam sprites (Nano Banana Pro).
- **Sound:** 21 effects (`fal-ai/elevenlabs/sound-effects/v2`) and 3 music tracks (`elevenlabs/music/v2.5`).

Every fal call is logged in `tools/fal-log.jsonl`. The design and the step-by-step plans are in `docs/`.

## Develop

```bash
npm install
npx http-server . -p 4173 -c-1
npm test
node tools/playtest.mjs
```

`npm test` runs the course and player logic in Node, including an autopilot run of the whole level. `node tools/playtest.mjs` plays the full level in headless Chromium through real key presses and fails on any console error. Add `--video` to record it.

URL flags: `?autopilot`, `?cp=foot:1` / `?cp=raft:2` (start at a checkpoint), `?lowq`, `?mute`.
