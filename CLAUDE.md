# CLAUDE.md — Astrobound

This repo is **Astrobound**, a browser space exploration game (TypeScript / three.js / Rapier). See `AGENTS.md` for the map of the codebase.

## Before you change things

- Skim `docs/AGENT_CHANGELOG.md` so you don't reintroduce fixed bugs (camera excluding terrain collider, water shore masks discarding all liquid, sky haze hard lines, etc.).
- Prefer small, targeted edits. Match existing style (double quotes, arrow function components only if React — this project is mostly plain TS).

## After you change things

Append to `docs/AGENT_CHANGELOG.md`:

```markdown
### YYYY-MM-DD — short title
- **Summary:** …
- **Areas:** `path/a`, `path/b`
- **Notes:** …
```

## Hotspots

- Atmosphere: `src/visuals/atmosphere.ts` + fog/bg in `src/main.ts`
- Water: `src/visuals/planetLiquid.ts` + `liquid` on planet defs
- Cameras: `src/systems/cameraFollow.ts`, `shipCamera.ts`, `cameraOccluders.ts`
- Entity kinds: `src/ecs/gameEntity.ts`
- Landing: `src/systems/landingSite.ts`, `shipTransition.ts`
