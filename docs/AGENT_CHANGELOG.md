# Agent changelog

Living history of agent-driven changes. **Append new entries at the top** after each meaningful session.

---

### 2026-07-12 — Server build CommonJS for Colyseus/Coolify
- **Summary:** Production `dist/` was ESM (`"type": "module"` + `module: NodeNext`), so Node failed named imports from CJS Colyseus at deploy. Switched server emit to CommonJS, removed `"type": "module"`, and moved the drizzle `uniqueIndex` into the `inventories` table callback so schema loads under CJS.
- **Areas:** `server/package.json`, `server/tsconfig.json`, `server/src/db/schema.ts`
- **Notes:** Force a Coolify rebuild without cache after deploy so the old ESM `dist/` is not reused.

---

### 2026-07-11 — System shards + net debug panel
- **Summary:** Colyseus `system` rooms now `filterBy(["systemId"])` (different systems = different rooms; same system auto-shards at `MAX_CLIENTS_PER_ROOM`). Map jump rejoins the target system room in MP. L-debug right panel shows connect/room/peer/drift/reject counters. `/health` + `/match/rooms` list live rooms; README covers Ubuntu VPS + Caddy/Coolify.
- **Areas:** `server/src/index.ts`, `server/src/rooms/SystemRoom.ts`, `src/net/remoteAdapter.ts`, `src/net/adapterTypes.ts`, `src/systems/debugOverlay.ts`, `src/main.ts`, `server/README.md`, `docker-compose.yml`
- **Notes:** One Node process hosts many system rooms; Redis multi-host clustering still later.

---
- **Summary:** Wired Hold-E mining (`mine.hit` → loot + deplete + hit pulse), net-authoritative inventory move/equip/unequip/split with UUID-preserving sync, remote players load character GLTFs (capped, capsule fallback for far/impostors), ESC social rail Invite/Leave group plus in-system peers listed for invites.
- **Areas:** `src/systems/oreMining.ts`, `src/systems/remotePlayers.ts`, `src/main.ts`, `src/ui/settingsMenu.ts`, `src/sim/inventoryOps.ts`, `src/net/localAdapter.ts`, `src/net/interpolation.ts`, `server/src/services/*`
- **Notes:** Still out of scope: TLS/`wss`, full OAuth, LiveKit voice. Mining grants ore into bag (no world drop shell for deplete loot).

---
- **Summary:** Not “ship production MMO” yet, but co-presence is now fail-safe: offline fallback if server/auth down; welcome identity sync; launch/land no longer rejected as teleports; remotes convert CoordFrame → system space before render; event request queue; memory-store Docker default (no Postgres required); server README + `.env.example`.
- **Areas:** `src/sim/validate.ts`, `src/net/*`, `src/systems/remotePlayers.ts`, `src/main.ts`, `server/*`, `docker-compose.yml`
- **Notes:** Still missing durable inventory migrations, mining UI, full GLTF remotes, and TLS — see `server/README.md`.

---

### 2026-07-11 — Multiplayer review cleanup
- **Summary:** Removed accidental `tsc` emit `.js` twins under `src/sim` and `src/net` (TypeScript sources already exist). Fixed Docker build context, guest auth identity sync before Colyseus join, Admin-only V-fly gating, remote visibility, drop event → world drop wiring, trade-offer parse bug.
- **Areas:** `src/sim/*.js` (deleted), `src/net/*.js` (deleted), `.gitignore`, `server/Dockerfile`, `src/main.ts`, `src/net/createNetAdapter.ts`, `src/systems/possession.ts`, `src/systems/remotePlayers.ts`, `src/systems/worldDrops.ts`, `src/sim/expansionHooks.ts`
- **Notes:** Client `tsconfig` has `noEmit: true`; stray `.js` files were likely from a one-off emit or IDE compile into source dirs.

---

### 2026-07-11 — Multiplayer architecture (phases 0–5)
- **Summary:** NetAdapter seam (local loopback + Colyseus remote), CoordFrame-tagged protocol, client-owned transforms with dead-reckoning remotes, interest tiers, server-authoritative economy (inventory/drops/mining), guest auth + friends/groups/chat, trade/combat/market expansion hooks, Docker Compose server.
- **Areas:** `src/sim/`, `src/net/`, `src/systems/remotePlayers.ts`, `src/ui/chatPanel.ts`, `src/ui/groupCompass.ts`, `src/main.ts`, `src/ecs/components.ts`, `server/`, `docker-compose.yml`, `package.json`
- **Notes:** Single-player runs through `LocalNetAdapter` unchanged. Multiplayer: `?mp=1&server=ws://localhost:2567`. Shift+Enter toggles chat. Admin V-fly gated by session role.

---
- **Summary:** Reserved `h-12` for the XP footer so the level circle sits fully on top of the thin bar (not clipped under the viewport).
- **Areas:** `src/ui/settingsMenu.ts`

---

### 2026-07-11 — HUD Tailwind utilities
- **Summary:** Converted the remaining HUD, system map, loading, debug, marker, preview, and underwater overlay UI from `hud.css` class dependencies to Tailwind utility classes while preserving DOM IDs and behavior.
- **Areas:** `index.html`, `src/styles.css`, `src/main.ts`, `src/ui/systemMap.ts`, `src/systems/spaceHud.ts`, `src/systems/debugOverlay.ts`, `src/ui/loadingScreen.ts`, `src/systems/worldMarkers.ts`, `src/ui/itemPreview.ts`
- **Notes:** `hud.css` is no longer imported by source modules; visibility toggles now use `hidden` or Tailwind opacity utilities.

---

### 2026-07-11 — Inventory Tailwind utilities
- **Summary:** Converted the inventory UI markup from `hud.css` class names to Tailwind utility classes in `inventory.ts`, including panels, slots, rarity treatments, tooltip, drag ghost, and body-mounted context menu.
- **Areas:** `src/ui/inventory.ts`

---

### 2026-07-11 — Map clears social; slim XP bar
- **Summary:** System map is a flex sibling beside the social rail (no overlap). Bottom XP is a full-width fill only — level circle + `current / next` sit on the bar; duplicate social level badge and “Experience” label removed.
- **Areas:** `src/ui/settingsMenu.ts`

---

### 2026-07-11 — ESC menu tabs, full map, XP bar
- **Summary:** Top tabs are full header height and heavier. Map fills the whole body under the header (social floats above). Social rail drops the header; add-friend sits under the last friend; thin state uses fixed-width rows to kill the bottom scrollbar. Bottom XP bar spans the menu; level badge lives at the foot of the social rail.
- **Areas:** `src/ui/settingsMenu.ts`, `src/ui/systemMap.ts`

---

### 2026-07-11 — Restore Tailwind padding/margins
- **Summary:** Removed unlayered `* { margin:0; padding:0 }` from `index.html` — it was beating Tailwind `@layer utilities`, so every `p-*` / `m-*` / `mx-auto` computed to 0. Box-sizing stays in layered base CSS.
- **Areas:** `index.html`, `src/styles.css`

---

### 2026-07-11 — Fix ESC menu spacing/centering
- **Summary:** Menu content now centers in the main column via flex (`basis-full` + `justify-center`) after `mx-auto` failed to apply. Tightened social rail padding, card padding, vertically centers non-map tabs, hides HUD hint while open.
- **Areas:** `src/ui/settingsMenu.ts`

---

### 2026-07-11 — ESC game menu + Tailwind default
- **Summary:** Rebuilt Escape into a full-width game menu: top bar (Astrobound + Map / Character / Skills / Settings), max-width content, hover-expand social rail. Map tab embeds the system map; Character switches astronauts; Skills are placeholder cards; Settings keeps FOV/ship etc. Added Tailwind v4 (`@tailwindcss/vite`) as the UI default — removed `hud.css`, converted inventory/HUD/map/loading/debug to utility classes in `src/styles.css`.
- **Areas:** `vite.config.ts`, `src/styles.css`, `src/ui/settingsMenu.ts`, `src/ui/systemMap.ts`, `src/ui/inventory.ts`, `src/systems/spaceHud.ts`, `src/main.ts`, `index.html`

---

### 2026-07-11 — Item defs: trait/gem slot counts only
- **Summary:** Removed baked trait/gem content from mount item defs. Config now only declares `traitSlots` / `gemSlots` limits; tooltips render empty slots from those counts (instance data comes later).
- **Areas:** `src/content/items/types.ts`, `src/content/items/mounts/*/item.ts`, `src/ui/inventory.ts`

---

### 2026-07-11 — Face-on inv cam, gear tooltips, category items
- **Summary:** Inventory inspect places the camera straight-on to the character, then pans right by ~20% of screen width (character stays put; only turns). Removed inventory backdrop blur. Slot borders are 2px; item previews sit at 45° yaw. Restored gear score / 3 traits / 2 gems on equippable defs and in tooltips. Items are no longer rarity clones of one id — distinct mounts (Skiff Plank, Pulse Deck, Hoverboard, Void Rider, Starwake) under `content/items/mounts/`, ores under `content/items/ores/`.
- **Areas:** `src/systems/inventoryInspect.ts`, `src/ui/hud.css`, `src/ui/itemPreview.ts`, `src/ui/inventory.ts`, `src/content/items/**`, `src/inventory/playerInventory.ts`, `src/visuals/hoverboard.ts`

---

### 2026-07-11 — Double-click equip + inv chrome match ESC
- **Summary:** Double-clicking an equippable bag item equips it (swaps with the occupied slot). Drag starts only after a small move threshold so clicks work. Added a hoverboard for each rarity for testing. Inventory panels/slots/menus restyled to match ESC settings (system-ui, dark slate panels, 14px radius, terracotta accent, blur backdrop).
- **Areas:** `src/ui/inventory.ts`, `src/ui/hud.css`, `src/content/items/hoverboard/item.ts`, `src/content/items/index.ts`, `src/inventory/playerInventory.ts`

---

### 2026-07-11 — Split submenu + cleaner drops
- **Summary:** Context Split is a second menu step (back + slider) instead of always-visible inline controls. World drops drop the ring/orb/pad — larger item mesh, local point light, and a single upward particle plume; materials get an emissive boost so they read in shade.
- **Areas:** `src/ui/inventory.ts`, `src/ui/hud.css`, `src/systems/worldDrops.ts`, `src/content/items/silver/model.ts`

---

### 2026-07-11 — Inv cam translate, drops, boarding FX, land closer
- **Summary:** Inventory inspect no longer orbits 180° — camera only translates right + slight zoom while the player turns. Context split is inline in the right-click menu (Exo font); inventory header restyled with search + sort/stack icons. Drops are larger with glow/ring and seated on terrain; inventory previews use a fixed pose (no random yaw). Reverted soft flight gravity / atmo speed caps. Landing keeps facing, sits closer (`landedHeight` 2.15), and eases the chase cam. Boarding/exiting runs a ~1s dissolve + particle stream to/from the ship.
- **Areas:** `src/systems/inventoryInspect.ts`, `src/ui/inventory.ts`, `src/ui/hud.css`, `src/ui/itemPreview.ts`, `src/systems/worldDrops.ts`, `src/config/ship.ts`, `src/systems/shipFlight.ts`, `src/systems/shipGravity.ts`, `src/systems/shipTransition.ts`, `src/systems/shipCamera.ts`, `src/systems/shipBoardFx.ts`, `src/systems/possession.ts`, `src/main.ts`

---

### 2026-07-11 — Character orient fix, inv menu, soft ship gravity
- **Summary:** Stopped resetting the character quaternion to identity every frame (that broke planet alignment / facing). Idle facing tracks the camera again. Inventory inspect keeps a full lateral camera pan after collision clamp. Context menu/split mount on `document.body` with high z-index + pointer-events so hover/click work. Soft flight gravity returns near planets; atmosphere caps ~100 u/s with stronger brake and momentum drag.
- **Areas:** `src/main.ts`, `src/systems/playerMovement.ts`, `src/systems/inventoryInspect.ts`, `src/ui/inventory.ts`, `src/ui/hud.css`, `src/config/ship.ts`, `src/systems/shipGravity.ts`, `src/systems/shipFlight.ts`, `src/systems/shipPlanetInteraction.ts`

---

### 2026-07-11 — Inventory categories, drop/pickup, lighting, inspect cam
- **Summary:** Inventory shows filled items only, grouped by category (Mounts/Ore/Tools/…), with Sort + Stack tools, content-height equip rail, and max chrome width. Inspect camera faces the character straight-on with left framing and terrain/occluder clamps (player never moves). Context menu hover + Split slider; Drop spawns a world pickup (look + E). Drag ghost no longer sticks (`hidden` vs `display:flex`). Brighter/larger item previews. Sun lighting clamps below the local horizon and hemi ground fill is reduced at night.
- **Areas:** `src/ui/inventory.ts`, `src/ui/hud.css`, `src/ui/itemPreview.ts`, `src/systems/inventoryInspect.ts`, `src/systems/worldDrops.ts`, `src/systems/possession.ts`, `src/inventory/playerInventory.ts`, `src/content/items/types.ts`, `src/main.ts`

---

### 2026-07-11 — Inventory framing fix, item folders, silver
- **Summary:** Inventory inspect no longer translates the player (turn + camera only; stronger zoom-in and left framing). Unequip copies the stack into the first empty bag slot; drag ghost clears on drop via window pointer listeners. Item defs dropped traits/gems/gear score; each item lives in `src/content/items/<id>/{item,model}.ts` with required `stackable` + `maxStack` (default 99). Added stackable Silver (ingot model) seeded at ×48 in the bag.
- **Areas:** `src/systems/inventoryInspect.ts`, `src/ui/inventory.ts`, `src/inventory/playerInventory.ts`, `src/content/items/`, `src/ui/itemPreview.ts`, `src/visuals/hoverboard.ts`
- **Notes:** Hoverboard gameplay model now lives under `content/items/hoverboard/model.ts`; `visuals/hoverboard.ts` re-exports it.

---

### 2026-07-11 — Shadows, flight gravity, inventory framing + context menu
- **Summary:** Sun shadows follow the player/ship with a tight frustum; character/ship/hoverboard cast shadows onto terrain. Flying ships no longer take orbital gravity pull (frame matching stays). Inventory inspect zooms in and shifts the character further left; drag ghost keeps rarity border/fill; right-click menu supports Equip / Unequip / Split / Drop.
- **Areas:** `src/main.ts`, `src/engine/renderer.ts`, `src/systems/shipFlight.ts`, `src/systems/shipGravity.ts`, `src/systems/inventoryInspect.ts`, `src/ui/inventory.ts`, `src/ui/hud.css`, `src/inventory/playerInventory.ts`, `src/visuals/hoverboard.ts`, `src/visuals/animatedCharacter.ts`, `src/visuals/shipModel.ts`, `src/worldgen/planetMesh.ts`
- **Notes:** Drop currently discards the stack (no world pickup yet). Split halves into the first empty bag slot.

---

### 2026-07-11 — Inventory camera nudge + slot 3D + 80% panels
- **Summary:** Inspect camera only zooms/pans slightly while the character turns and shifts left; equip/bag panels are 80vh with scrolling; equip slots match bag cell size; all slots/tooltips/ghost use live 3D item previews (no SVG icons).
- **Areas:** `src/systems/inventoryInspect.ts`, `src/ui/itemPreview.ts`, `src/ui/inventory.ts`, `src/ui/hud.css`, `src/main.ts`

---

### 2026-07-11 — Inventory framing, smooth inspect, 3D tooltip
- **Summary:** Character inspect framing shifted away from the bag for a wider inventory grid; camera/turn/zoom ease in instead of snapping. Tooltip gear score is large-number-left + label-right; hoverboard tooltip uses a live 3D preview of the real board mesh.
- **Areas:** `src/systems/inventoryInspect.ts`, `src/ui/itemPreview.ts`, `src/ui/inventory.ts`, `src/ui/hud.css`, `src/main.ts`

---

### 2026-07-11 — Inventory New World inspect
- **Summary:** Inventory no longer blurs the world — left equip + right bag panels with the character visible in the middle. Opening Tab runs an inspect camera (character faces cam, framed off-center). Tooltips are NW-style (rarity-tinted icon header, gear score, description, 3 traits, 2 gems for mount/helmet/backpack/boots). Suit slot removed.
- **Areas:** `src/ui/inventory.ts`, `src/ui/hud.css`, `src/systems/inventoryInspect.ts`, `src/content/items/`, `src/inventory/playerInventory.ts`, `src/main.ts`

---

### 2026-07-11 — Inventory (Tab) + item defs
- **Summary:** New World–style inventory on **Tab**: equipment (Mount / Helmet / Suit / Backpack / Boots) + scrolling 5×10 bag, drag-drop, rarity tooltips. Item defs live under `src/content/items/{category}/` with a registry; Hoverboard starts equipped in Mount and is required to use **H**.
- **Areas:** `src/content/items/`, `src/inventory/playerInventory.ts`, `src/ui/inventory.ts`, `src/ui/itemIcons.ts`, `src/ui/hud.css`, `src/systems/playerMovement.ts`, `src/systems/possession.ts`, `src/main.ts`, `index.html`

---

### 2026-07-11 — Hoverboard A/D rolls + water top
- **Summary:** Air tricks are A/D roll only (W/S stay thrust); airborne strafe disabled while rolling. Water riding uses a higher clearance and hard clamp so the board stays on top of the liquid, not swimming depth.
- **Areas:** `src/systems/playerMovement.ts`, `src/config/movement.ts`, `src/systems/possession.ts`, `index.html`

---

### 2026-07-11 — Hoverboard attach, flips, plank shape
- **Summary:** Rider is parented to a board `riderAnchor` so flips stay locked together; air tricks use slow per-key axis rates (W/S pitch, A/D roll only); deck is a flat plank with tip rocker only.
- **Areas:** `src/visuals/hoverboard.ts`, `src/systems/playerMovement.ts`, `src/main.ts`, `src/config/movement.ts`
- **Notes:** Visual bob/deploy scale no longer affects the rider socket.

---

### 2026-07-11 — Hoverboard (H)
- **Summary:** Press **H** on foot to deploy a procedural hoverboard under the feet — bobbing deck, glowing hover rings, speed trail. Overrides locomotion with faster slidey speeds, low friction coasting, eased slopes, and boosted jumps (great for hills). Stows in liquid / fly mode / boarding; HUD + help text updated.
- **Areas:** `src/visuals/hoverboard.ts`, `src/systems/playerMovement.ts`, `src/config/movement.ts`, `src/ecs/components.ts`, `src/systems/possession.ts`, `src/main.ts`, `index.html`
- **Notes:** Tunables live under `MOVEMENT.hoverboard*`. Trail is local streak FX (floating-origin safe).

---

### 2026-07-11 — Uncapped debug FPS, entities, flashlight
- **Summary:** Debug (**L**) switches the game loop to an uncapped MessageChannel scheduler (soft-capped ~500fps) so FPS isn’t stuck on monitor Hz, with a live FPS sparkline, min/max, total/drawn poly counts, light level bar, and day factor. Entity wireframes show ship/character/station boxes and nearby ore spheres. **F** toggles an on-foot spotlight cone + soft point glow.
- **Areas:** `src/engine/loop.ts`, `src/engine/renderer.ts`, `src/systems/debugOverlay.ts`, `src/systems/debugEntities.ts`, `src/systems/playerFlashlight.ts`, `src/main.ts`, `src/ui/hud.css`, `index.html`
- **Notes:** Uncapped mode only while debug is on; normal play stays vsync/rAF.

---

### 2026-07-11 — Liquid LOD, face cull, boot loader, local XYZ
- **Summary:** Liquid uses the same HIGH/MID/LOW distance bands as terrain (high built on approach). Terrain and liquid are split into 6 cube-face meshes with horizon + frustum culling so the far side / behind-camera faces skip draw. Debug shows planet-local xyz (+ radius). Boot loading UI is in `index.html` so it appears before JS. Disabled text selection on body, settings, debug, and map.
- **Areas:** `src/visuals/planetLiquid.ts`, `src/worldgen/planetInstance.ts`, `src/worldgen/planetMesh.ts`, `src/worldgen/planetFaceCull.ts`, `src/systems/debugOverlay.ts`, `src/ui/loadingScreen.ts`, `src/ui/settingsMenu.ts`, `src/ui/hud.css`, `index.html`, `src/main.ts`
- **Notes:** Debug terrain/liquid poly counts now reflect visible faces only. Collider meshes remain full-sphere.

---

### 2026-07-11 — Debug overlay (L): LOD tint + F3 stats
- **Summary:** Press **L** to toggle a Minecraft-F3-style debug overlay. Terrain LODs tint green/yellow/red (HIGH/MID/LOW) with a legend; lists per-planet rendered terrain poly counts sorted highest-first; poly breakdown by category; FPS, coords, velocity, facing, mode; frame-time shares for sim / render prep / GPU submit; JS heap (Chrome), renderer geometries/textures/draw calls/tris, and GPU name when available.
- **Areas:** `src/systems/debugOverlay.ts`, `src/engine/meshStats.ts`, `src/worldgen/planetInstance.ts`, `src/main.ts`, `src/ui/hud.css`, `index.html`
- **Notes:** CPU/GPU % is frame-time share, not OS utilization. Per-LOD terrain materials so tint doesn't bleed across levels.

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
