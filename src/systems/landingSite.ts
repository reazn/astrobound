import type { PlanetInstance } from "../worldgen/planetInstance";
import { Vector3 } from "three";
import { SHIP } from "../config/ship";

// Sample nearby surface normals and pick the flattest patch within a short
// walk of the approach point — used for landing / spawn so the ship sits
// level on a poly instead of floating on a steep face.

const tmp = new Vector3();
const bestN = new Vector3();
const cand = new Vector3();
const right = new Vector3();
const forward = new Vector3();

function slopeAt(planet: PlanetInstance, n: Vector3): number {
  // Finite-difference slope: how much height changes across a small tangent step.
  right.set(1, 0, 0).addScaledVector(n, -n.x);
  if (right.lengthSq() < 1e-6) right.set(0, 0, 1).addScaledVector(n, -n.z);
  right.normalize();
  forward.crossVectors(n, right).normalize();
  const eps = 2.5;
  const r0 = planet.planet.surfaceRadius(n.x, n.y, n.z);
  tmp.copy(n).addScaledVector(right, eps / planet.planet.radius).normalize();
  const r1 = planet.planet.surfaceRadius(tmp.x, tmp.y, tmp.z);
  tmp.copy(n).addScaledVector(forward, eps / planet.planet.radius).normalize();
  const r2 = planet.planet.surfaceRadius(tmp.x, tmp.y, tmp.z);
  return Math.hypot(r1 - r0, r2 - r0);
}

export function findFlatLandingNormal(
  planet: PlanetInstance,
  approachNormal: Vector3,
  out: Vector3,
): Vector3 {
  bestN.copy(approachNormal).normalize();
  let bestSlope = slopeAt(planet, bestN);

  right.set(1, 0, 0).addScaledVector(bestN, -bestN.x);
  if (right.lengthSq() < 1e-6) right.set(0, 0, 1).addScaledVector(bestN, -bestN.z);
  right.normalize();
  forward.crossVectors(bestN, right).normalize();

  // Spiral search around the approach point (planet-local angular offsets).
  const radii = [0.008, 0.016, 0.028, 0.042, 0.06];
  const steps = [8, 10, 12, 14, 16];
  for (let ring = 0; ring < radii.length; ring++) {
    const angStep = (Math.PI * 2) / steps[ring];
    for (let i = 0; i < steps[ring]; i++) {
      const a = i * angStep;
      cand.copy(approachNormal)
        .addScaledVector(right, Math.cos(a) * radii[ring])
        .addScaledVector(forward, Math.sin(a) * radii[ring])
        .normalize();
      const s = slopeAt(planet, cand);
      if (s < bestSlope) {
        bestSlope = s;
        bestN.copy(cand);
      }
    }
  }
  return out.copy(bestN);
}

export function landingRestPosition(
  planet: PlanetInstance,
  normal: Vector3,
  out: Vector3,
): Vector3 {
  const r = planet.planet.surfaceRadius(normal.x, normal.y, normal.z) + SHIP.landedHeight;
  // Keep above liquid if present.
  const sea = planet.planet.def.liquid ? planet.planet.seaLevel + SHIP.landedHeight + 1 : 0;
  return out.copy(normal).multiplyScalar(Math.max(r, sea));
}
