import { Vector3 } from "three";
import type { Entity } from "../ecs/components";
import type { PlanetInstance } from "../worldgen/planetInstance";
import { basisQuaternion } from "../engine/surfaceOrient";
import { launchVelocity } from "./shipGravity";
import { systemPositionOf } from "./shipFlight";
import { findFlatLandingNormal, landingRestPosition } from "./landingSite";
import { SHIP } from "../config/ship";

const smooth = (t: number) => t * t * (3 - 2 * t);
const tmp = new Vector3();
const fwd = new Vector3();
const landN = new Vector3();

export function beginLaunch(ship: Entity, planet: PlanetInstance) {
  const s = ship.ship!;
  s.mode = "launching";
  s.phaseT = 0;
  s.phaseFrom.copy(ship.position!);
  const up = ship.up!;
  const r = planet.planet.surfaceRadius(up.x, up.y, up.z) + SHIP.launchClearance;
  s.phaseTo.copy(up).multiplyScalar(r);
  basisQuaternion(up, ship.faceDir!, s.orientation);
  s.velocity.set(0, 0, 0);
}

export function updateLaunch(ship: Entity, planet: PlanetInstance, time: number, dt: number): boolean {
  const s = ship.ship!;
  ship.prevPosition!.copy(ship.position!);
  s.phaseT = Math.min(1, s.phaseT + dt / SHIP.launchSeconds);
  ship.position!.lerpVectors(s.phaseFrom, s.phaseTo, smooth(s.phaseT));
  s.throttle = 0.25 + 0.6 * s.phaseT;
  if (s.phaseT >= 1) {
    systemPositionOf(ship.position!, planet, tmp);
    ship.position!.copy(tmp);
    ship.prevPosition!.copy(tmp);
    launchVelocity(ship.up!, planet, time, s.velocity);
    s.throttle = 0;
    s.mode = "flying";
    return true;
  }
  return false;
}

export function beginLanding(ship: Entity, planet: PlanetInstance, normal: Vector3) {
  const s = ship.ship!;
  tmp.copy(ship.position!).sub(planet.systemPosition);
  s.phaseFrom.copy(tmp);

  findFlatLandingNormal(planet, normal, landN);
  ship.up!.copy(landN);

  fwd.set(0, 0, -1).applyQuaternion(s.orientation);
  fwd.addScaledVector(landN, -fwd.dot(landN));
  if (fwd.lengthSq() < 1e-6) fwd.set(1, 0, 0).addScaledVector(landN, -landN.x);
  ship.faceDir!.copy(fwd.normalize());

  landingRestPosition(planet, landN, s.phaseTo);
  ship.position!.copy(s.phaseFrom);
  ship.prevPosition!.copy(s.phaseFrom);
  basisQuaternion(landN, ship.faceDir!, s.orientation);
  s.velocity.set(0, 0, 0);
  s.mode = "landing";
  s.phaseT = 0;
}

export function updateLanding(ship: Entity, planet: PlanetInstance, dt: number): boolean {
  const s = ship.ship!;
  ship.prevPosition!.copy(ship.position!);
  s.phaseT = Math.min(1, s.phaseT + dt / SHIP.landSeconds);

  // Keep the rest pose glued to the live surface (terrain doesn't move, but
  // this also re-snaps if liquid/sea level is involved).
  landingRestPosition(planet, ship.up!, s.phaseTo);
  ship.position!.lerpVectors(s.phaseFrom, s.phaseTo, smooth(s.phaseT));
  basisQuaternion(ship.up!, ship.faceDir!, s.orientation);
  s.throttle = 0.3 * (1 - s.phaseT);
  if (s.phaseT >= 1) {
    ship.position!.copy(s.phaseTo);
    s.mode = "landed";
    s.velocity.set(0, 0, 0);
    return true;
  }
  return false;
}

export function snapLandedShipToTerrain(ship: Entity, planet: PlanetInstance) {
  if (ship.ship?.mode !== "landed") return;
  landingRestPosition(planet, ship.up!, tmp);
  ship.position!.copy(tmp);
  ship.prevPosition!.copy(tmp);
  basisQuaternion(ship.up!, ship.faceDir!, ship.ship.orientation);
}
