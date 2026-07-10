# Agent changelog

Living history of agent-driven changes. **Append new entries at the top** after each meaningful session.

---

### 2026-07-10 — Massive LOD 1/2 rings + inner-first fill
- **Summary:** LOD 1 looked unchanged because depth-11 tiles couldn’t fill a wide ring under the leaf budget. Surface is now **3 bands**: LOD0 depth12 @160u, **LOD1 depth10 @14km**, **LOD2 depth8 @40km**. Splits fill LOD 0 → 1 → 2 in order; leaf/build caps raised.
- **Areas:** `src/worldgen/cubeSphereLod.ts`, `src/ui/lodDebugLegend.ts`
- **Notes:** Tune `SURFACE_RING_OUTERS` / `SURFACE_BAND_DEPTHS`. Press **L** — orange LOD1 sphere should be huge.

### 2026-07-10 — Huge LOD 1 ring + fix stalled follow
- **Summary:** 400u LOD 0 core was filling the leaf budget so the bubble stopped following. LOD 0 back to **220u**; explicit rings with **LOD 1 → 2800u** (was ~740). Raised split/merge/build caps and leaf budget so detail keeps moving with you.
- **Areas:** `src/worldgen/cubeSphereLod.ts`, `src/ui/lodDebugLegend.ts`
- **Notes:** Bands: LOD0 0–220, LOD1 220–2800, LOD2–4200, LOD3–6500, LOD4 beyond. Tune `SURFACE_RING_OUTERS`.

### 2026-07-10 — Wider LOD 0 core, mid rings further out
- **Summary:** Surface `fineRadius` 200→**400** (~2× LOD 0 band) and `LOD_STEP` 1.55→**1.85** so LOD 1–3 start further from the player. Tile depth cap unchanged (still 8..12).
- **Areas:** `src/worldgen/cubeSphereLod.ts`
- **Notes:** Approx bands @400u / ×1.85: LOD0 0–400, LOD1–740, LOD2–1370, LOD3–2530, LOD4 beyond.

### 2026-07-10 — Drop over-detailed LOD 0–2
- **Summary:** Surface finest was depths 15–13 (LOD 0–2) — far too dense. Cap is now **depth 12** (old LOD 3 tile size), so new LOD 0 = former LOD 3. Range **8..12** (5 steps); leaf budget cut 640→320.
- **Areas:** `src/worldgen/cubeSphereLod.ts`
- **Notes:** Press **L** — underfoot should read LOD 0 at depth-12 density. Say “LOD 0 denser” if underfoot needs a bump back toward old LOD 2.

### 2026-07-10 — Fix LOD bubble lock after long walks
- **Summary:** LOD stopped following after ~thousands of units because merge hysteresis required `want ≤ depth-1` while want is floored at `minDepth` (8) — so depth-9 tiles could never collapse, the leaf budget froze behind you, and underfoot couldn’t refine. Hysteresis now relaxes at the floor; `freeBudget` can merge at `minDepth`; merge/split caps raised slightly.
- **Areas:** `src/worldgen/cubeSphereLod.ts`
- **Notes:** Not caused by the LOD-0 numbering change (display-only).

### 2026-07-10 — LOD debug uses standard numbering (0 = finest)
- **Summary:** Debug key now labels **LOD 0 = finest** (standard), counting up as detail drops. Chunk tint colors follow that index. Internal quadtree depth is unchanged; `treeDepthToLod` / `lodUnderCam` bridge the two.
- **Areas:** `src/worldgen/cubeSphereLod.ts`, `src/ui/lodDebugLegend.ts`, `src/main.ts`
- **Notes:** Say “LOD 0/1/2…” when tuning — not the old depth-15 style numbers.

### 2026-07-10 — LOD debug depth key chart
- **Summary:** Press **L** now shows an on-screen **LOD DEPTH KEY**: numbered rows (`LOD 15`…`LOD 8`) with matching chunk colors, distance bands, and a live underfoot highlight. Exports `SURFACE_LOD` / `lodDebugColorHex` / `lodRingOuterRadius` for the legend.
- **Areas:** `src/ui/lodDebugLegend.ts`, `src/ui/hud.css`, `src/main.ts`, `src/worldgen/cubeSphereLod.ts`
- **Notes:** Refer to depths by number when tuning (“LOD 12 denser”, “step between 10–11”).

### 2026-07-10 — Revert broken LOD fade / depth-11 clamp
- **Summary:** Fully reverted the crossfade + maxDepth-11 + widened-ring change that left the tree stuck on huge coarse tiles (busy flags blocked further splits). Restored working surface LOD: depths **8..15**, `fineRadius` 200, immediate split/merge with stash, no fade jobs.
- **Areas:** `src/worldgen/cubeSphereLod.ts`
- **Notes:** Do not reintroduce per-split busy/fade without allowing nested refine during the fade.

### 2026-07-10 — Restore depth-11 underfoot, wider near rings, LOD crossfade
- **Summary:** *(REVERTED)* Pulled max underfoot detail back to **depth 11**… — this broke refinement; see revert entry above.

### 2026-07-10 — More mid/far LOD rings + smooth lighting + local shadows
- **Summary:** Surface LOD is now depths **8..15** (8 steps) with ×1.55 distance falloff so close-up tile sizes stay closer and mid/far get more variety; floor raised again so distant mountains stay denser. Terrain uses **smooth vertex normals** + a softer 7-band toon ramp (less faceted). Enabled a **player-local** directional shadow map (~180u ortho) — character/ship/rocks cast, near terrain receives; off in space to stay cheap.
- **Areas:** `src/worldgen/cubeSphereLod.ts`, `src/worldgen/chunkBuffers.ts`, `src/visuals/toonMaterial.ts`, `src/engine/renderer.ts`, `src/main.ts`, `src/visuals/animatedCharacter.ts`, `src/visuals/shipModel.ts`, `src/visuals/planetRocks.ts`
- **Notes:** Depths ≤7 remain space-only. Shadow map is 2048² around the floating-origin focus.

### 2026-07-10 — More on-planet LOD steps; coarse depths space-only
- **Summary:** Surface LOD now uses depths **7..13** (seven steps) with a tighter ×2.1 distance falloff for more intermediate rings. The previous two coarsest on-planet levels (5–6) are reserved for space/far only (`SPACE` minDepth 3, maxDepth 6) — too faceted for ground silhouettes.
- **Areas:** `src/worldgen/cubeSphereLod.ts`
- **Notes:** Per-mode `minDepth`/`maxDepth`. Debug **L** spheres follow the active mode’s range.

### 2026-07-10 — Gentler LOD falloff + build-budget hitching fix
- **Summary:** Distant mountains were collapsing too fast under ×2 distance falloff. Falloff is now ×2.65 per depth (quality holds farther), with a depth floor of 5. Movement hitching was from sync mesh rebuilds (each split = 4 builds); capped to ~12 builds/frame, stash near-surface parents for free merge, skip skirts on coarse tiles, defer liquid builds, and run seam balance every 4th frame.
- **Areas:** `src/worldgen/cubeSphereLod.ts`, `src/worldgen/chunkBuffers.ts`
- **Notes:** Debug **L** spheres use `fineR × 2.65ⁿ`. Tune `LOD_STEP` / `SURFACE.maxBuilds` if needed.

### 2026-07-10 — Spherical LOD bubble actually follows the player
- **Summary:** Root cause: `fineRadius` was ~1680u so almost everything wanted max depth, the leaf budget filled with a thin underfoot *spike*, and nothing could merge/refine around you. Now fine core is 220u with `/2` distance falloff; every frame merges far detail then splits *all* nearby leaves (nearest first). Playwright: after walking 1.2km underfoot stays depth 11 while spawn collapses to 4; ~70 depth-11 tiles form a real disc (not 4 spike leaves).
- **Areas:** `src/worldgen/cubeSphereLod.ts`
- **Notes:** Press **L** for debug spheres + depth colors. Tune `SURFACE.fineRadius` if the core should be wider.

### 2026-07-10 — Fix broken distance LOD + L debug viz
- **Summary:** Distant HQ patches were caused by `distToNode` subtracting inflated `cullR` (coarse tiles looked near). Now uses size-based half-extent so detail follows the player again. **L** toggles LOD debug: translucent distance spheres around the player + per-depth chunk colors.
- **Areas:** `src/worldgen/cubeSphereLod.ts`, `src/worldgen/planetInstance.ts`, `src/main.ts`
- **Notes:** Red/warm = fine, blue/purple = coarse; sphere radii = fineR × 2ⁿ.

### 2026-07-10 — Spherical LOD bubble + geometric falloff
- **Summary:** LOD is now a 3D sphere around the player/ship (not surface-only angles). Finest ring is ~5× wider (`fineRadiusFrac` 0.06). Each doubling of distance drops one depth level. Flying above no longer switches to cheap space mode — deep LOD stays while near the planet.
- **Areas:** `src/worldgen/cubeSphereLod.ts`, `src/main.ts`
- **Notes:** Impostor only beyond ~3.5 planet-radii altitude.

### 2026-07-10 — Surface/space LOD modes + finer underfoot
- **Summary:** Removed impostor underlay (was poking through fine tiles). Added `surface` vs `space` LOD budgets: surface goes to depth 12 (~10× finer underfoot) with fast refine-while-walking; space stays shallow/impostor. Rocks/ore only draw in surface mode. Water waves scale amp+freq per chunk depth via `aWaveScale`.
- **Areas:** `src/worldgen/cubeSphereLod.ts`, `src/worldgen/planetInstance.ts`, `src/main.ts`, `src/worldgen/chunkBuffers.ts`
- **Notes:** Surface mode when on-foot/landed below ~0.12 planet-radii altitude.

### 2026-07-10 — LOD perf + behind-camera cull
- **Summary:** Cut hitching from sync chunk builds: leaf cap ~280, ≤6 splits / ≤10 merges per frame, cheaper segs/skirts, throttled structure updates. Cull uses camera forward + tight surface bounds (not skirt-inflated spheres) so tiles behind the camera and off-frustum stay hidden.
- **Areas:** `src/worldgen/cubeSphereLod.ts`, `src/worldgen/chunkBuffers.ts`, `src/main.ts`
- **Notes:** Impostor underlay still fills seam cracks; cull runs every frame even when structure work is skipped.

### 2026-07-10 — LOD follow + seam fix
- **Summary:** Detail now tracks the player while walking: UV coverage test, per-child merge (so spawn no longer pins the leaf budget), forced underfoot refine each frame, ring-first split budget, smoother concentric falloff. Black chunk lines mitigated by terrain-colored two-sided skirts (full relief drop), UV bleed, neighbor depth balancing, and a shrunk impostor underlay under active chunks so cracks never show sky.
- **Areas:** `src/worldgen/cubeSphereLod.ts`, `src/worldgen/chunkBuffers.ts`
- **Notes:** Verified walk ~0.5 rad keeps underfoot depth ~9–10 while spawn collapses to ~3–4.

### 2026-07-10 — Concentric player-centered LOD (rewrite)
- **Summary:** Threw out spike/ring/keep-cone hacks. Every tile now has a target depth from angular distance to the *player* (fine underfoot → coarse outward). Each frame: merge anything finer than target (farthest first), then split anything coarser (nearest first). LOD focus uses player planet-local position, not the camera boom. Verified concentric depth rings while walking.
- **Areas:** `src/worldgen/cubeSphereLod.ts`, `src/worldgen/planetInstance.ts`, `src/main.ts`, `scripts/test-lod-concentric.mjs`
- **Notes:** Skirts still hide seam gaps. Budget reclaim never strips the near ring.

### 2026-07-10 — LOD finally follows the player (angular bubble)
- **Summary:** Spawn detail was locking the leaf budget inside a too-wide keep cone, so walking away left new ground coarse forever. LOD now collapses by *angle* outside a ~31° bubble every frame, then force-refines underfoot + ring + bubble pass. Deeper colored skirts hide chunk/LOD seams. Verified: after walking ~0.75 rad, underfoot depth stays 10 while spawn collapses to ~4.
- **Areas:** `src/worldgen/cubeSphereLod.ts`, `src/worldgen/chunkBuffers.ts`, `scripts/test-lod-follow.mjs`
- **Notes:** KEEP_ANGLE 0.55 rad; collapse runs *before* refine so budget moves with the player.

### 2026-07-10 — Nearby chunks refine by proximity
- **Summary:** Large low-poly tiles beside the player stayed coarse because LOD used distance-to-*center* (centers looked far). Now uses distance to chunk bounds + a distance→target-depth table, splits nearest coarse leaves every frame before underfoot refine, and frees budget outside a keep cone so the bubble can catch up.
- **Areas:** `src/worldgen/cubeSphereLod.ts`
- **Notes:** Standing next to a coarse tile should subdivide it within a few frames without walking into its middle.

### 2026-07-10 — LOD perf: cull + cheaper builds + seam balance
- **Summary:** Cut hitching from sync chunk builds and overdraw. Frustum + horizon cull hide back-face / off-screen tiles; variable segment counts by depth; leaf/split budgets lowered; refine work spread across frames. Neighbor depth-balance pass + deeper skirts stitch LOD seams.
- **Areas:** `src/worldgen/cubeSphereLod.ts`, `src/worldgen/chunkBuffers.ts`
- **Notes:** Coarse tiles 8–12 segs, fine 16–20; max ~8 splits/frame; ~360 leaf cap.

### 2026-07-10 — Fix LOD freeze (safe 2-phase + correct underfoot)
- **Summary:** LOD was refining the *wrong* tiles (cube UV inverse ignored `spherify`) and merging mid-walk (orphaned meshes / leaf-budget desync), so after a few seconds the world froze at coarse detail. Rewrote update as merge→free→force-refine→split phases; underfoot picks nearest child by angle. Added chunk edge skirts; denser chunk grids (24). Playwright walk stress: depth-10 / ~30u tiles stay under the player while moving.
- **Areas:** `src/worldgen/cubeSphereLod.ts`, `src/worldgen/chunkBuffers.ts`, `src/main.ts`, `scripts/test-lod.mjs`
- **Notes:** `__dbg.lodDebug()` exposes leaves / depthUnderCam / impostor for probes.

### 2026-07-10 — Distance LOD rewrite, equal fly axes
- **Summary:** Replaced angular/force-refine LOD with classic geometric distance split/merge (edge vs camera distance + hysteresis) so detail follows the player. Impostor never draws under active chunks (fixes under-map pops). Removed non-working ESC LOD sliders. Fly mode uses one speed for tangent + vertical axes.
- **Areas:** `src/worldgen/cubeSphereLod.ts`, `src/config/settings.ts`, `src/ui/settingsMenu.ts`, `src/config/movement.ts`, `src/systems/playerMovement.ts`
- **Notes:** Split when chunk edge > dist/3.2; merge when edge < dist/5.8. Impostor above ~2.5 planet-radii altitude.

### 2026-07-10 — Finer LOD, chunked water, ESC LOD sliders
- **Summary:** Near terrain refine depth ~10× finer (settings-driven). Liquid uses the same cube-sphere quadtree as land. Coarsest impostor only appears off-planet (past Far LOD altitude); on-world tiles never collapse below a mid floor. ESC settings: Near terrain detail, Detail distance, Far LOD altitude.
- **Areas:** `src/config/settings.ts`, `src/ui/settingsMenu.ts`, `src/worldgen/cubeSphereLod.ts`, `src/worldgen/chunkBuffers.ts`, `src/worldgen/planetInstance.ts`, `src/visuals/planetLiquid.ts`
- **Notes:** Defaults: detail 1.2, distance 1.15, far altitude 2.8 planet-radii.

### 2026-07-10 — LOD follows player while walking
- **Summary:** Fixed stuck low-LOD away from spawn. Spawn deep-tiles were holding the leaf budget; far free used Euclidean thresholds too large to reclaim them. LOD now collapses by *angular* distance from the player each frame, then force-refines underfoot + a walking ring + look-ahead so detail moves with you.
- **Areas:** `src/worldgen/cubeSphereLod.ts`
- **Notes:** KEEP_ANGLE / REFINE_ANGLE tune the detail bubble around the player.

### 2026-07-10 — Fix distant planets + LOD holes
- **Summary:** Raised camera far plane to 25M so mega-scale planets/star are not clipped. Rewrote cube-sphere LOD to be hole-free (sync 4-child splits, impostor always underlays chunks, frustum cull off). Fog only while inside atmosphere so other worlds stay visible in space. Underfoot refine frees far-chunk budget so detail updates as you walk. Star meshes no longer frustum-culled at range.
- **Areas:** `src/engine/renderer.ts`, `src/worldgen/cubeSphereLod.ts`, `src/main.ts`, `src/visuals/star.ts`
- **Notes:** If a planet still looks coarse underfoot, leaf budget may be saturated — far tiles collapse to make room.

### 2026-07-10 — Mega-scale planets + cube-sphere chunked LOD
- **Summary:** Scaled home system ~50× (planet radii, orbits, star, atmospheres). Replaced whole-planet mesh LOD with cube-sphere quadtree chunked LOD (impostor at distance, adaptive face patches near surface, forced underfoot refine). Richer terrain FBM (micro-detail, dunes, terraces). Volumetric-style atmosphere shells + layered lit clouds. Kepler orbits frozen via `STATIC_ORBITS` (zero orbital velocity) for stability/perf while iterating. Ship cruise/warp/land altitudes and on-foot fly speeds raised for the new distances.
- **Areas:** `src/config/scale.ts`, `src/config/ship.ts`, `src/config/movement.ts`, `src/config/star.ts`, `src/content/planets/*`, `src/content/station.ts`, `src/worldgen/cubeSphereLod.ts`, `src/worldgen/chunkBuffers.ts`, `src/worldgen/planetInstance.ts`, `src/worldgen/planet.ts`, `src/worldgen/orbits.ts`, `src/worldgen/generateSystem.ts`, `src/visuals/atmosphere.ts`, `src/visuals/planetLiquid.ts`, `src/visuals/planetRocks.ts`, `src/main.ts`
- **Notes:** Toggle orbits with `STATIC_ORBITS` in `src/config/scale.ts`. Chunk LOD still tuning near-field poly density vs leaf budget; liquid remains a moderate full-sphere mesh (not chunked yet).

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

### 2026-07-10 — Hard-coded LOD bands; remove debug spheres
- **Summary:** Removed distracting LOD distance-band spheres from debug view. Replaced geometric/partial band falloff with a single hard-coded `LOD_BANDS` table (LOD 0–9 with explicit outer distances + depths). Legend always lists every band so distant chunk colors match the key. Surface minDepth lowered to 3 so far bands can actually coarsen.
- **Areas:** `src/worldgen/cubeSphereLod.ts`, `src/ui/lodDebugLegend.ts`, `docs/AGENT_CHANGELOG.md`

### 2026-07-10 — LOD debug lists all depth stages; remove hint fluff
- **Summary:** Legend was only showing surface *band targets* (3 rows) while the quadtree still has a leaf at every depth from max→min (visibly different densities/colors). Now lists every continuous LOD step, colors debug by `maxDepth - depth`, and removed the example “Say e.g. LOD 2 denser…” hint text.
- **Areas:** `src/ui/lodDebugLegend.ts`, `src/worldgen/cubeSphereLod.ts`, `docs/AGENT_CHANGELOG.md`

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
