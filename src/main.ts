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
import { STATIC_ORBITS } from "./config/scale";
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
import { updateShipCamera } from "./systems/shipCamera";
import { updatePossession, type PossessionState } from "./systems/possession";
import { createSpaceHud, type NavTarget } from "./systems/spaceHud";
import { createWorldMarkers, type MarkerBody } from "./systems/worldMarkers";
import { createSystemMap, type MapBody } from "./ui/systemMap";
import {
  createKnownSystemsCatalog, discoverKnownSystem, mapBodiesFromSystemDef,
  type KnownSystem,
} from "./content/systems/catalog";
import { loadAsteroidField } from "./visuals/asteroids";
import { createWarpFx } from "./visuals/warpFx";
import { speedRelativeToPlanet, orbitalFrameVelocity } from "./systems/shipGravity";
import { createSettingsMenu, type SettingsMenu } from "./ui/settingsMenu";
import { createLoadingScreen } from "./ui/loadingScreen";
import { createLodDebugLegend } from "./ui/lodDebugLegend";
import { buildWorldSnapshot } from "./net/buildSnapshot";
import { findFlatLandingNormal, landingRestPosition } from "./systems/landingSite";
import {
  clearCameraOccluders, registerCameraOccluder,
} from "./systems/cameraOccluders";
import { describeEntity } from "./ecs/gameEntity";
import { SHIP } from "./config/ship";
import { starDefFromHome, type StarDef } from "./config/star";
import { MOVEMENT } from "./config/movement";
import { settings } from "./config/settings";
import "./ui/hud.css";

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
  physics.setActivePlanet(home.colliderVertices, home.colliderIndices, home.extraColliders);

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
      next.object.position.copy(character.object.position);
      next.object.quaternion.copy(character.object.quaternion);
      rc.scene.add(next.object);
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
    onShipChange: swapShip,
    onCharacterChange: swapCharacter,
  });
  const hud = createSpaceHud(document.body);
  const underFilter = document.createElement("div");
  underFilter.className = "sb-underwater";
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
      input.setPaused(open);
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

  const state: PossessionState = { mode: "onFoot", currentPlanet: home, dockBay: null };

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
    const caves = planet.caves;
    for (let i = 0; i < caves.entrances.length; i++) {
      const c = caves.entrances[i];
      registerCameraOccluder({
        desc: describeEntity(`cave-${planet.def.id}-${i}`, "rock", {
          label: "Cave",
          cameraRadius: 48,
        }),
        enabled: true,
        getCenter: (out) => out.copy(c),
      });
    }
    registeredRockPlanetId = planet.def.id;
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
    // Bias spawn toward mid-elevation land near coasts for richer first views.
    let seed = new Vector3(rng.world() * 2 - 1, rng.world() * 2 - 1, rng.world() * 2 - 1).normalize();
    let bestScore = -1e9;
    for (let i = 0; i < 48; i++) {
      const cand = new Vector3(rng.world() * 2 - 1, rng.world() * 2 - 1, rng.world() * 2 - 1).normalize();
      const sr = planet.planet.surfaceRadius(cand.x, cand.y, cand.z);
      const hNorm = (sr - planet.planet.minR) / Math.max(1, planet.planet.maxR - planet.planet.minR);
      let score = 1 - Math.abs(hNorm - 0.42) * 2;
      if (planet.planet.def.liquid) {
        const aboveSea = sr - planet.planet.seaLevel;
        if (aboveSea < 8) score -= 5;
        else score += Math.max(0, 1.2 - Math.abs(aboveSea - planet.planet.amplitude * 0.08) / (planet.planet.amplitude * 0.12));
      }
      if (score > bestScore) { bestScore = score; seed = cand; }
    }
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
    physics.setActivePlanet(planet.colliderVertices, planet.colliderIndices, planet.extraColliders);
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

  let lodDebugOn = false;
  const lodLegend = createLodDebugLegend();

  const simStep = (dt: number) => {
    game.time += dt;
    simTick++;
    for (const p of planets) p.prevSystemPosition.copy(p.systemPosition);
    if (stationEnabled) stationPrevPos.copy(stationSystemPos);
    const orbitT = STATIC_ORBITS ? 0 : game.time;
    for (const p of planets) orbitPositionAt(p.def.orbit, orbitT, p.systemPosition);
    if (stationEnabled) orbitPositionAt(STATION_ORBIT, orbitT, stationSystemPos);

    if (input.justPressed("KeyN") && state.mode === "ship") {
      settings.maintainMomentum = !settings.maintainMomentum;
    }
    if (input.justPressed("KeyL")) {
      lodDebugOn = !lodDebugOn;
      for (const p of planets) p.setLodDebug(lodDebugOn);
      lodLegend.setVisible(lodDebugOn);
      hud.setPrompt(lodDebugOn
        ? "LOD debug ON — L to toggle · LOD 0 = finest · see key on right"
        : "LOD debug OFF");
    }

    updatePossession(state, {
      world, player, ship, physics, input, hud, planets,
      onFootForward: onFootRig.forward, character,
      stationPosition: stationSystemPos,
      stationRingAngle: stationVisual.ringAngle,
      starRadius: activeStar.radius,
      stationEnabled,
      getAimDir: () => aimDirSystem,
    }, dt);

    if (state.currentPlanet.def.id !== activeColliderPlanetId) {
      physics.setActivePlanet(
        state.currentPlanet.colliderVertices,
        state.currentPlanet.colliderIndices,
        state.currentPlanet.extraColliders,
      );
      activeColliderPlanetId = state.currentPlanet.def.id;
    }
    if (registeredRockPlanetId !== state.currentPlanet.def.id) {
      syncCameraOccluders(state.currentPlanet);
    }

    physics.step();
    input.clearFrame();
  };

  const renderStep = (alpha: number) => {
    const now = performance.now();
    const dtReal = Math.min(0.1, (now - lastRenderT) / 1000);
    lastRenderT = now;

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

      character.object.position.set(0, 0, 0);
      orientOnSurface(character.object, player.movement!.up, player.movement!.faceDir);
      character.object.visible = true;

      shipOccluderCenter.copy(ship.position!);
      updateCameraFollow(
        onFootRig, rc.camera, character.object.position, player.movement!.up,
        input, physics, character, player.position!, dtReal,
        (nx, ny, nz) => cp.planet.surfaceRadius(nx, ny, nz),
      );

      tmpVec.copy(ship.position!).sub(interpLocal);
      shipModel.group.position.copy(tmpVec);
      orientOnSurface(shipModel.group, ship.up!, ship.faceDir!);
      shipModel.setEngineGlow(0.12);
      shipModel.setOpacity(1);
    } else if (s.mode === "docked") {
      character.object.visible = false;
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
      character.object.visible = false;
      // landed / launching / landing all live in the planet-LOCAL frame (stable
      // under an orbiting planet — no teleport, no fly-away); flying is system-space.
      const localMode = s.mode === "landed" || s.mode === "launching" || s.mode === "landing";
      if (localMode) {
        const cp = state.currentPlanet;
        if (cp.def.id !== activeColliderPlanetId) {
          physics.setActivePlanet(cp.colliderVertices, cp.colliderIndices, cp.extraColliders);
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
        physics.setActivePlanet(
          collidePlanet.colliderVertices,
          collidePlanet.colliderIndices,
          collidePlanet.extraColliders,
        );
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
      );
      const fade = Math.min(1, Math.max(0,
        (camDist - SHIP.cameraFadeEnd) / (SHIP.cameraFadeStart - SHIP.cameraFadeEnd)));
      shipModel.setOpacity(fade);
      const glow = s.warpPhase !== "idle"
        ? (s.warpPhase === "cruising" ? 2.8 : 0.4 + s.warpT * 1.6)
        : Math.abs(s.throttle) * (s.boosting ? 2.2 : 1) + 0.1;
      shipModel.setEngineGlow(glow, s.boosting || s.warpPhase === "cruising");
    }

    for (const p of planets) {
      interpBody.lerpVectors(p.prevSystemPosition, p.systemPosition, alpha);
      renderRelative(interpBody, renderOrigin, tmpVec);
      p.lod.position.copy(tmpVec);
      const onPlanetLocal =
        p === state.currentPlanet && (
          state.mode === "onFoot"
          || s.mode === "landed"
          || s.mode === "launching"
          || s.mode === "landing"
        );
      // Deep spherical LOD whenever you're near this world (walk or fly).
      // Altitude must not dump detail — the bubble is 3D around the player/ship.
      let lodMode: "surface" | "space" = "space";
      let lodFocus: typeof interpLocal | undefined;
      if (onPlanetLocal) {
        lodMode = "surface";
        lodFocus = interpLocal;
      } else if (p === focusPlanet && state.mode === "ship") {
        const local = shipLocalCam.lengthSq() > 1e-6
          ? shipLocalCam
          : camPlanetLocal.copy(rc.camera.position).sub(p.lod.position);
        if (local.length() < p.planet.maxR * 6) {
          lodMode = "surface";
          lodFocus = local;
        }
      }
      p.updateLod(rc.camera, lodFocus, lodMode);
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
    // Local shadow volume around the possessed entity (floating origin ≈ player).
    // Full-planet directional shadows are not viable at this scale.
    const shadowFocus = state.mode === "onFoot"
      ? character.object.position
      : shipModel.group.position;
    const surfaceShadow = !!(focusPlanet && (
      state.mode === "onFoot"
      || s.mode === "landed"
      || s.mode === "landing"
      || s.mode === "launching"
      || (rc.camera.position.distanceTo(focusPlanet.lod.position) - focusPlanet.planet.maxR) < 500
    ));
    if (surfaceShadow) {
      rc.sun.target.position.copy(shadowFocus);
      rc.sun.position.copy(shadowFocus).addScaledVector(sunDir, 160);
      rc.sun.castShadow = true;
      rc.sun.shadow.camera.updateProjectionMatrix();
    } else {
      rc.sun.position.set(0, 0, 0).addScaledVector(sunDir, 220);
      rc.sun.target.position.set(0, 0, 0);
      rc.sun.castShadow = false;
    }
    rc.sun.target.updateMatrixWorld();
    rc.sun.updateMatrixWorld();

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
      const camAlt = Math.max(
        0,
        rc.camera.position.distanceTo(focusPlanet.lod.position) - focusPlanet.planet.maxR,
      );
      const atmoH = Math.max(60, focusPlanet.def.atmosphereThickness);
      // Fog only while inside the atmosphere shell. Above it, clear fog so
      // other planets / the star stay visible across mega-scale distances.
      if (camAlt < atmoH * 0.85) {
        const t = Math.min(1, camAlt / Math.max(1, atmoH));
        const fogNear = focusPlanet.def.fogNear * (0.55 + t * 0.5);
        const fogFar = focusPlanet.def.fogFar * (0.7 + t * 0.5);
        rc.setFog(focusPlanet.def.palette.atmosphere, fogNear, fogFar);
      } else {
        rc.disableFog();
      }
      // Day/night lighting: dim hemi + sun on the night side.
      rc.hemi.color.set(focusPlanet.def.palette.atmosphere);
      rc.hemi.groundColor.set(focusPlanet.def.palette.lowland);
      rc.hemi.intensity = 0.18 + day * 0.55;
      rc.sun.intensity = activeStar.lightIntensity * (0.12 + day * 0.88) * 0.7;
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
      underFilter.classList.toggle("is-on", under);
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
      underFilter.classList.remove("is-on");
    }

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

    if (lodDebugOn) {
      const focus = focusPlanet ?? home;
      lodLegend.update(focus.terrainLod.debug());
    }

    rc.render();
    worldMarkers.render(rc.scene, rc.camera);
  };

  createLoop({
    fixedDt: 1 / 60,
    beginFrame: () => input.beginFrame(),
    update: simStep,
    render: renderStep,
  }).start();
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
    lodDebug: () => home.terrainLod.debug(),
    setLodDebug: (on: boolean) => {
      lodDebugOn = on;
      for (const p of planets) p.setLodDebug(on);
      lodLegend.setVisible(on);
    },
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
