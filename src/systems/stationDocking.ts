import { Vector3 } from "three";
import type { Entity } from "../ecs/components";
import type { Input } from "../engine/input";
import { DOCK_BAY_COUNT, STATION_ORBIT } from "../content/station";
import { SHIP } from "../config/ship";
import { basisQuaternion } from "../engine/surfaceOrient";
import { orbitVelocityAt } from "../worldgen/orbits";

const bayOffset = new Vector3();
const bayWorld = new Vector3();
const away = new Vector3();
const stationVel = new Vector3();
const relVel = new Vector3();

export function bayLocalPosition(bayIndex: number, ringAngle: number, out: Vector3): Vector3 {
  const angle = (bayIndex / DOCK_BAY_COUNT) * Math.PI * 2 + ringAngle;
  return out.set(Math.cos(angle) * 48, 0, Math.sin(angle) * 48);
}

export interface DockingResult {
  docked: boolean;
  undocked: boolean;
  nearestBay: number | null;
  canDock: boolean;
}

export function updateStationDocking(
  ship: Entity,
  stationPos: Vector3,
  ringAngle: number,
  time: number,
  input: Input,
): DockingResult {
  const s = ship.ship!;
  const pos = ship.position!;
  orbitVelocityAt(STATION_ORBIT, time, stationVel);

  if (s.mode === "docked") {
    if (input.justPressed("KeyE")) {
      bayLocalPosition(s.dockBay ?? 0, ringAngle, bayOffset);
      away.copy(bayOffset).normalize();
      pos.copy(stationPos).add(bayOffset).addScaledVector(away, SHIP.undockImpulse * 0.2);
      ship.prevPosition!.copy(pos);
      relVel.copy(away).multiplyScalar(SHIP.undockImpulse).add(stationVel);
      s.velocity.copy(relVel);
      // Face outward from the station: flight forward is local -Z, and
      // basisQuaternion maps faceDir → local +Z, so face the opposite of away.
      ship.up!.set(0, 1, 0);
      ship.faceDir!.copy(away).negate();
      if (Math.abs(ship.faceDir!.dot(ship.up!)) > 0.95) {
        ship.faceDir!.set(1, 0, 0);
      }
      ship.faceDir!.addScaledVector(ship.up!, -ship.faceDir!.dot(ship.up!)).normalize();
      basisQuaternion(ship.up!, ship.faceDir!, s.orientation);
      s.mode = "flying";
      s.dockBay = null;
      s.warpPhase = "idle";
      s.warpT = 0;
      s.warpTargetId = null;
      s.steerX = 0;
      s.steerY = 0;
      s.angVel.set(0, 0, 0);
      s.throttle = 0;
      return { docked: false, undocked: true, nearestBay: null, canDock: false };
    }
    return { docked: true, undocked: false, nearestBay: s.dockBay, canDock: false };
  }

  if (s.mode !== "flying") {
    return { docked: false, undocked: false, nearestBay: null, canDock: false };
  }

  let nearestBay: number | null = null;
  let nearestDist = Infinity;
  for (let i = 0; i < DOCK_BAY_COUNT; i++) {
    bayLocalPosition(i, ringAngle, bayOffset);
    bayWorld.copy(stationPos).add(bayOffset);
    const d = pos.distanceTo(bayWorld);
    if (d < nearestDist) {
      nearestDist = d;
      nearestBay = i;
    }
  }

  relVel.copy(s.velocity).sub(stationVel);
  const relSpeed = relVel.length();
  const canDock = nearestBay !== null && nearestDist < SHIP.dockRange && relSpeed < SHIP.dockMaxSpeed;

  if (canDock && input.justPressed("KeyE")) {
    bayLocalPosition(nearestBay!, ringAngle, bayOffset);
    pos.copy(bayOffset);
    ship.prevPosition!.copy(pos);
    s.velocity.set(0, 0, 0);
    s.mode = "docked";
    s.dockBay = nearestBay;
    ship.up!.set(0, 1, 0);
    away.copy(bayOffset).normalize();
    tangentFromAway(away, ship.faceDir!);
    return { docked: true, undocked: false, nearestBay, canDock: true };
  }

  return { docked: false, undocked: false, nearestBay, canDock };
}

function tangentFromAway(away: Vector3, out: Vector3) {
  out.set(0, 1, 0).addScaledVector(away, -away.y);
  if (out.lengthSq() < 1e-6) out.set(1, 0, 0);
  out.normalize();
}
