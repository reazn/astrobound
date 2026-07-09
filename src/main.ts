import { Vector3, Quaternion } from "three";
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
import { characterById } from "./content/characters";
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
import { loadAsteroidField } from "./visuals/asteroids";
import { createWarpFx } from "./visuals/warpFx";
import { speedRelativeToPlanet, orbitalFrameVelocity } from "./systems/shipGravity";
import { createSettingsMenu, type SettingsMenu } from "./ui/settingsMenu";
import { buildWorldSnapshot } from "./net/buildSnapshot";
import { findFlatLandingNormal, landingRestPosition } from "./systems/landingSite";
import {
  clearCameraOccluders, registerCameraOccluder,
} from "./systems/cameraOccluders";
import { describeEntity } from "./ecs/gameEntity";
import { SHIP } from "./config/ship";
import { STAR } from "./config/star";
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

  const rng = createRng("solar-001");

  const planets = await Promise.all(PLANET_REGISTRY.map(createPlanetInstance));
  const home = planets.find((p) => p.def.id === HOME_PLANET.id)!;
  const stationSystemPos = new Vector3();
  const stationPrevPos = new Vector3();
  for (const p of planets) {
    orbitPositionAt(p.def.orbit, 0, p.systemPosition);
    p.prevSystemPosition.copy(p.systemPosition);
  }
  orbitPositionAt(STATION_ORBIT, 0, stationSystemPos);
  stationPrevPos.copy(stationSystemPos);

  const rc = createRenderer(container);
  for (const p of planets) {
    rc.scene.add(p.lod);
    rc.scene.add(p.atmosphere.skyDome);
  }
  const star = createStar();
  rc.scene.add(star.group);
  const stationVisual = createStation();
  rc.scene.add(stationVisual.group);
  const starfield = createStarfield(rng.world);
  rc.scene.add(starfield);
  const warpFx = createWarpFx();
  rc.scene.add(warpFx.mesh);

  const physics = await initPhysics();
  physics.setActivePlanet(home.colliderVertices, home.colliderIndices);

  const asteroidRng = createRng("asteroids-001").world;
  const charDef0 = characterById(settings.selectedCharacterId);
  const [playerSource, shipModel0, asteroids] = await Promise.all([
    loadCharacterSource(charDef0.url),
    loadShipModel(settings.selectedShipId),
    loadAsteroidField(asteroidRng),
  ]);
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
  const asteroidBodies = planets.map((p) => ({
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

  // In-world (No Man's Sky-style) markers attached to each body's mesh.
  const markerBodies: MarkerBody[] = [
    ...planets.map((p) => ({
      name: p.def.name, kind: "planet" as const, color: p.def.palette.atmosphere,
      parent: p.lod, systemPosition: p.systemPosition, radius: p.planet.maxR,
    })),
    {
      name: STATION_NAME, kind: "station" as const, color: "#7ab0ff",
      parent: stationVisual.group, systemPosition: stationSystemPos, radius: STATION_RADIUS,
    },
  ];
  const worldMarkers = createWorldMarkers(container, markerBodies);
  worldMarkers.setSize(window.innerWidth, window.innerHeight);
  window.addEventListener("resize", () =>
    worldMarkers.setSize(window.innerWidth, window.innerHeight));

  // Solar-system map (M). Pause game input while it's open so you don't fly blind.
  const systemMap = createSystemMap(document.body, (open) => {
    input.setPaused(open);
    if (open) input.exitLock();
  });
  const mapBodies: MapBody[] = [
    ...planets.map((p) => ({
      name: p.def.name, color: p.def.palette.atmosphere, kind: "planet" as const,
      orbit: p.def.orbit, position: p.systemPosition, radius: p.planet.maxR,
      detail: `r ${p.def.radius}u`,
    })),
    {
      name: STATION_NAME, color: "#7ab0ff", kind: "station" as const,
      orbit: STATION_ORBIT, position: stationSystemPos, radius: STATION_RADIUS,
    },
  ];

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
    registeredRockPlanetId = planet.def.id;
  };
  syncCameraOccluders(home);

  const simStep = (dt: number) => {
    game.time += dt;
    simTick++;
    for (const p of planets) p.prevSystemPosition.copy(p.systemPosition);
    stationPrevPos.copy(stationSystemPos);
    for (const p of planets) orbitPositionAt(p.def.orbit, game.time, p.systemPosition);
    orbitPositionAt(STATION_ORBIT, game.time, stationSystemPos);

    if (input.justPressed("KeyN") && state.mode === "ship") {
      settings.maintainMomentum = !settings.maintainMomentum;
    }

    updatePossession(state, {
      world, player, ship, physics, input, hud, planets,
      onFootForward: onFootRig.forward, character,
      stationPosition: stationSystemPos,
      stationRingAngle: stationVisual.ringAngle,
      getAimDir: () => aimDirSystem,
    }, dt);

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
    rc.sun.position.set(0, 0, 0).addScaledVector(sunDir, 220);
    rc.sun.target.position.set(0, 0, 0);
    rc.sun.target.updateMatrixWorld();
    // Directional shadow maps paint a hard orthographic square on planet-scale
    // terrain — leave them off; toon lighting still reads fine without them.
    rc.sun.castShadow = false;

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
      if (camAlt < atmoH * 0.9) {
        rc.disableFog();
      } else {
        const t = Math.min(1, (camAlt - atmoH * 0.9) / (atmoH * 1.1));
        const fogNear = focusPlanet.def.fogNear * (2.0 + t);
        const fogFar = focusPlanet.def.fogFar * (1.8 + t);
        rc.setFog(focusPlanet.def.palette.atmosphere, fogNear, fogFar);
      }
      // Day/night lighting: dim hemi + sun on the night side.
      rc.hemi.color.set(focusPlanet.def.palette.atmosphere);
      rc.hemi.groundColor.set(focusPlanet.def.palette.lowland);
      rc.hemi.intensity = 0.18 + day * 0.55;
      rc.sun.intensity = STAR.lightIntensity * (0.12 + day * 0.88) * 0.7;
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
      rc.sun.intensity = STAR.lightIntensity * 0.7;
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
      renderOrigin, renderOrigin, asteroidBodies, STAR_POS, STAR.radius,
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

    // In-world body markers (shown while piloting) + live system-map data.
    worldMarkers.update(renderOrigin, piloting);
    systemMap.update({
      bodies: mapBodies,
      playerPosition: renderOrigin,
      playerLabel: state.mode === "onFoot" ? "You (on foot)" : "Your ship",
      time: game.time,
      playerForward: state.mode === "ship" ? shipForward : undefined,
    });

    // Keep reticle aim fresh whenever the ship camera is active (not only HUD).
    if (state.mode === "ship") {
      rc.camera.getWorldDirection(aimDirSystem);
    }

    if (piloting) {
      camWorldPos.copy(renderOrigin).add(rc.camera.position);
      rc.camera.getWorldDirection(camForward);
      camRight.crossVectors(camForward, rc.camera.up).normalize();
      aimDirSystem.copy(camForward);

      const targets: NavTarget[] = [
        ...planets.map((p) => ({
          id: p.def.id,
          name: p.def.name,
          kind: "planet" as const,
          color: p.def.palette.atmosphere,
          systemPosition: p.systemPosition,
          radius: p.planet.maxR,
        })),
        {
          id: "station",
          name: STATION_NAME,
          kind: "station" as const,
          color: "#7ab0ff",
          systemPosition: stationSystemPos,
          radius: STATION_RADIUS,
        },
      ];
      // Relative speed (local orbital frame) + absolute universe speed (star rest).
      const speedRefPlanet = focusPlanet ?? nearestPlanet(renderOrigin, planets);
      const relSpeed = speedRelativeToPlanet(s.velocity, speedRefPlanet, game.time);
      const absSpeed = s.velocity.length();
      const warpTargetName = s.warpTargetId
        ? (s.warpTargetId === "station"
          ? STATION_NAME
          : planets.find((p) => p.def.id === s.warpTargetId)?.def.name ?? null)
        : null;
      hud.updateFlight(
        { camPos: camWorldPos, camForward, camRight },
        renderOrigin, relSpeed, absSpeed, s.throttle, s.boostFuel, s.boosting,
        s.steerX, s.steerY,
        targets, s.warpPhase, s.warpT, dtReal, warpTargetName,
        settings.maintainMomentum,
      );
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
