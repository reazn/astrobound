import { Vector3 } from "three";
import type { OrbitElements } from "../content/planets/types";
import { STATIC_ORBITS } from "../config/scale";

// Proper elliptical (Kepler) orbits: the star sits at one focus, and each body
// sweeps equal areas in equal times (Kepler's 2nd law falls out naturally from
// solving the eccentric anomaly). Positions are in system-space (float64 —
// plain JS numbers via Vector3, safe at any magnitude since we never feed
// these directly into a GPU matrix; see engine/floatingOrigin.ts).

const TAU = Math.PI * 2;
const DEG2RAD = Math.PI / 180;

function solveEccentricAnomaly(meanAnomaly: number, e: number): number {
  let E = e < 0.8 ? meanAnomaly : Math.PI;
  for (let i = 0; i < 8; i++) {
    const dE = (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E));
    E -= dE;
  }
  return E;
}

export function orbitPositionAt(el: OrbitElements, t: number, out: Vector3): Vector3 {
  const time = STATIC_ORBITS ? 0 : t;
  const n = TAU / el.periodSeconds;
  const M0 = el.initialMeanAnomalyDeg * DEG2RAD;
  let M = (M0 + n * time) % TAU;
  if (M < 0) M += TAU;

  const E = solveEccentricAnomaly(M, el.eccentricity);
  const a = el.semiMajorAxis, e = el.eccentricity;
  const xOrb = a * (Math.cos(E) - e);
  const yOrb = a * Math.sqrt(1 - e * e) * Math.sin(E);

  const w = el.argPeriapsisDeg * DEG2RAD;
  const cw = Math.cos(w), sw = Math.sin(w);
  const xw = xOrb * cw - yOrb * sw;
  const yw = xOrb * sw + yOrb * cw;

  const inc = el.inclinationDeg * DEG2RAD;
  out.set(xw, yw * Math.sin(inc), yw * Math.cos(inc));
  return out;
}

const _a = new Vector3();
const _b = new Vector3();
export function orbitSpeedAt(el: OrbitElements, t: number): number {
  if (STATIC_ORBITS) return 0;
  orbitPositionAt(el, t, _a);
  orbitPositionAt(el, t + 0.5, _b);
  return _a.distanceTo(_b) / 0.5;
}

export function orbitVelocityAt(el: OrbitElements, t: number, out: Vector3): Vector3 {
  if (STATIC_ORBITS) return out.set(0, 0, 0);
  orbitPositionAt(el, t, _a);
  orbitPositionAt(el, t + 0.25, _b);
  return out.subVectors(_b, _a).multiplyScalar(4);
}
