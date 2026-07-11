import { Vector3 } from "three";
import type { Entity } from "../ecs/components";
import type { PlanetInstance } from "../worldgen/planetInstance";
import { orbitVelocityAt } from "../worldgen/orbits";
import { SHIP } from "../config/ship";
import { settings } from "../config/settings";

const toPlanet = new Vector3();
const planetVel = new Vector3();
const gravDir = new Vector3();
const relVel = new Vector3();
const tangent = new Vector3();

export interface GravityBody {
  systemPosition: Vector3;
  radius: number;
}

function smoothInfluence(dist: number, influenceR: number): number {
  const t = 1 - dist / influenceR;
  if (t <= 0) return 0;
  return t * t * (3 - 2 * t);
}

// Everything the ship does is resolved RELATIVE to a local orbital reference
// frame — the orbital velocity of whichever body currently dominates (the
// planet whose gravity well you are deepest in, or, failing that, the nearest
// planet). Gravity is a straight acceleration; drag and the speed cap act on
// the velocity RELATIVE to that frame, so a ship with no throttle coasts to
// match the frame's motion instead of the star's rest frame. The upshot is
// exactly the "relativity" feel: near a planet you appear locked to it, and
// you can cruise to another orbiting body without the orbits sweeping you off.
export function applyOrbitalGravity(
  ship: Entity,
  planets: PlanetInstance[],
  starBody: GravityBody,
  time: number,
  dt: number,
  frameVelOut: Vector3,
  pullScale = 1,
): { dominantPlanetId: string | null; inWell: boolean } {
  const s = ship.ship!;
  const pos = ship.position!;
  let dominant: PlanetInstance | null = null;
  let bestInfluence = 0;
  let nearest: PlanetInstance = planets[0];
  let nearestDist = Infinity;
  let totalInfluence = 0;

  for (const planet of planets) {
    const radius = planet.planet.maxR;
    toPlanet.copy(planet.systemPosition).sub(pos);
    const dist = toPlanet.length();
    if (dist < nearestDist) { nearestDist = dist; nearest = planet; }

    const influenceR = radius * SHIP.gravityInfluenceRadii;
    if (dist < influenceR && dist > 1) {
      const influence = smoothInfluence(dist, influenceR);
      totalInfluence = Math.max(totalInfluence, influence);

      if (pullScale > 0) {
        gravDir.copy(toPlanet).multiplyScalar(1 / dist);
        const g = SHIP.gravityStrengthAtSurface * (radius / dist) ** 2 * pullScale;
        s.velocity.addScaledVector(gravDir, g * influence * dt);
      }

      if (influence > bestInfluence) {
        bestInfluence = influence;
        dominant = planet;
      }
    }
  }

  toPlanet.copy(starBody.systemPosition).sub(pos);
  const starDist = toPlanet.length();
  const starInfluenceR = starBody.radius * SHIP.gravityInfluenceRadii;
  if (pullScale > 0 && starDist < starInfluenceR && starDist > 1) {
    const influence = smoothInfluence(starDist, starInfluenceR);
    gravDir.copy(toPlanet).multiplyScalar(1 / starDist);
    const g = SHIP.gravityStrengthAtSurface * 0.15 * (starBody.radius / starDist) ** 2 * pullScale;
    s.velocity.addScaledVector(gravDir, g * influence * dt);
  }

  // Reference frame velocity: the dominant well's body, or the nearest planet.
  const frame = dominant ?? nearest;
  if (frame) orbitVelocityAt(frame.def.orbit, time, frameVelOut);
  else frameVelOut.set(0, 0, 0);

  // Damp velocity toward the frame (not toward the star's rest). Brake mode
  // (default) settles to a relative stop when you release thrust; momentum mode
  // keeps a light vacuum coast. Never fight active thrust/boost.
  relVel.copy(s.velocity).sub(frameVelOut);
  const thrusting = Math.abs(s.throttle) > 0.08 || s.boosting;
  if (!thrusting || settings.maintainMomentum) {
    const baseDamp = settings.maintainMomentum ? SHIP.linearDamping : SHIP.brakeDamping;
    const damp = baseDamp * (1 - totalInfluence * SHIP.orbitDampReduction);
    relVel.multiplyScalar(Math.max(0, 1 - damp * dt));
    if (!settings.maintainMomentum && relVel.lengthSq() < 0.04) relVel.set(0, 0, 0);
  }
  s.velocity.copy(frameVelOut).add(relVel);

  return { dominantPlanetId: dominant?.def.id ?? null, inWell: totalInfluence > 0.05 };
}

export function syncVelocityToPlanet(ship: Entity, planet: PlanetInstance, time: number) {
  orbitVelocityAt(planet.def.orbit, time, planetVel);
  ship.ship!.velocity.copy(planetVel);
}

export function launchVelocity(
  up: Vector3, planet: PlanetInstance, time: number, out: Vector3,
): Vector3 {
  orbitVelocityAt(planet.def.orbit, time, out);
  tangent.copy(up).multiplyScalar(SHIP.launchLiftAccel);
  return out.add(tangent);
}

export function velocityRelativeToPlanet(
  shipVel: Vector3, planet: PlanetInstance, time: number, out: Vector3,
): Vector3 {
  orbitVelocityAt(planet.def.orbit, time, planetVel);
  return out.copy(shipVel).sub(planetVel);
}

export function speedRelativeToPlanet(shipVel: Vector3, planet: PlanetInstance, time: number): number {
  return velocityRelativeToPlanet(shipVel, planet, time, relVel).length();
}

export function orbitalFrameVelocity(
  shipPos: Vector3,
  planets: PlanetInstance[],
  time: number,
  out: Vector3,
): Vector3 {
  let dominant: PlanetInstance | null = null;
  let bestInfluence = 0;
  let nearest: PlanetInstance = planets[0];
  let nearestDist = Infinity;

  for (const planet of planets) {
    toPlanet.copy(planet.systemPosition).sub(shipPos);
    const dist = toPlanet.length();
    if (dist < nearestDist) { nearestDist = dist; nearest = planet; }
    const influenceR = planet.planet.maxR * SHIP.gravityInfluenceRadii;
    if (dist < influenceR && dist > 1) {
      const influence = smoothInfluence(dist, influenceR);
      if (influence > bestInfluence) {
        bestInfluence = influence;
        dominant = planet;
      }
    }
  }

  const frame = dominant ?? nearest;
  if (frame) orbitVelocityAt(frame.def.orbit, time, out);
  else out.set(0, 0, 0);
  return out;
}
