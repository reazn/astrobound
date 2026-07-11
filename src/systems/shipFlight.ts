import { Quaternion, Vector3 } from "three";
import type { Entity } from "../ecs/components";
import type { Input } from "../engine/input";
import type { PlanetInstance } from "../worldgen/planetInstance";
import { SHIP } from "../config/ship";
import { updateShipSteering } from "./shipSteering";
import { applyPlanetInteractions, type PlanetFlightResult } from "./shipPlanetInteraction";
import { applyOrbitalGravity } from "./shipGravity";
import { orbitVelocityAt } from "../worldgen/orbits";
import { STATION_ORBIT } from "../content/station";

const forward = new Vector3();
const frameVel = new Vector3();
const relVel = new Vector3();
const tmp = new Vector3();
const aimDir = new Vector3();
const bodyVel = new Vector3();
const qTarget = new Quaternion();
const qSlerp = new Quaternion();

export interface GravityBody {
  systemPosition: Vector3;
  radius: number;
}

export type WarpLockKind = "planet" | "station" | "star";

export interface WarpLockTarget {
  id: string;
  kind: WarpLockKind;
  name: string;
  systemPosition: Vector3;
  radius: number;
  planet?: PlanetInstance;
}

export interface ShipFlightDeps {
  input: Input;
  planets: PlanetInstance[];
  starBody: GravityBody;
  stationBody: GravityBody;
  time: number;
  lookDir?: Vector3;
}

const noResult = (): PlanetFlightResult => ({
  landPlanet: null, landNormal: null, canManualLand: false, inAtmosphere: false,
});

function findWarpLock(
  shipPos: Vector3,
  lookDir: Vector3,
  deps: ShipFlightDeps,
): WarpLockTarget | null {
  const maxAngle = SHIP.warpLockFovDeg * (Math.PI / 180);
  let best: WarpLockTarget | null = null;
  let bestScore = Infinity;

  const consider = (
    id: string, kind: WarpLockKind, name: string,
    center: Vector3, radius: number, planet?: PlanetInstance,
  ) => {
    tmp.copy(center).sub(shipPos);
    const dist = tmp.length();
    if (dist < 1) return;
    tmp.multiplyScalar(1 / dist);
    const dot = tmp.dot(lookDir);
    if (dot < 0.15) return;
    const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
    if (angle > maxAngle) return;
    if (angle < bestScore) {
      bestScore = angle;
      best = { id, kind, name, systemPosition: center, radius, planet };
    }
  };

  for (const p of deps.planets) {
    consider(p.def.id, "planet", p.def.name, p.systemPosition, p.planet.maxR, p);
  }
  if (deps.stationBody.radius > 0) {
    consider(
      "station", "station", "Meridian Station",
      deps.stationBody.systemPosition, deps.stationBody.radius,
    );
  }

  return best;
}

function slewToward(orientation: Quaternion, dir: Vector3, rate: number, dt: number) {
  if (dir.lengthSq() < 1e-8) return;
  aimDir.copy(dir).normalize();
  tmp.set(0, 0, -1).applyQuaternion(orientation);
  const dot = Math.max(-1, Math.min(1, tmp.dot(aimDir)));
  if (dot > 0.9995) return;
  qTarget.setFromUnitVectors(tmp, aimDir);
  const step = Math.min(1, rate * dt);
  qSlerp.copy(orientation).premultiply(qTarget);
  orientation.slerp(qSlerp, step);
  orientation.normalize();
}

function exitVelocityForTarget(
  s: Entity["ship"],
  deps: ShipFlightDeps,
  approachDir: Vector3,
): void {
  if (!s) return;
  const id = s.warpTargetId;
  bodyVel.set(0, 0, 0);

  if (id) {
    const planet = deps.planets.find((p) => p.def.id === id);
    if (planet) {
      orbitVelocityAt(planet.def.orbit, deps.time, bodyVel);
    } else if (id === "station") {
      orbitVelocityAt(STATION_ORBIT, deps.time, bodyVel);
    }
  }

  s.velocity.copy(bodyVel).addScaledVector(approachDir, SHIP.warpExitSpeed);
}

function clearWarp(s: NonNullable<Entity["ship"]>) {
  s.warpPhase = "idle";
  s.warpT = 0;
  s.warpTargetId = null;
  s.steerX = 0;
  s.steerY = 0;
  s.angVel.set(0, 0, 0);
  s.throttle = 0;
  s.boosting = false;
}

function approaching(pos: Vector3, fwd: Vector3, center: Vector3, exitDist: number): boolean {
  tmp.copy(center).sub(pos);
  const d = tmp.length();
  if (d < 1) return true;
  if (d >= exitDist) return false;
  tmp.multiplyScalar(1 / d);
  return tmp.dot(fwd) > 0.15;
}

function checkWarpExit(
  pos: Vector3, fwd: Vector3, deps: ShipFlightDeps, targetId: string | null,
): { hit: boolean; approach: Vector3 } {
  const approach = new Vector3();

  if (targetId) {
    const planet = deps.planets.find((p) => p.def.id === targetId);
    if (planet) {
      const exitDist = planet.planet.maxR * SHIP.warpExitPlanetRadii;
      if (approaching(pos, fwd, planet.systemPosition, exitDist)) {
        approach.copy(planet.systemPosition).sub(pos).normalize();
        return { hit: true, approach };
      }
      return { hit: false, approach };
    }
    if (targetId === "station") {
      if (approaching(pos, fwd, deps.stationBody.systemPosition, SHIP.warpExitStationDist)) {
        approach.copy(deps.stationBody.systemPosition).sub(pos).normalize();
        return { hit: true, approach };
      }
      return { hit: false, approach };
    }
  }

  for (const p of deps.planets) {
    if (approaching(pos, fwd, p.systemPosition, p.planet.maxR * SHIP.warpExitPlanetRadii)) {
      approach.copy(p.systemPosition).sub(pos).normalize();
      return { hit: true, approach };
    }
  }
  if (approaching(pos, fwd, deps.starBody.systemPosition, deps.starBody.radius * SHIP.warpExitStarRadii)) {
    approach.copy(deps.starBody.systemPosition).sub(pos).normalize();
    return { hit: true, approach };
  }
  if (approaching(pos, fwd, deps.stationBody.systemPosition, SHIP.warpExitStationDist)) {
    approach.copy(deps.stationBody.systemPosition).sub(pos).normalize();
    return { hit: true, approach };
  }
  return { hit: false, approach };
}

function resolveLock(id: string, deps: ShipFlightDeps): WarpLockTarget | null {
  const planet = deps.planets.find((p) => p.def.id === id);
  if (planet) {
    return {
      id: planet.def.id, kind: "planet", name: planet.def.name,
      systemPosition: planet.systemPosition, radius: planet.planet.maxR, planet,
    };
  }
  if (id === "station") {
    return {
      id: "station", kind: "station", name: "Meridian Station",
      systemPosition: deps.stationBody.systemPosition, radius: deps.stationBody.radius,
    };
  }
  return null;
}

export function tooCloseForWarp(
  pos: Vector3,
  deps: ShipFlightDeps,
): { name: string } | null {
  for (const p of deps.planets) {
    const d = pos.distanceTo(p.systemPosition);
    if (d < p.planet.maxR * SHIP.warpMinPlanetRadii) {
      return { name: p.def.name };
    }
  }
  if (pos.distanceTo(deps.stationBody.systemPosition) < SHIP.warpMinStationDist) {
    return { name: "Meridian Station" };
  }
  return null;
}

export function updateShipFlight(
  ship: Entity, deps: ShipFlightDeps, dt: number, manualLand: boolean,
): PlanetFlightResult {
  const s = ship.ship!;
  const pos = ship.position!;
  ship.prevPosition!.copy(pos);

  if (s.warpPhase === "charging") {
    s.steerX = 0;
    s.steerY = 0;
    s.angVel.set(0, 0, 0);
    s.throttle = 0;
    s.boosting = false;
    deps.input.consumeMouse();

    applyOrbitalGravity(ship, deps.planets, deps.starBody, deps.time, dt, frameVel);
    s.velocity.copy(frameVel);
    pos.addScaledVector(s.velocity, dt);

    if (s.warpTargetId) {
      const lock = resolveLock(s.warpTargetId, deps);
      if (lock) {
        tmp.copy(lock.systemPosition).sub(pos);
        slewToward(s.orientation, tmp, SHIP.warpTurnRate, dt);
      }
    }

    s.warpT += dt / SHIP.warpChargeSeconds;
    if (s.warpT >= 1) { s.warpPhase = "cruising"; s.warpT = 1; }
    return noResult();
  }

  if (s.warpPhase === "cruising") {
    s.steerX = 0;
    s.steerY = 0;
    s.angVel.set(0, 0, 0);
    s.throttle = 0;
    s.boosting = false;
    deps.input.consumeMouse();

    if (s.warpTargetId) {
      const lock = resolveLock(s.warpTargetId, deps);
      if (lock) {
        tmp.copy(lock.systemPosition).sub(pos);
        slewToward(s.orientation, tmp, SHIP.warpTurnRate * 1.4, dt);
      }
    }

    forward.set(0, 0, -1).applyQuaternion(s.orientation);

    const exit = checkWarpExit(pos, forward, deps, s.warpTargetId);
    if (exit.hit) {
      exitVelocityForTarget(s, deps, exit.approach.lengthSq() > 0.01 ? exit.approach : forward);
      clearWarp(s);
      return noResult();
    }

    pos.addScaledVector(forward, SHIP.warpCruiseSpeed * dt);
    s.velocity.copy(forward).multiplyScalar(SHIP.warpCruiseSpeed);
    return noResult();
  }

  if (s.mode !== "flying") return noResult();

  updateShipSteering(s, deps.input, dt);

  const throttleInput = (deps.input.held("KeyW") ? 1 : 0) - (deps.input.held("KeyS") ? 1 : 0);
  s.throttle += (throttleInput - s.throttle) * Math.min(1, dt * 3);
  s.boosting = deps.input.held("ShiftLeft") || deps.input.held("ShiftRight");
  s.boostFuel = 1;

  forward.set(0, 0, -1).applyQuaternion(s.orientation);

  let accelMag = (s.throttle >= 0 ? SHIP.thrustAccel : SHIP.reverseAccel) * s.throttle;
  if (s.boosting) {
    if (Math.abs(s.throttle) > 0.05) accelMag *= SHIP.boostMultiplier;
    else accelMag = SHIP.boostAloneAccel;
  }
  s.velocity.addScaledVector(forward, accelMag * dt);

  // Free flight: keep orbital frame matching / damping, but no gravity pull.
  applyOrbitalGravity(ship, deps.planets, deps.starBody, deps.time, dt, frameVel, 0);

  const cap = s.boosting ? SHIP.maxSpeed * SHIP.boostMultiplier : SHIP.maxSpeed;
  relVel.copy(s.velocity).sub(frameVel);
  if (relVel.length() > cap) {
    relVel.setLength(cap);
    s.velocity.copy(frameVel).add(relVel);
  }

  pos.addScaledVector(s.velocity, dt);

  return applyPlanetInteractions(ship, deps.planets, pos, manualLand, deps.time, dt);
}

export function beginWarp(ship: Entity, deps: ShipFlightDeps): { ok: boolean; blockedBy?: string } {
  const s = ship.ship!;
  if (s.mode !== "flying" || s.warpPhase !== "idle") return { ok: false };

  const blocked = tooCloseForWarp(ship.position!, deps);
  if (blocked) return { ok: false, blockedBy: blocked.name };

  const look = deps.lookDir ?? forward.set(0, 0, -1).applyQuaternion(s.orientation);
  const lock = findWarpLock(ship.position!, look, deps);
  s.warpTargetId = lock?.id ?? null;
  s.warpPhase = "charging";
  s.warpT = 0;
  s.steerX = 0;
  s.steerY = 0;
  s.angVel.set(0, 0, 0);
  s.throttle = 0;
  s.boosting = false;
  return { ok: true };
}

export function stopWarp(ship: Entity, deps?: ShipFlightDeps) {
  const s = ship.ship!;
  if (s.warpPhase === "idle") return;

  if (s.warpPhase === "cruising") {
    forward.set(0, 0, -1).applyQuaternion(s.orientation);
    if (deps && s.warpTargetId) {
      const lock = resolveLock(s.warpTargetId, deps);
      if (lock) {
        tmp.copy(lock.systemPosition).sub(ship.position!).normalize();
        exitVelocityForTarget(s, deps, tmp);
      } else {
        s.velocity.copy(forward).multiplyScalar(SHIP.warpExitSpeed);
      }
    } else if (deps) {
      exitVelocityForTarget(s, deps, forward);
    } else {
      s.velocity.copy(forward).multiplyScalar(SHIP.warpExitSpeed);
    }
  }

  clearWarp(s);
}

export function getWarpLockName(ship: Entity, deps: ShipFlightDeps): string | null {
  const id = ship.ship?.warpTargetId;
  if (!id) return null;
  return resolveLock(id, deps)?.name ?? null;
}

export function systemPositionOf(
  localPos: Vector3, planet: PlanetInstance, out: Vector3,
): Vector3 {
  return out.copy(planet.systemPosition).add(localPos);
}
