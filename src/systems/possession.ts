import { Vector3 } from "three";
import type { GameWorld } from "../ecs/world";
import type { Entity } from "../ecs/components";
import type { Input } from "../engine/input";
import type { Physics } from "../engine/physics";
import type { PlanetInstance } from "../worldgen/planetInstance";
import type { SpaceHud } from "./spaceHud";
import type { AnimatedCharacter } from "../visuals/animatedCharacter";
import { updatePlayerMovement } from "./playerMovement";
import { hasEquippedMount, type PlayerInventory } from "../inventory/playerInventory";
import { getItem } from "../content/items";
import {
  findFocusedDrop, tryPickupDrop, type WorldDrop,
} from "./worldDrops";
import { updateShipFlight, beginWarp, stopWarp, getWarpLockName } from "./shipFlight";
import { syncVelocityToPlanet } from "./shipGravity";
import {
  beginLaunch, updateLaunch, beginLanding, updateLanding, snapLandedShipToTerrain,
} from "./shipTransition";
import { updateStationDocking, bayLocalPosition } from "./stationDocking";
import { game } from "../engine/gameState";
import { SHIP } from "../config/ship";
import { STATION_RADIUS } from "../content/station";

export type Possessed = "onFoot" | "ship";

export interface PossessionState {
  mode: Possessed;
  currentPlanet: PlanetInstance;
  dockBay: number | null;
  boardPhase: "idle" | "boarding" | "exiting";
}

let warpBlockPromptT = 0;

export interface PossessionDeps {
  world: GameWorld;
  player: Entity;
  ship: Entity;
  physics: Physics;
  input: Input;
  hud: SpaceHud;
  planets: PlanetInstance[];
  onFootForward: Vector3;
  character: AnimatedCharacter;
  stationPosition: Vector3;
  stationRingAngle: number;
  starRadius: number;
  stationEnabled: boolean;
  // Camera / reticle forward in system space — used for hyperdrive lock-on so
  // the cone matches what the player sees through the crosshair.
  getAimDir: () => Vector3;
  inventory: PlayerInventory;
  getCamLook?: () => { pos: Vector3; forward: Vector3; planetLodPos: Vector3 };
  onPickup?: () => void;
}

const dir = new Vector3();
const bayPos = new Vector3();
const lookDir = new Vector3();
const STAR_BODY = { systemPosition: new Vector3(0, 0, 0), radius: 4000 as number };

export function updatePossession(state: PossessionState, deps: PossessionDeps, dt: number) {
  const { world, player, ship, physics, input, hud, planets, stationPosition } = deps;
  const s = ship.ship!;
  STAR_BODY.radius = deps.starRadius;

  if (state.mode === "onFoot") {
    if (state.boardPhase === "boarding") {
      hud.setPrompt("Boarding…");
      return;
    }
    if (state.boardPhase === "exiting") {
      hud.setPrompt("Exiting…");
      return;
    }

    const rocks = state.currentPlanet.rocks;
    const ore = state.currentPlanet.ore;
    updatePlayerMovement(
      world, state.currentPlanet.planet, input, deps.onFootForward, dt,
      rocks, ore, deps.inventory,
    );
    const m = player.movement!;
    deps.character.setBindPose(m.hoverboarding);
    if (!m.hoverboarding) {
      deps.character.setLocomotion(m.speed01, m.grounded, m.inLiquid && !m.flying);
      if (m.didJump && !m.inLiquid) deps.character.play("jump");
      if (m.didSlide && !m.inLiquid) deps.character.play("slide");
    }
    deps.character.update(dt);

    const distToShip = player.position!.distanceTo(ship.position!);
    const hasBoard = hasEquippedMount(deps.inventory, "hoverboard");
    if (distToShip < SHIP.enterRange && s.mode === "landed" && state.dockBay === null) {
      hud.setPrompt(m.hoverboarding
        ? "Press E to board ship · H stow board"
        : hasBoard
          ? "Press E to board ship · H hoverboard"
          : "Press E to board ship");
      if (input.justPressed("KeyE")) {
        m.hoverboarding = false;
        deps.character.setBindPose(false);
        state.boardPhase = "boarding";
        syncVelocityToPlanet(ship, state.currentPlanet, game.time);
      }
    } else {
      let focused: WorldDrop | null = null;
      if (deps.getCamLook) {
        const look = deps.getCamLook();
        focused = findFocusedDrop(
          state.currentPlanet.def.id,
          player.position!,
          look.pos,
          look.forward,
          look.planetLodPos,
        );
      }
      if (focused) {
        const name = getItem(focused.itemId)?.name ?? "item";
        const qty = focused.qty > 1 ? ` ×${focused.qty}` : "";
        hud.setPrompt(`Press E to pick up ${name}${qty}`);
        if (input.justPressed("KeyE")) {
          if (tryPickupDrop(focused, deps.inventory)) deps.onPickup?.();
        }
      } else if (m.hoverboarding) {
        hud.setPrompt("Hoverboard · Shift boost · Space jump · A/D air roll · H stow");
      } else {
        hud.clearPrompt();
      }
    }
    return;
  }

  if (state.boardPhase === "boarding" || state.boardPhase === "exiting") {
    hud.setPrompt(state.boardPhase === "boarding" ? "Boarding…" : "Exiting…");
    return;
  }

  // Take-off / landing tweens (planet-local; no teleport).
  if (s.mode === "launching") {
    updateLaunch(ship, state.currentPlanet, game.time, dt);
    hud.setPrompt("Taking off…");
    return;
  }
  if (s.mode === "landing") {
    updateLanding(ship, state.currentPlanet, dt);
    hud.setPrompt("Landing…");
    return;
  }

  if (s.mode === "docked") {
    if (!deps.stationEnabled) {
      s.mode = "flying";
      state.dockBay = null;
      return;
    }
    bayLocalPosition(s.dockBay ?? 0, deps.stationRingAngle, bayPos);
    ship.position!.copy(bayPos);
    ship.prevPosition!.copy(bayPos);
    const dock = updateStationDocking(ship, stationPosition, deps.stationRingAngle, game.time, input);
    state.dockBay = dock.nearestBay;
    hud.setPrompt("Press E to undock");
    return;
  }

  if (s.mode === "landed") {
    snapLandedShipToTerrain(ship, state.currentPlanet);
    syncVelocityToPlanet(ship, state.currentPlanet, game.time);
    hud.setPrompt("Press E to exit · W to launch");
    if (input.justPressed("KeyE")) {
      dir.copy(ship.position!).addScaledVector(ship.faceDir!, 4).normalize();
      const r = state.currentPlanet.planet.surfaceRadius(dir.x, dir.y, dir.z);
      player.position!.copy(dir).multiplyScalar(r);
      player.prevPosition!.copy(player.position!);
      player.movement!.up.copy(dir);
      player.movement!.velocity.set(0, 0, 0);
      player.movement!.faceDir.copy(ship.faceDir!);
      state.boardPhase = "exiting";
      return;
    }
    if (input.justPressed("KeyW")) {
      beginLaunch(ship, state.currentPlanet);
      state.dockBay = null;
    }
    return;
  }

  const dock = deps.stationEnabled
    ? updateStationDocking(ship, stationPosition, deps.stationRingAngle, game.time, input)
    : { docked: false, canDock: false, nearestBay: null as number | null };
  if (dock.docked) {
    state.dockBay = dock.nearestBay;
    hud.setPrompt("Press E to undock");
    return;
  }

  // Space charges the hyperdrive; pressing it again (charging OR cruising)
  // drops back to free flight. Lock-on uses the camera/reticle aim direction.
  lookDir.copy(deps.getAimDir());
  if (lookDir.lengthSq() < 1e-8) {
    lookDir.set(0, 0, -1).applyQuaternion(s.orientation);
  } else {
    lookDir.normalize();
  }
  const flightDeps = {
    input, planets, starBody: STAR_BODY,
    stationBody: deps.stationEnabled
      ? { systemPosition: stationPosition, radius: STATION_RADIUS }
      : { systemPosition: stationPosition, radius: 0 },
    time: game.time,
    lookDir,
  };

  if (input.justPressed("Space")) {
    if (s.warpPhase !== "idle") stopWarp(ship, flightDeps);
    else {
      const result = beginWarp(ship, flightDeps);
      if (!result.ok && result.blockedBy) {
        hud.setPrompt(`Too close to ${result.blockedBy}`);
        warpBlockPromptT = 2.8;
      }
    }
  }

  const flight = updateShipFlight(ship, flightDeps, dt, input.justPressed("KeyE"));

  if (s.warpPhase !== "idle") {
    warpBlockPromptT = 0;
    const lockName = getWarpLockName(ship, flightDeps);
    hud.setPrompt(lockName
      ? (s.warpPhase === "charging"
        ? `Hyperdrive locking onto ${lockName}…`
        : `Hyperdrive → ${lockName}`)
      : (s.warpPhase === "charging" ? "Charging hyperdrive…" : "Hyperdrive engaged"));
  } else if (flight.canManualLand) {
    warpBlockPromptT = 0;
    hud.setPrompt("Press E to land");
  } else if (dock.canDock) {
    warpBlockPromptT = 0;
    hud.setPrompt("Press E to dock");
  } else if (warpBlockPromptT > 0) {
    warpBlockPromptT -= dt;
  } else {
    hud.clearPrompt();
  }

  if (flight.landPlanet && flight.landNormal) {
    state.currentPlanet = flight.landPlanet;
    state.dockBay = null;
    physics.setActivePlanet(flight.landPlanet.colliderVertices, flight.landPlanet.colliderIndices);
    beginLanding(ship, flight.landPlanet, flight.landNormal);
  }
}
