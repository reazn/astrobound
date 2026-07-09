import { Vector3 } from "three";
import type { Entity } from "../ecs/components";
import type { PlanetInstance } from "../worldgen/planetInstance";
import { orbitVelocityAt } from "../worldgen/orbits";
import { SHIP } from "../config/ship";

const dirToPlanet = new Vector3();
const planetVel = new Vector3();
const relVel = new Vector3();
const landNormalOut = new Vector3();

export interface PlanetFlightResult {
  landPlanet: PlanetInstance | null;
  landNormal: Vector3 | null;
  canManualLand: boolean;
  inAtmosphere: boolean;
}

export function applyPlanetInteractions(
  ship: Entity,
  planets: PlanetInstance[],
  pos: Vector3,
  manualLand: boolean,
  time: number,
  dt: number,
): PlanetFlightResult {
  const s = ship.ship!;
  let landPlanet: PlanetInstance | null = null;
  let landNormal: Vector3 | null = null;
  let canManualLand = false;
  let inAtmosphere = false;
  s.inAtmospherePlanetId = null;

  for (const p of planets) {
    dirToPlanet.copy(pos).sub(p.systemPosition);
    const dist = dirToPlanet.length();
    if (dist < 1) continue;
    dirToPlanet.multiplyScalar(1 / dist);
    const surfaceR = p.planet.surfaceRadius(dirToPlanet.x, dirToPlanet.y, dirToPlanet.z);
    const altitude = dist - surfaceR;
    const atmoDepth = p.def.atmosphereThickness * 2.5;

    orbitVelocityAt(p.def.orbit, time, planetVel);
    relVel.copy(s.velocity).sub(planetVel);

    if (altitude < atmoDepth) {
      inAtmosphere = true;
      s.inAtmospherePlanetId = p.def.id;
      const atmoT = 1 - Math.max(0, altitude / atmoDepth);
      relVel.multiplyScalar(1 - Math.min(0.25, SHIP.atmoDragStrength * atmoT * dt));

      // Soft cushion only near the outer atmosphere shell while diving in —
      // does not fight takeoff or low-altitude flight.
      const entryBand = atmoDepth * 0.35;
      const fromTop = atmoDepth - altitude;
      if (fromTop < entryBand && fromTop > 0) {
        const entryT = 1 - fromTop / entryBand;
        const inward = -relVel.dot(dirToPlanet);
        if (inward > 80) {
          const bleed = Math.min(inward * SHIP.atmoEntryCushion * entryT * dt, inward * 0.35);
          relVel.addScaledVector(dirToPlanet, bleed);
        }
      }
    }

    const landing = manualLand && altitude < SHIP.manualLandAltitude;

    if (altitude < SHIP.collisionBuffer && !landing) {
      const penetration = SHIP.collisionBuffer - altitude;
      pos.addScaledVector(dirToPlanet, penetration);
      const inward = relVel.dot(dirToPlanet);
      if (inward < 0) relVel.addScaledVector(dirToPlanet, -inward * SHIP.collisionDamp);
      relVel.multiplyScalar(Math.max(0, 1 - SHIP.groundFriction * dt));
    }

    s.velocity.copy(planetVel).add(relVel);

    const relSpeed = relVel.length();
    if (altitude < SHIP.manualLandAltitude && relSpeed < SHIP.manualLandMaxSpeed) {
      canManualLand = true;
      if (manualLand && !landPlanet) {
        landPlanet = p;
        landNormal = landNormalOut.copy(dirToPlanet);
        break;
      }
    }
  }

  return { landPlanet, landNormal, canManualLand, inAtmosphere };
}
