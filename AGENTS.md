# Astrobound

Browser 3D space exploration game: fly a ship through a solar system, land on procedural planets, and walk their surfaces. Stack is **TypeScript + three.js + miniplex + Rapier**, Vite for bundling.

Repo: https://github.com/reazn/astrobound

## What it does

- Multi-planet solar system with Keplerian orbits, atmosphere, liquids, rocks, asteroids
- On-foot locomotion on spherical terrain + third-person camera
- Ship flight (thrust, boost, hyperdrive), landing/takeoff, station docking
- Floating origin (possessed entity); sim at 60 Hz with interpolated render
- HUD / system map / settings overlays (ship + character appearance picker)

## Core layout

| Area | Path |
|------|------|
| Entry / loop | `src/main.ts` |
| Config | `src/config/` (`ship.ts`, `movement.ts`, `settings.ts`, `star.ts`) |
| Content | `src/content/` (planets, ships, characters, station) |
| ECS | `src/ecs/` (`components.ts`, `world.ts`, `gameEntity.ts`) |
| Engine | `src/engine/` (renderer, physics, input, loop, floating origin) |
| Systems | `src/systems/` (movement, flight, cameras, HUD, landing) |
| Worldgen | `src/worldgen/` (heightfield, mesh LODs, worker) |
| Visuals | `src/visuals/` (atmosphere, liquid, ship, character, rocks) |
| UI | `src/ui/` (Tailwind utilities; entry `src/styles.css`) |
| Agent changelog | `docs/AGENT_CHANGELOG.md` |

## Important conventions

- Ship forward = local **-Z**; `basisQuaternion(up, faceDir)` maps faceDir → **+Z**
- Landed / launching / landing = **planet-local** positions; flying / warp = **system space**
- Only one Rapier planet trimesh active at a time (`physics.setActivePlanet`)
- Camera spring-arm: terrain via Rapier + props/vehicles via `cameraOccluders` + `gameEntity` kinds
- Double quotes in source; no drive-by refactors; don't commit unless asked
- **UI styling:** Tailwind v4 utility classes on DOM nodes (`src/styles.css`). Do not add new hand-written CSS files for UI.

## Agent obligations

1. Read this file + `docs/AGENT_CHANGELOG.md` before large changes.
2. After meaningful work, **append** an entry to `docs/AGENT_CHANGELOG.md` (date, summary, areas touched).
3. Prefer extending `EntityKind` / `describeEntity` / occluder registry over one-off collision hacks.
4. Keep atmosphere/liquid/camera changes playtestable; avoid hard visual seams (sky horizon lines, opaque full-planet water shells).

## Run

```bash
npx vite --port=4000
npx tsc --noEmit
```
