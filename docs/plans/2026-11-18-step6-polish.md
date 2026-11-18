# Twin Moon River — Step 6 (polish + playtest) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make it feel finished (glow, grade, reflections, particles, camera juice) without hurting the frame rate, and prove the whole level plays through the real keyboard path, on film.

**Architecture:**
- `src/post.js`: EffectComposer (RenderPass → UnrealBloomPass → grade ShaderPass → OutputPass) + a watchdog that drops bloom, then shadows, when the frame rate stays under 40 fps for 3 s. `?lowq` starts without them.
- Water: PMREM environment rendered from the sky dome once at boot; water material gets `envMap` (sky reflections with Fresnel).
- `src/fx.js`: two pooled point systems (soft dust/splash with normal blending, sparkles additive), `emit(pos, n, opts)`; main maps player events and per-frame state (steps, rowing, raft wake, rapids spray) to emits.
- Camera: `shake(amount)` decaying offset; raft FOV widens with speed.
- `?autopilot=keys`: the autopilot's decisions become synthetic KeyboardEvents, so `Input` (edges, holds) is exercised exactly as a player would. `tools/playtest.mjs --video` records the run (Playwright) → mp4.

**Tasks:**
- [ ] post.js + watchdog; resize; check the look at three beats
- [ ] water env reflections
- [ ] fx.js + event/state mapping
- [ ] camera shake + speed FOV
- [ ] keyboard autopilot bridge; playtest uses it by default; `--video` → `art-src/film/playtest.mp4`
- [ ] `npm test`, playtest (0 errors, lagoon, fps + draw calls logged), film + beats → Manuel
