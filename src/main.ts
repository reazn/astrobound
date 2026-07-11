import { Vector3, Quaternion, Object3D } from "three";
import { createRng } from "./engine/rng";
import { createRenderer } from "./engine/renderer";
import { initPhysics } from "./engine/physics";
import { createInput } from "./engine/input";
import { createLoop } from "./engine/loop";
import { renderRelative } from "./engine/floatingOrigin";
import { orientOnSurface, basisQuaternion } from "./engine/surfaceOrient";
import { game } from "./engine/gameState";
import { createWorld } from "./ecs/world";
import type { Entity } from "./ecs/components";
import { createPlanetInstance, type PlanetInstance } from "./worldgen/planetInstance";
import { orbitPositionAt } from "./worldgen/orbits";
import { PLANET_REGISTRY, HOME_PLANET } from "./content/planets";
import { STATION_NAME, STATION_RADIUS, STATION_ORBIT } from "./content/station";
import { characterById, CHARACTERS } from "./content/characters";
import { shipById, SHIPS } from "./content/ships";
import { loadGltf } from "./engine/gltfCache";
import { loadCharacterSource, createAnimatedCharacter, type AnimatedCharacter } from "./visuals/animatedCharacter";
import { loadShipModel, type ShipModel } from "./visuals/shipModel";
import { createStar } from "./visuals/star";
import { createStation } from "./visuals/station";
import { createStarfield, setStarfieldOpacity } from "./visuals/sky";
import { createCameraRig, updateCameraFollow } from "./systems/cameraFollow";
import { updateInventoryInspect, resetInventoryInspect, beginInventoryInspect } from "./systems/inventoryInspect";
import { updateShipCamera } from "./systems/shipCamera";
import { updatePossession, type PossessionState } from "./systems/possession";
import { createSpaceHud, type NavTarget } from "./systems/spaceHud";
import { createDebugOverlay } from "./systems/debugOverlay";
import { createDebugEntities } from "./systems/debugEntities";
import { createPlayerFlashlight } from "./systems/playerFlashlight";
import { createShipBoardFx } from "./systems/shipBoardFx";
import { createHoverboard } from "./visuals/hoverboard";
import { countVisibleTriangles, meshTriangleCount } from "./engine/meshStats";
import { createWorldMarkers, type MarkerBody } from "./systems/worldMarkers";
import { createSystemMap, type MapBody } from "./ui/systemMap";
import {
  spawnWorldDrop, updateWorldDrops, rebindWorldDropOccluders,
} from "./systems/worldDrops";
import { createInventoryUI } from "./ui/inventory";
import { createPlayerInventory } from "./inventory/playerInventory";
import { settings } from "./config/settings";
import {
  createKnownSystemsCatalog, discoverKnownSystem, mapBodiesFromSystemDef,
  type KnownSystem,
} from "./content/systems/catalog";
import { loadAsteroidField } from "./visuals/asteroids";
import { createWarpFx } from "./visuals/warpFx";
import { speedRelativeToPlanet, orbitalFrameVelocity } from "./systems/shipGravity";
import { createSettingsMenu, type SettingsMenu } from "./ui/settingsMenu";
import { createLoadingScreen } from "./ui/loadingScreen";
import { buildWorldSnapshot } from "./net/buildSnapshot";
import { findFlatLandingNormal, landingRestPosition } from "./systems/landingSite";
import {
  clearCameraOccluders, registerCameraOccluder,
} from "./systems/cameraOccluders";
import { describeEntity } from "./ecs/gameEntity";
import { SHIP } from "./config/ship";
import { starDefFromHome, type StarDef } from "./config/star";
import { MOVEMENT } from "./config/movement";
import "./styles.css";

const PLAYER_HEIGHT = 1.9;

function tangentAt(up: Vector3, out: Vector3): Vector3 {
  out.set(1, 0, 0).addScaledVector(up, -out.dot(up));
  if (out.lengthSq() < 1e-6) out.set(0, 0, 1).addScaledVector(up, -up.z);
  return out.normalize();
}

function nearestPlanet(systemPos: Vector3, planets: PlanetInstance[]): PlanetInstance {
  let best = planets[0], bestD = Infinity;
  for (const p of planets) {
    const d = systemPos.distanceTo(p.systemPosition);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

const STAR_POS = new Vector3(0, 0, 0);

async function main() {
  const container = document.getElementById("app")!;
  const promptEl = document.getElementById("prompt");
  const loading = createLoadingScreen(document.body);
  loading.setProgress(0.02, "Charting orbits…");

  const rng = createRng("solar-001");

  let planets: PlanetInstance[] = [];
  for (let i = 0; i < PLANET_REGISTRY.length; i++) {
    const def = PLANET_REGISTRY[i];
    loading.setProgress(0.05 + (i / PLANET_REGISTRY.length) * 0.55, `Forming ${def.name}…`);
    planets.push(await createPlanetInstance(def));
  }
  let home = planets.find((p) => p.def.id === HOME_PLANET.id)!;
  let activeStar: StarDef = starDefFromHome();
  let stationEnabled = true;
  let systemJumpBusy = false;
  const stationSystemPos = new Vector3();
  const stationPrevPos = new Vector3();
  for (const p of planets) {
    orbitPositionAt(p.def.orbit, 0, p.systemPosition);
    p.prevSystemPosition.copy(p.systemPosition);
  }
  orbitPositionAt(STATION_ORBIT, 0, stationSystemPos);
  stationPrevPos.copy(stationSystemPos);

  loading.setProgress(0.62, "Lighting the star…");
  const rc = createRenderer(container);
  for (const p of planets) {
    rc.scene.add(p.lod);
    rc.scene.add(p.atmosphere.skyDome);
  }
  const star = createStar(activeStar);
  rc.scene.add(star.group);
  const stationVisual = createStation();
  rc.scene.add(stationVisual.group);
  const starfield = createStarfield(rng.world);
  rc.scene.add(starfield);
  const warpFx = createWarpFx();
  rc.scene.add(warpFx.mesh);

  loading.setProgress(0.72, "Warming thrusters…");
  const physics = await initPhysics();
  physics.setActivePlanet(home.colliderVertices, home.colliderIndices);

  const asteroidRng = createRng("asteroids-001").world;
  const charDef0 = characterById(settings.selectedCharacterId);
  loading.setProgress(0.8, "Loading crew & hull…");
  const [playerSource, shipModel0, asteroids] = await Promise.all([
    loadCharacterSource(charDef0.url),
    loadShipModel(settings.selectedShipId),
    loadAsteroidField(asteroidRng),
  ]);
  loading.setProgress(0.92, "Final checks…");

  // Prefetch remaining appearance GLTFs in the background so ESC previews
  // and swaps hit the shared cache instead of the network.
  for (const s of SHIPS) void loadGltf(s.url);
  for (const c of CHARACTERS) void loadGltf(c.url);
  let character: AnimatedCharacter = createAnimatedCharacter(
    playerSource, charDef0.clips, charDef0.modelYaw,
  );
  character.object.scale.setScalar(PLAYER_HEIGHT / character.height);
  character.object.renderOrder = 10;
  character.object.traverse((o) => { o.renderOrder = 10; });
  rc.scene.add(character.object);
  let currentCharacterId = charDef0.id;
  let shipModel: ShipModel = shipModel0;
  rc.scene.add(asteroids.mesh);
  let asteroidBodies = planets.map((p) => ({
    systemPosition: p.systemPosition, maxR: p.planet.maxR,
  }));

  const spawnSeed = new Vector3(0.1, 1, 0.15).normalize();
  const spawnUp = findFlatLandingNormal(home, spawnSeed, new Vector3());
  let spawnR = home.planet.surfaceRadius(spawnUp.x, spawnUp.y, spawnUp.z) + 2;
  if (home.planet.def.liquid) spawnR = Math.max(spawnR, home.planet.seaLevel + 2);
  const spawnPos = spawnUp.clone().multiplyScalar(spawnR);
  const face0 = tangentAt(spawnUp, new Vector3());

  const world = createWorld();
  const player: Entity = world.add({
    player: true as const,
    position: spawnPos.clone(),
    prevPosition: spawnPos.clone(),
    movement: {
      velocity: new Vector3(), grounded: false, jumpsLeft: 0, coyote: 0, buffer: 0,
      sliding: false, slideTime: 0, slideCooldown: 0, up: spawnUp.clone(),
      faceDir: face0.clone(), speed01: 0, didJump: false, didSlide: false, flying: false, inLiquid: false,
      hoverboarding: false, hoverPitch: 0, hoverRoll: 0, hoverPitchVel: 0, hoverRollVel: 0,
    },
    stats: { moveSpeedMult: 1, extraJumps: MOVEMENT.baseExtraJumps, jumpHeightMult: 1 },
    character,
    mesh: character.object,
  });

  rc.scene.add(shipModel.group);
  shipModel.group.renderOrder = 10;
  shipModel.group.traverse((o) => { o.renderOrder = 10; });

  const shipSeed = spawnPos.clone().addScaledVector(face0, 10).normalize();
  const shipUp = findFlatLandingNormal(home, shipSeed, new Vector3());
  const shipLocalPos = landingRestPosition(home, shipUp, new Vector3());
  const shipFaceDir = tangentAt(shipUp, face0.clone());

  const ship: Entity = world.add({
    ship: {
      mode: "landed", velocity: new Vector3(), orientation: new Quaternion(),
      throttle: 0, boostFuel: 1, boosting: false,
      steerX: 0, steerY: 0, angVel: new Vector3(),
      warpPhase: "idle", warpTargetId: PLANET_REGISTRY.find((p) => p.id !== HOME_PLANET.id)?.id ?? null,
      warpT: 0, warpFrom: new Vector3(), warpTo: new Vector3(),
      phaseT: 0, phaseFrom: new Vector3(), phaseTo: new Vector3(),
      dockBay: null, inAtmospherePlanetId: null,
    },
    position: shipLocalPos,
    prevPosition: shipLocalPos.clone(),
    up: shipUp.clone(),
    faceDir: shipFaceDir,
    mesh: shipModel.group,
  });
  basisQuaternion(shipUp, shipFaceDir, ship.ship!.orientation);

  const onFootRig = createCameraRig();
  onFootRig.forward.copy(face0);

  let shipSwapBusy = false;
  let charSwapBusy = false;
  const swapShip = async (shipId: string) => {
    if (shipSwapBusy || shipModel.def.id === shipId) return;
    shipSwapBusy = true;
    try {
      const next = await loadShipModel(shipId);
      const prev = shipModel;
      next.group.renderOrder = 10;
      next.group.traverse((o) => { o.renderOrder = 10; });
      next.group.position.copy(prev.group.position);
      next.group.quaternion.copy(prev.group.quaternion);
      next.group.visible = prev.group.visible;
      rc.scene.add(next.group);
      ship.mesh = next.group;
      shipModel = next;
      const shipMk = markerBodies.find((m) => m.id === "player-ship");
      if (shipMk) shipMk.name = next.def.name;
      prev.dispose();
    } finally {
      shipSwapBusy = false;
    }
  };
  const swapCharacter = async (characterId: string) => {
    if (charSwapBusy || currentCharacterId === characterId) return;
    charSwapBusy = true;
    try {
      const def = characterById(characterId);
      const source = await loadCharacterSource(def.url);
      const next = createAnimatedCharacter(source, def.clips, def.modelYaw);
      next.object.scale.setScalar(PLAYER_HEIGHT / next.height);
      next.object.renderOrder = 10;
      next.object.traverse((o) => { o.renderOrder = 10; });
      next.object.visible = character.object.visible;
      next.object.position.set(0, 0, 0);
      next.object.quaternion.identity();
      const riding = player.movement?.hoverboarding;
      if (riding) hoverboard.riderAnchor.add(next.object);
      else rc.scene.add(next.object);
      const prev = character;
      character = next;
      currentCharacterId = characterId;
      player.character = next;
      player.mesh = next.object;
      prev.object.removeFromParent();
    } finally {
      charSwapBusy = false;
    }
  };

  let menu: SettingsMenu;
  const input = createInput(rc.renderer.domElement, () => menu.open());
  menu = createSettingsMenu(input, rc.camera, {
    appearance: {
      onShipChange: swapShip,
      onCharacterChange: swapCharacter,
    },
  });
  const hud = createSpaceHud(document.body);
  const debugOverlay = createDebugOverlay(document.body);
  const debugEntities = createDebugEntities(rc.scene);
  const flashlight = createPlayerFlashlight(rc.scene);
  const hoverboard = createHoverboard();
  rc.scene.add(hoverboard.group);
  rc.scene.add(hoverboard.trail);
  const flashForward = new Vector3();
  const hoverBoardQ = new Quaternion();
  const hoverPitchQ = new Quaternion();
  const hoverRollQ = new Quaternion();
  const hoverRight = new Vector3();
  let gameLoop: ReturnType<typeof createLoop>;
  let simMsAccum = 0;
  let lastFrameMs = 16.7;
  let lastPrepMs = 0;
  let lastGpuMs = 0;
  let lastDayFactor = 1;
  let lastLightLevel = 1;
  const underFilter = document.createElement("div");
  underFilter.className = "pointer-events-none fixed inset-0 z-10 bg-teal-900/25 opacity-0 transition-opacity duration-200 shadow-[inset_0_0_120px_rgba(0,20,40,0.55)] mix-blend-multiply";
  document.body.appendChild(underFilter);

  const shipSystemPos = new Vector3();
  const shipMarkerAnchor = new Object3D();
  rc.scene.add(shipMarkerAnchor);

  // In-world markers: celestials while piloting; ship icon while on foot.
  let markerBodies: MarkerBody[] = [
    ...planets.map((p) => ({
      id: p.def.id,
      name: p.def.name, kind: "planet" as const, color: p.def.palette.atmosphere,
      parent: p.lod, systemPosition: p.systemPosition, radius: p.planet.maxR,
      showWhen: ["ship"] as const,
    })),
    {
      id: "station",
      name: STATION_NAME, kind: "station" as const, color: "#7ab0ff",
      parent: stationVisual.group, systemPosition: stationSystemPos, radius: STATION_RADIUS,
      showWhen: ["ship"] as const,
    },
    {
      id: "player-ship",
      name: shipById(settings.selectedShipId).name,
      kind: "ship" as const,
      color: "#7fffd0",
      parent: shipMarkerAnchor,
      systemPosition: shipSystemPos,
      radius: SHIP.length * 0.5,
      showWhen: ["onFoot"] as const,
    },
  ];
  const worldMarkers = createWorldMarkers(container, markerBodies);
  worldMarkers.setSize(window.innerWidth, window.innerHeight);
  window.addEventListener("resize", () =>
    worldMarkers.setSize(window.innerWidth, window.innerHeight));

  // Solar-system map (M). Pause game input while it's open so you don't fly blind.
  // Known systems are lightweight defs — preview in the map; teleport loads meshes.
  const knownSystems: KnownSystem[] = createKnownSystemsCatalog(6);
  let activeSystemId = knownSystems[0].def.id;
  let previewSystemId = activeSystemId;

  const systemMap = createSystemMap(document.body, {
    onToggle: (open) => {
      if (open && inventoryUI.open) inventoryUI.setOpen(false);
      input.setPaused(open || inventoryUI.open || menu.isOpen);
      if (open) input.exitLock();
    },
    onSelectSystem: (id) => {
      previewSystemId = id;
      systemMap.setCatalog(knownSystems, activeSystemId, previewSystemId);
    },
    onTeleport: (id) => jumpToKnownSystem(id),
    onDiscover: () => {
      const entry = discoverKnownSystem(knownSystems);
      previewSystemId = entry.def.id;
      systemMap.setCatalog(knownSystems, activeSystemId, previewSystemId);
      hud.setPrompt(`Discovered ${entry.def.name}`);
    },
  });
  systemMap.setCatalog(knownSystems, activeSystemId, previewSystemId);
  menu.bindSystemMap(systemMap);
  systemMap.setKeybindsEnabled(false);

  const state: PossessionState = {
    mode: "onFoot", currentPlanet: home, dockBay: null, boardPhase: "idle",
  };
  const boardFx = createShipBoardFx();
  rc.scene.add(boardFx.group);

  const dropSpawnPos = new Vector3();
  const playerInventory = createPlayerInventory();
  const inventoryUI = createInventoryUI(document.body, playerInventory, {
    canOpen: () => !menu.isOpen && !systemMap.open && state.mode === "onFoot"
      && state.boardPhase === "idle",
    onToggle: (open) => {
      input.setPaused(open || systemMap.open || menu.isOpen);
      if (open) {
        input.exitLock();
        beginInventoryInspect(rc.camera, player.movement!.up);
      } else if (settings.cursorLocked && !systemMap.open && !menu.isOpen) {
        input.requestLock();
        resetInventoryInspect();
      } else {
        resetInventoryInspect();
      }
    },
    onDropItem: (itemId, qty) => {
      const m = player.movement!;
      dropSpawnPos.copy(player.position!)
        .addScaledVector(m.faceDir, 1.2)
        .addScaledVector(m.up, 0.35);
      const n = dropSpawnPos.clone().normalize();
      const r = state.currentPlanet.planet.surfaceRadius(n.x, n.y, n.z) + 0.35;
      dropSpawnPos.copy(n).multiplyScalar(r);
      spawnWorldDrop(state.currentPlanet, dropSpawnPos, itemId, qty);
    },
  });

  const interpLocal = new Vector3();
  const interpBody = new Vector3();
  const renderOrigin = new Vector3();
  const shipLocalCam = new Vector3();
  const tmpVec = new Vector3();
  const sunDir = new Vector3();
  const camWorldPos = new Vector3();
  const camForward = new Vector3();
  const camRight = new Vector3();
  const atmoUp = new Vector3();
  const shipForward = new Vector3();
  const aimDirSystem = new Vector3(0, 0, -1);
  const camPlanetLocal = new Vector3();
  const asteroidFrameVel = new Vector3();
  const shipOccluderCenter = new Vector3();
  let activeColliderPlanetId = home.def.id;
  let registeredRockPlanetId: string | null = null;
  let lastRenderT = performance.now();
  let simTick = 0;

  const syncCameraOccluders = (planet: PlanetInstance) => {
    clearCameraOccluders();
    registerCameraOccluder({
      desc: describeEntity("player-ship", "ship", { label: "Player ship" }),
      enabled: true,
      getCenter: (out) => out.copy(shipOccluderCenter),
    });
    const rocks = planet.rocks;
    for (let i = 0; i < rocks.centers.length; i++) {
      const c = rocks.centers[i];
      const r = rocks.radii[i];
      registerCameraOccluder({
        desc: describeEntity(`rock-${planet.def.id}-${i}`, "rock", {
          label: "Rock",
          cameraRadius: Math.max(1.2, r),
        }),
        enabled: true,
        getCenter: (out) => out.copy(c),
      });
    }
    const ore = planet.ore;
    for (let i = 0; i < ore.centers.length; i++) {
      const c = ore.centers[i];
      const r = ore.radii[i];
      registerCameraOccluder({
        desc: describeEntity(`ore-${planet.def.id}-${i}`, "rock", {
          label: "Ore",
          cameraRadius: Math.max(0.8, r),
        }),
        enabled: true,
        getCenter: (out) => out.copy(c),
      });
    }
    registeredRockPlanetId = planet.def.id;
    rebindWorldDropOccluders();
  };
  syncCameraOccluders(home);

  const rebuildNavBodies = () => {
    markerBodies = [
      ...planets.map((p) => ({
        id: p.def.id,
        name: p.def.name, kind: "planet" as const, color: p.def.palette.atmosphere,
        parent: p.lod, systemPosition: p.systemPosition, radius: p.planet.maxR,
        showWhen: ["ship"] as const,
      })),
      ...(stationEnabled ? [{
        id: "station",
        name: STATION_NAME, kind: "station" as const, color: "#7ab0ff",
        parent: stationVisual.group, systemPosition: stationSystemPos, radius: STATION_RADIUS,
        showWhen: ["ship"] as const,
      }] : []),
      {
        id: "player-ship",
        name: shipById(settings.selectedShipId).name,
        kind: "ship" as const,
        color: "#7fffd0",
        parent: shipMarkerAnchor,
        systemPosition: shipSystemPos,
        radius: SHIP.length * 0.5,
        showWhen: ["onFoot"] as const,
      },
    ];
    worldMarkers.setBodies(markerBodies);
    asteroidBodies = planets.map((p) => ({
      systemPosition: p.systemPosition, maxR: p.planet.maxR,
    }));
  };

  const previewBodiesFor = (systemId: string): MapBody[] => {
    const entry = knownSystems.find((s) => s.def.id === systemId) ?? knownSystems[0];
    return mapBodiesFromSystemDef(entry.def, game.time, entry.def.handcrafted);
  };

  const placeOnPlanet = (planet: PlanetInstance) => {
    const seed = new Vector3(rng.world() * 2 - 1, rng.world() * 2 - 1, rng.world() * 2 - 1).normalize();
    const up = findFlatLandingNormal(planet, seed, new Vector3());
    let r = planet.planet.surfaceRadius(up.x, up.y, up.z) + 2;
    if (planet.planet.def.liquid) r = Math.max(r, planet.planet.seaLevel + 2);
    const pos = up.clone().multiplyScalar(r);
    const face = tangentAt(up, new Vector3());
    player.position!.copy(pos);
    player.prevPosition!.copy(pos);
    player.movement!.up.copy(up);
    player.movement!.faceDir.copy(face);
    player.movement!.velocity.set(0, 0, 0);
    onFootRig.forward.copy(face);

    const shipSeed = pos.clone().addScaledVector(face, 10).normalize();
    const shipUp = findFlatLandingNormal(planet, shipSeed, new Vector3());
    const shipLocal = landingRestPosition(planet, shipUp, new Vector3());
    const shipFace = tangentAt(shipUp, face.clone());
    ship.position!.copy(shipLocal);
    ship.prevPosition!.copy(shipLocal);
    ship.up!.copy(shipUp);
    ship.faceDir!.copy(shipFace);
    basisQuaternion(shipUp, shipFace, ship.ship!.orientation);
    ship.ship!.mode = "landed";
    ship.ship!.velocity.set(0, 0, 0);
    ship.ship!.warpPhase = "idle";
    ship.ship!.warpT = 0;
    ship.ship!.warpTargetId = planet.def.id;
    ship.ship!.throttle = 0;
    ship.ship!.dockBay = null;
    state.mode = "onFoot";
    state.currentPlanet = planet;
    state.dockBay = null;
    physics.setActivePlanet(planet.colliderVertices, planet.colliderIndices);
    activeColliderPlanetId = planet.def.id;
    syncCameraOccluders(planet);
  };

  const jumpToKnownSystem = async (systemId: string) => {
    if (systemJumpBusy || systemId === activeSystemId) return;
    const entry = knownSystems.find((s) => s.def.id === systemId);
    if (!entry) return;
    systemJumpBusy = true;
    systemMap.setTeleportBusy(true);
    hud.setPrompt(`Jumping to ${entry.def.name}…`);
    try {
      const sys = entry.def;
      const nextPlanets: PlanetInstance[] = [];
      for (const def of sys.planets) {
        nextPlanets.push(await createPlanetInstance(def));
      }
      for (const p of planets) p.dispose();
      planets = nextPlanets;
      home = planets[Math.floor(rng.world() * planets.length)]!;
      activeStar = sys.star;
      star.applyDef(activeStar);
      rc.sun.color.set(activeStar.color);
      stationEnabled = sys.handcrafted;
      stationVisual.group.visible = stationEnabled;
      game.time = 0;
      for (const p of planets) {
        rc.scene.add(p.lod);
        rc.scene.add(p.atmosphere.skyDome);
        orbitPositionAt(p.def.orbit, 0, p.systemPosition);
        p.prevSystemPosition.copy(p.systemPosition);
      }
      debugOverlay.applyPlanetTints(planets);
      if (stationEnabled) {
        orbitPositionAt(STATION_ORBIT, 0, stationSystemPos);
        stationPrevPos.copy(stationSystemPos);
      }
      activeSystemId = sys.id;
      previewSystemId = sys.id;
      rebuildNavBodies();
      placeOnPlanet(home);
      systemMap.setCatalog(knownSystems, activeSystemId, previewSystemId);
      hud.setPrompt(
        `Arrived: ${sys.name} · ${sys.star.type} star · ${planets.length} worlds · landed on ${home.def.name}`,
      );
    } catch (err) {
      console.error(err);
      hud.setPrompt("System jump failed");
    } finally {
      systemJumpBusy = false;
      systemMap.setTeleportBusy(false);
    }
  };

  const simStep = (dt: number) => {
    const simT0 = performance.now();
    game.time += dt;
    simTick++;
    for (const p of planets) p.prevSystemPosition.copy(p.systemPosition);
    if (stationEnabled) stationPrevPos.copy(stationSystemPos);
    for (const p of planets) orbitPositionAt(p.def.orbit, game.time, p.systemPosition);
    if (stationEnabled) orbitPositionAt(STATION_ORBIT, game.time, stationSystemPos);

    if (input.justPressed("KeyN") && state.mode === "ship") {
      settings.maintainMomentum = !settings.maintainMomentum;
    }

    if (input.justPressed("KeyL")) {
      const on = debugOverlay.toggle();
      debugOverlay.applyPlanetTints(planets);
      debugEntities.setEnabled(on);
      gameLoop.setUncapped(on);
      hud.setPrompt(on ? "Debug on · uncapped FPS (L)" : "Debug overlay off");
    }

    if (input.justPressed("KeyF")) {
      const on = flashlight.toggle();
      hud.setPrompt(on ? "Flashlight on (F)" : "Flashlight off");
    }

    updatePossession(state, {
      world, player, ship, physics, input, hud, planets,
      onFootForward: onFootRig.forward, character,
      stationPosition: stationSystemPos,
      stationRingAngle: stationVisual.ringAngle,
      starRadius: activeStar.radius,
      stationEnabled,
      getAimDir: () => aimDirSystem,
      inventory: playerInventory,
      getCamLook: () => {
        rc.camera.getWorldDirection(camForward);
        return {
          pos: rc.camera.position,
          forward: camForward,
          planetLodPos: state.currentPlanet.lod.position,
        };
      },
      onPickup: () => inventoryUI.refresh(),
    }, dt);

    if (state.mode !== "onFoot" && inventoryUI.open) inventoryUI.setOpen(false);

    if (state.currentPlanet.def.id !== activeColliderPlanetId) {
      physics.setActivePlanet(
        state.currentPlanet.colliderVertices,
        state.currentPlanet.colliderIndices,
      );
      activeColliderPlanetId = state.currentPlanet.def.id;
    }
    if (registeredRockPlanetId !== state.currentPlanet.def.id) {
      syncCameraOccluders(state.currentPlanet);
    }

    physics.step();
    input.clearFrame();
    simMsAccum += performance.now() - simT0;
  };

  const renderStep = (alpha: number) => {
    const now = performance.now();
    const dtReal = Math.min(0.1, (now - lastRenderT) / 1000);
    lastFrameMs = Math.max(0.001, now - lastRenderT);
    lastRenderT = now;
    const prepT0 = performance.now();
    const simMs = simMsAccum;
    simMsAccum = 0;

    const s = ship.ship!;
    let focusPlanet: PlanetInstance | null;

    if (state.mode === "onFoot") {
      // Interpolate the planet's own orbital motion too, or standing still reads
      // as a violent per-frame shake (the planet moves ~tens of units per tick
      // at these orbital speeds; mixing an interpolated planet mesh with a
      // non-interpolated origin wobbles the whole world).
      const cp = state.currentPlanet;
      interpBody.lerpVectors(cp.prevSystemPosition, cp.systemPosition, alpha);
      interpLocal.lerpVectors(player.prevPosition!, player.position!, alpha);
      renderOrigin.copy(interpBody).add(interpLocal);
      focusPlanet = state.currentPlanet;

      if (!inventoryUI.open) character.object.position.set(0, 0, 0);
      const mFoot = player.movement!;
      const riding = mFoot.hoverboarding && !inventoryUI.open;
      if (riding) {
        basisQuaternion(mFoot.up, mFoot.faceDir, hoverBoardQ);
        hoverRight.crossVectors(mFoot.up, mFoot.faceDir).normalize();
        hoverPitchQ.setFromAxisAngle(hoverRight, mFoot.hoverPitch);
        hoverRollQ.setFromAxisAngle(mFoot.faceDir, mFoot.hoverRoll);
        hoverBoardQ.multiply(hoverPitchQ).multiply(hoverRollQ);

        hoverboard.setActive(true);
        hoverboard.group.position.set(0, 0, 0);
        hoverboard.group.quaternion.copy(hoverBoardQ);
        if (character.object.parent !== hoverboard.riderAnchor) {
          hoverboard.riderAnchor.add(character.object);
          character.object.position.set(0, 0, 0);
          character.object.quaternion.identity();
        }
      } else {
        if (character.object.parent !== rc.scene) {
          rc.scene.add(character.object);
          character.object.position.set(0, 0, 0);
        }
        if (!inventoryUI.open) {
          character.object.position.set(0, 0, 0);
        }
        hoverboard.setActive(false);
      }
      character.object.visible = true;
      hoverboard.update(
        dtReal,
        inventoryUI.open ? 0 : mFoot.speed01,
        mFoot.grounded,
        interpLocal,
        interpLocal,
      );

      shipOccluderCenter.copy(ship.position!);
      if (inventoryUI.open) {
        updateInventoryInspect(
          rc.camera, character, mFoot.up, mFoot.faceDir,
          player.position!, physics, dtReal,
          (nx, ny, nz) => cp.planet.surfaceRadius(nx, ny, nz),
        );
      } else {
        character.object.position.set(0, 0, 0);
        if (!riding) {
          orientOnSurface(character.object, mFoot.up, mFoot.faceDir);
        }
        updateCameraFollow(
          onFootRig, rc.camera, character.object.position, player.movement!.up,
          input, physics, character, player.position!, dtReal,
          (nx, ny, nz) => cp.planet.surfaceRadius(nx, ny, nz),
        );
      }

      tmpVec.copy(ship.position!).sub(interpLocal);
      shipModel.group.position.copy(tmpVec);
      orientOnSurface(shipModel.group, ship.up!, ship.faceDir!);
      shipModel.setEngineGlow(0.12);
      shipModel.setOpacity(1);

      if (state.boardPhase === "boarding") {
        if (boardFx.mode !== "boarding") {
          boardFx.startBoarding(
            character.object.position.clone().addScaledVector(mFoot.up, 1.0),
            shipModel.group.position.clone(),
          );
        }
        if (boardFx.update(dtReal, character)) {
          state.mode = "ship";
          state.boardPhase = "idle";
          character.object.visible = false;
          character.setOpacity(1);
        }
      }
    } else if (s.mode === "docked") {
      if (character.object.parent !== rc.scene) rc.scene.add(character.object);
      character.object.visible = false;
      hoverboard.setActive(false);
      hoverboard.update(dtReal, 0, false, interpLocal, interpLocal);
      interpBody.lerpVectors(stationPrevPos, stationSystemPos, alpha);
      interpLocal.lerpVectors(ship.prevPosition!, ship.position!, alpha);
      renderOrigin.copy(interpBody).add(interpLocal);
      focusPlanet = nearestPlanet(renderOrigin, planets);
      shipModel.group.position.set(0, 0, 0);
      orientOnSurface(shipModel.group, ship.up!, ship.faceDir!, true);
      updateShipCamera(
        rc.camera, shipModel.group.position, null, s.orientation, dtReal, false, s.warpPhase, physics, 0,
      );
      shipModel.setEngineGlow(0.1);
      shipModel.setOpacity(1);
    } else {
      if (character.object.parent !== rc.scene) rc.scene.add(character.object);
      const exiting = state.boardPhase === "exiting";
      character.object.visible = exiting;
      hoverboard.setActive(false);
      hoverboard.update(dtReal, 0, false, interpLocal, interpLocal);
      // landed / launching / landing all live in the planet-LOCAL frame (stable
      // under an orbiting planet — no teleport, no fly-away); flying is system-space.
      const localMode = s.mode === "landed" || s.mode === "launching" || s.mode === "landing";
      if (localMode) {
        const cp = state.currentPlanet;
        if (cp.def.id !== activeColliderPlanetId) {
          physics.setActivePlanet(cp.colliderVertices, cp.colliderIndices);
          activeColliderPlanetId = cp.def.id;
        }
        interpBody.lerpVectors(cp.prevSystemPosition, cp.systemPosition, alpha);
        interpLocal.lerpVectors(ship.prevPosition!, ship.position!, alpha);
        renderOrigin.copy(interpBody).add(interpLocal);
        focusPlanet = state.currentPlanet;
        shipModel.group.position.set(0, 0, 0);
        basisQuaternion(ship.up!, ship.faceDir!, s.orientation);
        orientOnSurface(shipModel.group, ship.up!, ship.faceDir!, true);
        shipLocalCam.copy(interpLocal);
      } else {
        // Flying / warp: interpolate system-space origin so the camera never
        // snaps between fixed 60 Hz sim ticks (which reads as shake at speed).
        interpLocal.lerpVectors(ship.prevPosition!, ship.position!, alpha);
        renderOrigin.copy(interpLocal);
        focusPlanet = nearestPlanet(renderOrigin, planets);
        if (renderOrigin.distanceTo(focusPlanet.systemPosition) > focusPlanet.planet.maxR * SHIP.gravityInfluenceRadii) {
          focusPlanet = null;
        }
        shipModel.group.position.set(0, 0, 0);
        shipModel.group.quaternion.copy(s.orientation);
        if (focusPlanet) {
          tmpVec.lerpVectors(focusPlanet.prevSystemPosition, focusPlanet.systemPosition, alpha);
          shipLocalCam.copy(interpLocal).sub(tmpVec);
        }
      }
      const collidePlanet = localMode
        ? state.currentPlanet
        : (focusPlanet && shipLocalCam.length() < focusPlanet.planet.maxR * SHIP.cameraCollisionMaxRange
          ? focusPlanet
          : null);
      if (collidePlanet && collidePlanet.def.id !== activeColliderPlanetId) {
        physics.setActivePlanet(collidePlanet.colliderVertices, collidePlanet.colliderIndices);
        activeColliderPlanetId = collidePlanet.def.id;
      }
      if (collidePlanet) {
        shipOccluderCenter.copy(shipLocalCam);
        if (registeredRockPlanetId !== collidePlanet.def.id) {
          syncCameraOccluders(collidePlanet);
        }
      }
      const camDist = updateShipCamera(
        rc.camera, shipModel.group.position,
        collidePlanet ? shipLocalCam : null,
        s.orientation, dtReal,
        s.boosting, s.warpPhase, physics,
        collidePlanet?.planet.maxR ?? 0,
        collidePlanet
          ? (nx, ny, nz) => collidePlanet.planet.surfaceRadius(nx, ny, nz)
          : undefined,
        s.mode === "landing" ? s.phaseT : (s.mode === "landed" ? 1 : 0),
      );
      const fade = Math.min(1, Math.max(0,
        (camDist - SHIP.cameraFadeEnd) / (SHIP.cameraFadeStart - SHIP.cameraFadeEnd)));
      shipModel.setOpacity(fade);
      const glow = s.warpPhase !== "idle"
        ? (s.warpPhase === "cruising" ? 2.8 : 0.4 + s.warpT * 1.6)
        : Math.abs(s.throttle) * (s.boosting ? 2.2 : 1) + 0.1;
      shipModel.setEngineGlow(glow, s.boosting || s.warpPhase === "cruising");

      if (exiting && localMode) {
        tmpVec.copy(player.position!).sub(ship.position!);
        character.object.position.copy(tmpVec);
        orientOnSurface(character.object, player.movement!.up, player.movement!.faceDir, true);
        if (boardFx.mode !== "exiting") {
          boardFx.startExiting(
            shipModel.group.position.clone(),
            character.object.position.clone().addScaledVector(player.movement!.up, 1.0),
          );
        }
        if (boardFx.update(dtReal, character)) {
          state.mode = "onFoot";
          state.boardPhase = "idle";
          character.setOpacity(1);
          character.object.visible = true;
          character.object.position.set(0, 0, 0);
        }
      }
    }

    for (const p of planets) {
      interpBody.lerpVectors(p.prevSystemPosition, p.systemPosition, alpha);
      renderRelative(interpBody, renderOrigin, tmpVec);
      p.lod.position.copy(tmpVec);
      p.updateLod(rc.camera);
      // Keep limb glow / day bias current even for non-focus planets.
      atmoUp.copy(rc.camera.position).sub(p.lod.position);
      if (atmoUp.lengthSq() > 1e-6) atmoUp.normalize();
      else atmoUp.set(0, 1, 0);
      p.atmosphere.update(dtReal, rc.camera.position, p.lod.position, atmoUp, sunDir);
      if (p.liquid) {
        camPlanetLocal.copy(rc.camera.position).sub(p.lod.position);
        p.liquid.update(sunDir, p.atmosphere.dayFactor, camPlanetLocal);
      }
    }
    renderRelative(STAR_POS, renderOrigin, tmpVec);
    star.group.position.copy(tmpVec);
    interpBody.lerpVectors(stationPrevPos, stationSystemPos, alpha);
    renderRelative(interpBody, renderOrigin, tmpVec);
    stationVisual.group.position.copy(tmpVec);
    stationVisual.update(dtReal);

    sunDir.copy(STAR_POS).sub(renderOrigin).normalize();
    // Follow the focus with a short shadow boom so maps stay tight (no planet-scale square).
    const shadowFocus = state.mode === "onFoot"
      ? character.object.position
      : shipModel.group.position;
    // Never light from under the local horizon — clamp the boom to sky-side.
    const focusUp = state.mode === "onFoot" ? player.movement!.up : (ship.up ?? atmoUp);
    const sunElevBoom = sunDir.dot(focusUp);
    if (sunElevBoom < 0.02) {
      tmpVec.copy(sunDir).addScaledVector(focusUp, -sunElevBoom + 0.02).normalize();
    } else {
      tmpVec.copy(sunDir);
    }
    rc.sun.target.position.copy(shadowFocus);
    rc.sun.position.copy(shadowFocus).addScaledVector(tmpVec, 42);
    rc.sun.target.updateMatrixWorld();
    rc.sun.castShadow = sunElevBoom > 0.02;

    // Starfield rides the camera so it stays infinitely far; dimmed by atmosphere.
    starfield.position.copy(rc.camera.position);

    if (focusPlanet) {
      atmoUp.copy(rc.camera.position).sub(focusPlanet.lod.position);
      if (atmoUp.lengthSq() < 1e-6) {
        atmoUp.copy(state.mode === "onFoot" ? player.movement!.up : ship.up!);
      } else {
        atmoUp.normalize();
      }
      for (const p of planets) {
        if (p !== focusPlanet) p.atmosphere.skyDome.visible = false;
      }
      // Focus planet already updated above; re-run with surface up for accurate day/night.
      focusPlanet.atmosphere.update(
        dtReal, rc.camera.position, focusPlanet.lod.position, atmoUp, sunDir,
      );
      const inside = focusPlanet.atmosphere.insideFactor;
      const day = focusPlanet.atmosphere.dayFactor;
      lastDayFactor = day;
      const camAlt = Math.max(
        0,
        rc.camera.position.distanceTo(focusPlanet.lod.position) - focusPlanet.planet.maxR,
      );
      const atmoH = Math.max(60, focusPlanet.def.atmosphereThickness);
      if (camAlt < atmoH * 0.9) {
        rc.disableFog();
      } else {
        const t = Math.min(1, (camAlt - atmoH * 0.9) / (atmoH * 1.1));
        const fogNear = focusPlanet.def.fogNear * (2.0 + t);
        const fogFar = focusPlanet.def.fogFar * (1.8 + t);
        rc.setFog(focusPlanet.def.palette.atmosphere, fogNear, fogFar);
      }
      // Day/night lighting: sun only from above the local horizon; no under-lighting.
      const sunElev = Math.max(0, atmoUp.dot(sunDir));
      rc.hemi.color.set(focusPlanet.def.palette.atmosphere);
      rc.hemi.groundColor.set(focusPlanet.def.palette.lowland).multiplyScalar(0.25 + day * 0.55);
      rc.hemi.intensity = 0.05 + day * 0.32;
      rc.sun.intensity = activeStar.lightIntensity * sunElev * sunElev * (0.35 + day * 0.65) * 0.85;
      if (sunElev < 0.02) rc.sun.intensity = 0;
      // Stars visible at night / twilight even while inside atmosphere.
      const starOp = Math.max(0, 1 - inside * day * 1.25);
      setStarfieldOpacity(starfield, starOp);
      const bgBlend = Math.min(1, inside * (0.25 + day * 0.65));
      rc.setBackground(focusPlanet.def.palette.atmosphere, bgBlend);

      // Underwater camera filter when the camera dips below sea level.
      let under = false;
      if (focusPlanet.liquid) {
        camPlanetLocal.copy(rc.camera.position).sub(focusPlanet.lod.position);
        under = camPlanetLocal.length() < focusPlanet.liquid.seaRadius - 0.3;
      }
      underFilter.classList.toggle("opacity-100", under);
      underFilter.classList.toggle("opacity-0", !under);
      if (under && focusPlanet.liquid) {
        const tint = focusPlanet.liquid.kind === "lava"
          ? "rgba(180, 40, 10, 0.42)"
          : "rgba(8, 55, 95, 0.48)";
        underFilter.style.background = tint;
      }
    } else {
      for (const p of planets) p.atmosphere.skyDome.visible = false;
      rc.disableFog();
      setStarfieldOpacity(starfield, 1);
      rc.setBackground(null, 0);
      rc.hemi.intensity = 0.7;
      rc.sun.intensity = activeStar.lightIntensity * 0.7;
      underFilter.classList.remove("opacity-100");
      underFilter.classList.add("opacity-0");
      lastDayFactor = 1;
    }

    updateWorldDrops(
      dtReal,
      state.mode === "onFoot" ? state.currentPlanet.def.id : null,
    );

    const piloting = state.mode === "ship" && (s.mode === "flying" || s.warpPhase !== "idle");
    hud.setPilotingVisible(piloting);
    const hintEl = document.getElementById("hint");
    if (hintEl) hintEl.style.opacity = piloting ? "0" : "0.5";

    // Asteroids only outside atmosphere; brighter materials in vacuum.
    const inAtmo = !!(focusPlanet && focusPlanet.atmosphere.insideFactor > 0.08);
    const asteroidsActive = state.mode === "ship" && s.mode === "flying"
      && s.warpPhase === "idle" && !inAtmo;
    if (asteroidsActive) {
      orbitalFrameVelocity(renderOrigin, planets, game.time, asteroidFrameVel);
    } else {
      asteroidFrameVel.set(0, 0, 0);
    }
    asteroids.update(
      renderOrigin, renderOrigin, asteroidBodies, STAR_POS, activeStar.radius,
      asteroidsActive, dtReal, asteroidFrameVel,
    );

    const warping = s.warpPhase === "charging" || s.warpPhase === "cruising";
    shipForward.set(0, 0, -1).applyQuaternion(s.orientation);
    warpFx.update(
      warping && state.mode === "ship",
      s.warpPhase === "charging",
      s.warpT,
      shipModel.group.position,
      s.orientation,
      dtReal,
    );

    // Ship system position for nav (planet-local when landed / launching / landing).
    if (s.mode === "landed" || s.mode === "launching" || s.mode === "landing") {
      shipSystemPos.copy(state.currentPlanet.systemPosition).add(ship.position!);
    } else if (s.mode === "docked") {
      shipSystemPos.copy(stationSystemPos).add(ship.position!);
    } else {
      shipSystemPos.copy(ship.position!);
    }
    shipMarkerAnchor.position.copy(shipModel.group.position);
    shipMarkerAnchor.position.y += 6;

    worldMarkers.update(renderOrigin, state.mode);
    const previewEntry = knownSystems.find((s) => s.def.id === previewSystemId) ?? knownSystems[0];
    const previewingRemote = previewSystemId !== activeSystemId;
    systemMap.update({
      bodies: previewBodiesFor(previewSystemId),
      playerPosition: renderOrigin,
      playerLabel: state.mode === "onFoot" ? "You (on foot)" : "Your ship",
      time: game.time,
      playerForward: state.mode === "ship" ? shipForward : undefined,
      showPlayer: !previewingRemote,
      star: previewEntry.def.star,
    });

    // Keep reticle aim fresh whenever the ship camera is active (not only HUD).
    if (state.mode === "ship") {
      rc.camera.getWorldDirection(aimDirSystem);
    }

    camWorldPos.copy(renderOrigin).add(rc.camera.position);
    rc.camera.getWorldDirection(camForward);
    camRight.crossVectors(camForward, rc.camera.up).normalize();

    if (piloting) {
      aimDirSystem.copy(camForward);
      const speedRefPlanet = focusPlanet ?? nearestPlanet(renderOrigin, planets);
      const relSpeed = speedRelativeToPlanet(s.velocity, speedRefPlanet, game.time);
      const absSpeed = s.velocity.length();
      const warpTargetName = s.warpTargetId
        ? (s.warpTargetId === "station"
          ? STATION_NAME
          : planets.find((p) => p.def.id === s.warpTargetId)?.def.name ?? null)
        : null;
      const flightTargets: NavTarget[] = [
        ...planets.map((p) => ({
          id: p.def.id,
          name: p.def.name,
          kind: "planet" as const,
          color: p.def.palette.atmosphere,
          systemPosition: p.systemPosition,
          radius: p.planet.maxR,
        })),
        ...(stationEnabled ? [{
          id: "station",
          name: STATION_NAME,
          kind: "station" as const,
          color: "#7ab0ff",
          systemPosition: stationSystemPos,
          radius: STATION_RADIUS,
        }] : []),
      ];
      hud.setCompassVisible(true);
      hud.updateFlight(
        { camPos: camWorldPos, camForward, camRight },
        renderOrigin, relSpeed, absSpeed, s.throttle, s.boostFuel, s.boosting,
        s.steerX, s.steerY,
        flightTargets, s.warpPhase, s.warpT, dtReal, warpTargetName,
        settings.maintainMomentum,
      );
    } else if (state.mode === "onFoot") {
      // Local surface targets only (ships / future players) — not system planets.
      const localTargets: NavTarget[] = [{
        id: "player-ship",
        name: shipById(settings.selectedShipId).name,
        kind: "ship",
        color: "#7fffd0",
        systemPosition: shipSystemPos,
        radius: SHIP.length * 0.5,
      }];
      hud.setCompassVisible(true);
      hud.updateCompass({ camPos: camWorldPos, camForward, camRight }, localTargets);
    } else {
      hud.setCompassVisible(false);
    }

    // Surface illumination estimate (N·L + fill + flashlight boost).
    {
      const up = state.mode === "onFoot"
        ? player.movement!.up
        : (ship.up ?? atmoUp);
      const nDotL = Math.max(0, up.dot(sunDir));
      const ambient = rc.hemi.intensity * 0.35;
      const sunLit = nDotL * lastDayFactor * Math.min(1.2, rc.sun.intensity * 0.45);
      lastLightLevel = Math.min(1, ambient + sunLit + (flashlight.enabled && state.mode === "onFoot" ? 0.28 : 0));
    }

    rc.camera.getWorldDirection(flashForward);
    const flashUp = state.mode === "onFoot" ? player.movement!.up : (ship.up ?? atmoUp);
    const flashOrigin = state.mode === "onFoot"
      ? character.object.position
      : shipModel.group.position;
    flashlight.update(state.mode === "onFoot", flashOrigin, flashForward, flashUp);

    debugEntities.update({
      enabled: debugOverlay.enabled,
      ship: shipModel.group,
      character: character.object,
      characterVisible: state.mode === "onFoot" && character.object.visible,
      station: stationVisual.group,
      stationEnabled,
      focusPlanet,
      camPos: rc.camera.position,
    });

    lastPrepMs = performance.now() - prepT0;
    const gpuT0 = performance.now();
    rc.render();
    lastGpuMs = performance.now() - gpuT0;
    worldMarkers.render(rc.scene, rc.camera);

    if (debugOverlay.enabled) {
      let oreTris = 0;
      let rockTris = 0;
      let atmoTris = 0;
      let ringTris = 0;
      for (const p of planets) {
        oreTris += countVisibleTriangles(p.ore.group);
        rockTris += countVisibleTriangles(p.rocks.group);
        atmoTris += countVisibleTriangles(p.atmosphere.group);
        if (p.atmosphere.skyDome.visible) {
          atmoTris += meshTriangleCount(p.atmosphere.skyDome);
        }
        if (p.rings) ringTris += countVisibleTriangles(p.rings.group);
      }
      const velOut = tmpVec;
      if (state.mode === "ship") {
        velOut.copy(s.velocity);
      } else if (player.prevPosition) {
        velOut.copy(player.position!).sub(player.prevPosition).multiplyScalar(60);
      } else {
        velOut.set(0, 0, 0);
      }
      let planetLocal: typeof camPlanetLocal | null = null;
      if (state.mode === "onFoot") {
        planetLocal = player.position!;
      } else if (s.mode === "landed" || s.mode === "launching" || s.mode === "landing") {
        planetLocal = ship.position!;
      } else if (focusPlanet) {
        camPlanetLocal.copy(renderOrigin).sub(focusPlanet.systemPosition);
        planetLocal = camPlanetLocal;
      }
      debugOverlay.update({
        planets,
        camera: rc.camera,
        renderer: rc.renderer,
        scene: rc.scene,
        timing: {
          simMs,
          renderPrepMs: lastPrepMs,
          gpuSubmitMs: lastGpuMs,
          frameMs: lastFrameMs,
        },
        mode: state.mode,
        shipMode: state.mode === "ship" ? s.mode : "",
        coords: renderOrigin,
        planetLocal,
        velocity: velOut,
        planetName: focusPlanet?.def.name ?? state.currentPlanet.def.name,
        systemName: knownSystems.find((k) => k.def.id === activeSystemId)?.def.name ?? activeSystemId,
        tick: simTick,
        gameTime: game.time,
        lightLevel: lastLightLevel,
        dayFactor: lastDayFactor,
        uncapped: gameLoop.uncapped,
        flashlight: flashlight.enabled,
        entities: debugEntities.counts,
        extras: [
          { label: "Asteroids", tris: meshTriangleCount(asteroids.mesh) },
          { label: "Ship", tris: countVisibleTriangles(shipModel.group) },
          { label: "Character", tris: countVisibleTriangles(character.object) },
          { label: "Station", tris: stationEnabled ? countVisibleTriangles(stationVisual.group) : 0 },
          { label: "Star", tris: countVisibleTriangles(star.group) },
          { label: "Atmosphere", tris: atmoTris },
          { label: "Ore", tris: oreTris },
          { label: "Rocks", tris: rockTris },
          { label: "Rings", tris: ringTris },
        ],
      });
    }
  };

  gameLoop = createLoop({
    fixedDt: 1 / 60,
    beginFrame: () => input.beginFrame(),
    update: simStep,
    render: renderStep,
  });
  gameLoop.start();
  loading.setProgress(1, "Ready");
  loading.done();

  if (promptEl) {
    const hide = () => { promptEl.style.display = "none"; };
    window.addEventListener("keydown", hide, { once: true });
    window.addEventListener("pointerdown", hide, { once: true });
  }

  (window as unknown as { __dbg: unknown }).__dbg = {
    player, ship, world, game, state, planets, home, physics,
    onFootRig, camera: rc.camera, simStep, renderStep, input, rc,
    getSnapshot: () => buildWorldSnapshot(
      simTick, game.time, "solar-001", ship, player, planets, stationSystemPos,
      state.currentPlanet.def.id, state.dockBay,
    ),
  };
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML =
    `<pre style="color:#f88;padding:20px;font-family:monospace">${String(err?.stack ?? err)}</pre>`;
});
