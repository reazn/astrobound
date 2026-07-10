# Agent changelog

Living history of agent-driven changes. **Append new entries at the top** after each meaningful session.

---

### 2026-07-10 — 2× surface/liquid detail; procedural terrain rocks + ore
- **Summary:** Near-surface terrain and liquid meshes use ~2× triangle count (`lodSegments` ×√2). Surface rocks are no longer GLB props — sparse boulder protrusions are baked into the heightfield (walkable mesh + collider, terrain palette). Ore nodules are unique procedural meshes per deposit (iron/copper metallic, crystal spikes + transmission, carbon lumps) with subdivision matched to planet facet size.
- **Areas:** `src/worldgen/planetMesh.ts`, `src/worldgen/planet.ts`, `src/worldgen/meshBuffers.ts`, `src/worldgen/planetInstance.ts`, `src/visuals/planetRocks.ts`, `src/visuals/planetOre.ts`
- **Notes:** Rock prop API kept empty for movement/occluder compatibility; ore remains separate collidable props.

### 2026-07-09 — Known systems in map (preview → teleport)
- **Summary:** System map (**M**) lists known star systems as lightweight defs. Selecting one previews orbits/planets/star in the map without generating meshes. **Teleport** loads the system and moves the player; **Discover system** adds another known entry. Removed instant **B**-key jump.
- **Areas:** `src/content/systems/catalog.ts`, `src/ui/systemMap.ts`, `src/ui/hud.css`, `src/main.ts`, `index.html`
- **Notes:** Home Solara stays the live world until teleport; remote previews hide the player marker.

### 2026-07-09 — Procedural systems, ore, B-key jump
- **Summary:** Press **B** to hot-swap into a fully procedural star system (1–10 planets). Star types red/yellow/green/blue drive climate weights; planets get temperature/mass/gravity/climate metadata, spaced orbits with padding, and varied size/palette/liquid/rings. Surface ore nodules spawn on planets (collidable). Home handcrafted system unchanged until you jump.
- **Areas:** `src/worldgen/generateSystem.ts`, `src/config/star.ts`, `src/visuals/star.ts`, `src/visuals/planetOre.ts`, `src/worldgen/planetInstance.ts`, `src/content/planets/meta.ts`, `src/main.ts`, `src/systems/possession.ts`, `src/systems/playerMovement.ts`, `src/systems/worldMarkers.ts`, `src/ui/systemMap.ts`, `index.html`
- **Notes:** Procedural systems omit Meridian Station. Map shows climate/temp/mass in body detail.

### 2026-07-09 — Fix on-foot mouse look (raw pointer lock)
- **Summary:** On-foot look felt like polling/stutter. Root causes: missing `requestPointerLock({ unadjustedMovement: true })` (OS acceleration), aggressive EMA/frame caps that chopped high-Hz mice, and a look low-pass that lagged deltas. Now request raw movement, apply look 1:1, and only briefly ignore post-lock spikes.
- **Areas:** `src/engine/input.ts`, `src/systems/cameraFollow.ts`, `docs/AGENT_CHANGELOG.md`
- **Notes:** Known Chromium issue with 1000Hz mice can still rare-skip; raw lock is the standard game fix (Three.js PointerLockControls / MDN).

### 2026-07-09 — Local compass, look-up cam, rock colliders, GLTF cache
- **Summary:** On-foot compass shows only local craft (not planets). Character camera allows looking up with raised pivot / fade so the body doesn't fill the lens. Analytic sphere collisions for surface rocks. Shared `gltfCache` + deferred ESC preview warm + background prefetch of ship/character models to stop ESC spam refetching.
- **Areas:** `src/main.ts`, `src/systems/cameraFollow.ts`, `src/systems/playerMovement.ts`, `src/systems/possession.ts`, `src/engine/gltfCache.ts`, `src/ui/modelPreview.ts`, `src/ui/settingsMenu.ts`, `src/visuals/shipModel.ts`, `src/visuals/animatedCharacter.ts`, `src/visuals/planetRocks.ts`, `src/visuals/asteroids.ts`, `src/config/settings.ts`
- **Notes:** Rock collision is analytic (not Rapier) to match on-foot heightfield locomotion.

### 2026-07-09 — Camera, slopes, rocks, HUD, Saturnus, loading
- **Summary:** Smooth spring-arm pull-in (no instant snap); on-foot mouse look low-pass + tighter pointer-lock spike filter; steep hills slow then block (~42°/52°); denser surface rocks tinted to local terrain; ship display names distinct from astronauts; on-foot compass + in-world ship marker; system-map rings only for ringed worlds; new large ringed planet Saturnus; launch key W; loading bar during boot.
- **Areas:** `src/systems/cameraFollow.ts`, `src/systems/shipCamera.ts`, `src/systems/playerMovement.ts`, `src/config/movement.ts`, `src/engine/input.ts`, `src/visuals/planetRocks.ts`, `src/visuals/planetRings.ts`, `src/content/ships.ts`, `src/content/planets/*`, `src/worldgen/planetInstance.ts`, `src/ui/systemMap.ts`, `src/systems/spaceHud.ts`, `src/systems/worldMarkers.ts`, `src/systems/possession.ts`, `src/ui/loadingScreen.ts`, `src/main.ts`, `index.html`
- **Notes:** Map “halos” on every planet removed; only `PlanetDef.rings` draws ring graphics (world + map).

### 2026-07-09 — Rename project to Astrobound
- **Summary:** Rebranded from Staffbound / rouge-like to **Astrobound**. Updated package name, page title, settings storage key, HUD comment, agent docs (`AGENTS.md`, `CLAUDE.md`, `PLAN.md`, cursor rule), and added README + `.gitignore`. PLAN milestones reframed as space exploration (not a combat roguelike). Repo target: https://github.com/reazn/astrobound
- **Areas:** `package.json`, `package-lock.json`, `index.html`, `src/config/settings.ts`, `src/ui/hud.css`, `AGENTS.md`, `CLAUDE.md`, `PLAN.md`, `README.md`, `.gitignore`, `.cursor/rules/astrobound.mdc`, `docs/AGENT_CHANGELOG.md`
- **Notes:** Settings localStorage key is now `astrobound.settings.v1` (old `staffbound.settings.v1` picks will not carry over).

### 2026-07-09 — Remove UAL retarget plumbing
- **Summary:** Kit astronauts cannot use Universal Animation Library clips without retargeting (DEF-* vs Hips/Torso bone names). Removed `retargetClips`, `LoadCharacterOptions` / `ualUrl` merge path, and `public/models/animations/ual1.*`. Characters use only their embedded kit clips again.
- **Areas:** `src/visuals/animatedCharacter.ts`, `src/content/characters.ts`, `src/main.ts`, `src/visuals/retargetClips.ts` (deleted), `public/models/animations/`
- **Notes:** Head stretch on Finn was a separate issue (scaling the skinned root), not UAL — UAL was never wired onto kit characters.

### 2026-07-09 — Pull broken Poly Pizza astronaut (skinning)
- **Summary:** Quaternius 2022 Astronaut GLB from poly.pizza stretches under three.js (Blender cm scale 100 + multi SkinnedMesh siblings). Removed from selectable roster; default back to Finn. UAL retarget helpers kept for a clean re-export later.
- **Areas:** `src/content/characters.ts`, `src/visuals/animatedCharacter.ts`, `src/ui/modelPreview.ts`, `docs/AGENT_CHANGELOG.md`

### 2026-07-09 — Fix astronaut multi-skin stretch
- **Summary:** Quaternius astronaut exports 4 SkinnedMeshes with separate Skeleton objects; animating one left the head mesh on a stale bind. Unify all skins onto scene-graph bones. Also: don't mutate cm scale 100 (breaks IBMs); skip SkeletonUtils.clone for player; UAL retarget deferred (rotation-only still needs pose validation).
- **Areas:** `src/visuals/animatedCharacter.ts`, `src/ui/modelPreview.ts`, `src/content/characters.ts`, `src/main.ts`, `docs/AGENT_CHANGELOG.md`

### 2026-07-09 — Fix UAL retarget stretch (rotation-only)
- **Summary:** UAL position/scale tracks encoded the mannequin's bone lengths and stretched the astronaut (head floating). Retarget now copies quaternion tracks only; Astronaut uses its own Idle/Walk/Run and UAL for swim/jump.
- **Areas:** `src/visuals/retargetClips.ts`, `src/content/characters.ts`, `src/visuals/animatedCharacter.ts`, `docs/AGENT_CHANGELOG.md`

### 2026-07-09 — Quaternius astronaut + UAL1 retarget (swim)
- **Summary:** Added Poly Pizza Quaternius Astronaut as default selectable character. Universal Animation Library 1 clips are retargeted DEF-* → Hips/Torso/… at load (Idle/Walk/Sprint/Jump/Swim). UAL2 not freely mirrored online — UAL1 covers swim. Space-kit animal astronauts unchanged (own clips).
- **Areas:** `public/models/characters/Astronaut_Quaternius.glb`, `public/models/animations/ual1.*`, `src/visuals/retargetClips.ts`, `src/visuals/animatedCharacter.ts`, `src/content/characters.ts`, `src/main.ts`, `docs/AGENT_CHANGELOG.md`

### 2026-07-09 — Idle/walk hysteresis; Mixamo export notes pending swim
- **Summary:** Locomotion no longer restarts idle↔walk fades every frame; sticky speed bands + single crossfade. Jump/land path unchanged.
- **Areas:** `src/visuals/animatedCharacter.ts`, `docs/AGENT_CHANGELOG.md`

### 2026-07-09 — Fix jump locking loco; jump sequence + swim motion
- **Summary:** Jump one-shots never called `.play()`, so the busy flag stuck and idle/walk never resumed. Reworked character anim to Jump → Jump_Idle → Jump_Land with a watchdog, mixer bound to the cloned skeleton, and idle/walk/run restored after landing. Liquid state drives swim locomotion (procedural paddle for now — kit has no swim clips; UAL swim uses incompatible DEF-* bones).
- **Areas:** `src/visuals/animatedCharacter.ts`, `src/content/characters.ts`, `src/ecs/components.ts`, `src/systems/playerMovement.ts`, `src/systems/possession.ts`, `docs/AGENT_CHANGELOG.md`
- **Notes:** For real swim clips, need animations authored on the kit rig (Hips/Torso/…) or a retarget pass — Mixamo/UAL links welcome.

### 2026-07-09 — Kit ships/astronauts + ESC appearance picker
- **Summary:** Imported Ultimate Space Kit spaceships and astronauts (GLTF; self-contained, skinned, with Idle/Walk/Run/Jump). Classic ship scaled ~1.5× (`SHIP.length` 9→13.5, camera/landing/enter ranges adjusted). ESC menu now switches ship and astronaut with a spinning 3D preview; picks persist in localStorage. Kit clips used instead of Mixamo (already embedded in the GLTFs).
- **Areas:** `public/models/ships/`, `public/models/characters/`, `src/content/ships.ts`, `src/content/characters.ts`, `src/config/ship.ts`, `src/config/settings.ts`, `src/visuals/shipModel.ts`, `src/ui/modelPreview.ts`, `src/ui/settingsMenu.ts`, `src/main.ts`, `docs/AGENT_CHANGELOG.md`
- **Notes:** Prefer GLTF over OBJ/FBX for three.js. Rovers not imported (ships only). Classic astronaut kept as a selectable static fallback.

### 2026-07-09 — Softer water tint; block browser shortcuts in-game
- **Summary:** Reduced liquid facet color to subtle brightness variation (no hue scatter). Input now preventDefaults Ctrl/Cmd/Alt combos and common browser keys while playing so tabs/bookmarks don't steal the session.
- **Areas:** `src/visuals/planetLiquid.ts`, `src/engine/input.ts`, `docs/AGENT_CHANGELOG.md`

### 2026-07-09 — Water shore bury + color hash; fly Ctrl/Shift
- **Summary:** Extended liquid mesh a few polys into land and dampened waves at the fringe so wave lift no longer opens a gap under the shore. Replaced tiled sine mottling with per-facet hash color variation. Fly mode: Space up, Ctrl down, Shift 2× boost.
- **Areas:** `src/visuals/planetLiquid.ts`, `src/systems/playerMovement.ts`, `src/config/movement.ts`, `index.html`, `docs/AGENT_CHANGELOG.md`

### 2026-07-09 — High-LOD water, minor waves, V fly mode
- **Summary:** Liquid mesh now uses high terrain segment count so poly size matches near-surface land. Added a cheap two-sine radial wave via MeshToon `onBeforeCompile`. Bound V to toggle on-foot fly mode at 5× walk speed (Space up / Shift down).
- **Areas:** `src/visuals/planetLiquid.ts`, `src/worldgen/planetInstance.ts`, `src/systems/playerMovement.ts`, `src/config/movement.ts`, `src/ecs/components.ts`, `src/main.ts`, `index.html`, `docs/AGENT_CHANGELOG.md`

### 2026-07-09 — Fix invisible liquid (log depth + toon material)
- **Summary:** Water used a custom ShaderMaterial without Three.js log-depth chunks while the renderer has `logarithmicDepthBuffer`, so it failed depth tests against terrain (only dark submerged land showed). Switched surface to MeshToonMaterial with vertex colors (same path as land) and added log-depth includes on the volume shader.
- **Areas:** `src/visuals/planetLiquid.ts`, `docs/AGENT_CHANGELOG.md`

### 2026-07-09 — Liquid matches terrain poly density + facet colors
- **Summary:** Replaced the low-poly icosphere liquid with the same spherified-cube topology as terrain (mid LOD segment count). Wet triangles only; flat-shaded per-facet colors with depth/shore/mottle variation so water reads like land facets, just slightly transparent.
- **Areas:** `src/visuals/planetLiquid.ts`, `src/worldgen/planetInstance.ts`, `src/content/planets/*`, `docs/AGENT_CHANGELOG.md`

### 2026-07-09 — Atmosphere line revert, water rewrite, camera occluders, agent docs
- **Summary:** Removed the on-planet sky horizon-haze change that caused a visible line. Rewrote liquid so shorelines use real terrain depth (dense icosphere + soft shore fade, foam, depth darkening); raised sea levels / opacity on planet defs. Tightened foot/ship cameras (larger collision pad, analytical surface clamp so the lens can't dive under the planet). Added `EntityKind` / `describeEntity` plus a camera occluder registry (ship + rocks) so vehicles/props block the spring-arm. Added `AGENTS.md`, `CLAUDE.md`, cursor agent rule, and this changelog.
- **Areas:** `src/visuals/atmosphere.ts`, `src/visuals/planetLiquid.ts`, `src/content/planets/*`, `src/systems/cameraFollow.ts`, `src/systems/shipCamera.ts`, `src/systems/cameraOccluders.ts`, `src/ecs/gameEntity.ts`, `src/visuals/planetRocks.ts`, `src/main.ts`, `src/config/ship.ts`, `src/engine/renderer.ts`, `AGENTS.md`, `CLAUDE.md`, `docs/AGENT_CHANGELOG.md`

### 2026-07-09 — Atmosphere boost, water pass, camera fix, flat landing
- **Summary:** Strengthened space limb glow; attempted thicker on-planet sky (later partially reverted for hard line). Liquid shell + underwater HUD filter. Fixed camera spring-arm that was excluding the planet collider. Landing/spawn search for flattest nearby patch and snap ship to terrain.
- **Areas:** `src/visuals/atmosphere.ts`, `src/visuals/planetLiquid.ts`, `src/systems/cameraFollow.ts`, `src/systems/shipCamera.ts`, `src/systems/landingSite.ts`, `src/systems/shipTransition.ts`, `src/systems/possession.ts`, `src/main.ts`, `src/ui/hud.css`

### 2026-07 (earlier) — Terrain, LODs, flight, atmosphere iterations
- **Summary:** Spherified cube terrain with FBM continents / ridged mountains; mid/high LOD worker; Astroneer-like flat shading. Ship orbital frame, hyperdrive lock, momentum toggle, atmosphere-entry cushion. Surface sky dome + space limb scattering (many intensity passes). Optional planet liquids + player buoyancy. Readable toon materials; astronaut character; asteroid field.
- **Areas:** `src/worldgen/*`, `src/systems/shipFlight.ts`, `src/systems/shipPlanetInteraction.ts`, `src/visuals/atmosphere.ts`, `src/visuals/toonMaterial.ts`, `src/visuals/animatedCharacter.ts`, `src/content/planets/*`

### Project bootstrap
- **Summary:** Initial Astrobound loop: floating origin, Rapier planet trimesh, on-foot + ship possession, station, starfield, HUD/map scaffolding.
- **Areas:** `src/main.ts`, `src/engine/*`, `src/ecs/*`, `src/systems/*`
