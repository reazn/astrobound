# PLAN.md — Astrobound (space flight & planetary exploration)

A browser-first 3D space game: fly between procedurally generated planets, walk their surfaces, dock at a space station, and explore a living solar system. TypeScript + three.js, structured so it can ship as Electron/Steam and gain multiplayer without a rewrite.

Repo: https://github.com/reazn/astrobound

---

## 1. Tech Stack (decided, do not substitute)

| Concern | Choice | Why |
|---|---|---|
| Renderer | **three.js** (latest, WebGL2 path) | Full shader control for atmospheres, toon terrain, engine glow |
| Physics (on-foot) | **@dimforge/rapier3d-compat** (WASM) | KinematicCharacterController for surface walking |
| Ship flight | **Custom Newtonian sim** (system-space) | 6DOF with gravity wells, atmosphere braking, collision avoidance |
| ECS | **miniplex** | Tiny, TypeScript-native, readable queries |
| Build | **Vite + TypeScript (strict)** | Instant HMR, trivial Electron packaging later |
| Noise/RNG | **simplex-noise** + seeded PRNG streams | All world gen from ONE seed |
| UI/HUD | Plain DOM + CSS overlaid on the canvas | Flight instruments, nav list, steering reticle, prompts |
| Orbits | **Keplerian** (eccentric anomaly solver) | Planets and station orbit the star; launch inherits orbital velocity |

Do NOT use: react-three-fiber, Babylon, cannon-es for ship flight, any CSS framework.

Multiplayer note (future): simulation → render split, fixed-timestep sim, all randomness from seeded RNG streams. `src/net/` holds snapshot types and input envelopes. Later bolt on Colyseus or a custom WebSocket server. Nothing reads `Math.random()` directly.

---

## 2. Non-Negotiable Architecture Rules

1. **No file over ~250 lines.** Split when a file grows past that.
2. **Data and logic are separate.** Planets, station, ship tunables are plain typed config in `content/` and `config/`.
3. **One system, one file.** Ship flight, possession, HUD, docking, camera each own a `update(…, dt)` entry point.
4. **Fixed timestep simulation** (60 Hz) with interpolated rendering.
5. **Single seeded RNG service** with named streams. Never `Math.random()`.
6. **No magic numbers in systems.** Tunables live in `config/`.
7. **Floating origin rendering.** System-space sim uses float64; GPU positions are always camera-relative.

---

## 3. Game Pillars

| Pillar | Description |
|---|---|
| **Solar system** | Star at origin; planets on real elliptical orbits (slow, distant); varied planet sizes |
| **Ship flight** | Mouse steers via reticle (inertial turn, not instant snap); W/S throttle; Shift boost; Space hyperjump |
| **Planets** | Procedural terrain, palette shading, layered atmosphere (sky shell + clouds + rim), liquids, surface walking |
| **Station** | Meridian Station with docking bays; fly in and press E to dock |
| **Possession** | On-foot astronaut ↔ ship; board/exit/launch/dock transitions in one orchestrator |

---

## 4. Project Structure (high level)

```
src/
  config/       ship, star, movement, settings tunables
  content/      planet defs, ships, characters, station
  ecs/          components + world + gameEntity kinds
  engine/       loop, input, renderer, physics, rng, floating origin
  net/          multiplayer snapshot + input types (baseline, not wired yet)
  systems/      shipFlight, possession, spaceHud, shipCamera, stationDocking, …
  visuals/      atmosphere, liquid, ship model, character, station, star, sky
  worldgen/     planet mesh, orbits, palette, LOD worker
  ui/           settings menu, HUD chrome, model preview
```

---

## 5. Milestones (build in this order)

**M1 — Solar system & ship (current):** Kepler orbits, procedural planets (varied sizes), atmospheres, liquids, starfield, free flight with gravity/steering/collision avoidance, boost + hyperjump, nav HUD, station docking, on-foot walking, possession flow, ship/character appearance picker.

*Acceptance: launch from a planet without clipping through it; fly to another planet via boost or hyperjump; dock at station; walk surface; settings menu works.*

**M2 — World depth (next):** richer planet biomes and props, better landing UX, more readable navigation, polish atmosphere/liquid/camera edge cases.

**M3 — Activities (stretch):** points of interest, salvage/scan loops, optional surface encounters — exploration-first, not a combat roguelike.

**M4 — Multiplayer (stretch):** server authoritative sim using `net/snapshot` types; client prediction + interpolation.

Each milestone must run clean (`npm run dev`) before starting the next.
