import { createNoise3D, type NoiseFunction3D } from "simplex-noise";
import type { RngStream } from "../engine/rng";
import type { PlanetDef } from "../content/planets/types";

// Spherical heightfield via 3D simplex FBM. Stronger continental relief,
// ridged mountain belts, and deep basins (for water/lava).

export interface Planet {
  def: PlanetDef;
  radius: number;
  amplitude: number;
  minR: number;
  maxR: number;
  seaLevel: number; // absolute radius of liquid surface (or radius if none)
  heightAt(nx: number, ny: number, nz: number): number;
  surfaceRadius(nx: number, ny: number, nz: number): number;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function ridged(
  noise: NoiseFunction3D, x: number, y: number, z: number,
  freq: number, octaves: number,
): number {
  let sum = 0, amp = 0.5, f = freq, weight = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(noise(x * f, y * f, z * f));
    n *= n;
    n *= weight;
    weight = clamp01(n * 2);
    sum += n * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.15;
  }
  return sum / norm;
}

function fbm(
  noise: NoiseFunction3D, x: number, y: number, z: number,
  freq: number, octaves: number, gain: number, lac: number,
): number {
  let amp = 1, f = freq, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * f, y * f, z * f);
    norm += amp;
    amp *= gain;
    f *= lac;
  }
  return sum / norm;
}

export function createPlanet(def: PlanetDef, rngWorld: RngStream): Planet {
  const continental = createNoise3D(rngWorld);
  const warp = createNoise3D(rngWorld);
  const mount = createNoise3D(rngWorld);
  const mountMask = createNoise3D(rngWorld);
  const detail = createNoise3D(rngWorld);
  const ravine = createNoise3D(rngWorld);
  const ravineMask = createNoise3D(rngWorld);
  const basin = createNoise3D(rngWorld);
  const n = def.noise;

  const heightAt = (nx: number, ny: number, nz: number): number => {
    const wf = n.warpFreq, wa = n.warpAmount;
    const wx = nx + wa * warp(nx * wf, ny * wf, nz * wf);
    const wy = ny + wa * warp(ny * wf, nz * wf, nx * wf);
    const wz = nz + wa * warp(nz * wf, nx * wf, ny * wf);

    // Broad continents — keep lows deep so basins can flood.
    let land = fbm(continental, wx, wy, wz, n.baseFreq, n.baseOctaves, n.baseGain, n.baseLacunarity);
    const land01 = clamp01(land * 0.5 + 0.5);
    // Mild peak sharpening; don't crush valleys.
    land = Math.pow(land01, 1.15) * 2 - 1;

    // Low-frequency basins carve deep lows for lakes / seas.
    const basinN = basin(nx * n.baseFreq * 0.45, ny * n.baseFreq * 0.45, nz * n.baseFreq * 0.45);
    const basinCarve = Math.pow(clamp01(-basinN * 0.5 + 0.35), 1.6) * 0.55;

    const mMask = clamp01(
      (mountMask(nx * n.maskFreq, ny * n.maskFreq, nz * n.maskFreq) * 0.5 + 0.5 - 0.22) / 0.5,
    );
    const shelf = clamp01((land + 0.05) / 0.75);
    const mountains = ridged(mount, wx, wy, wz, n.mountainFreq, n.mountainOctaves)
      * mMask * shelf;

    const hills = fbm(detail, wx, wy, wz, n.baseFreq * 2.2, 4, 0.48, 2.1) * 0.4;

    const rMask = clamp01(
      (ravineMask(nx * n.ravineMaskFreq, ny * n.ravineMaskFreq, nz * n.ravineMaskFreq)
        * 0.5 + 0.5 - 0.48) / 0.45,
    );
    const rav = ridged(ravine, wx, wy, wz, n.ravineFreq, 3);
    const ravines = rav * rav * rMask * clamp01(land + 0.35);

    let v = land * 0.5 + mountains * 0.72 + hills * 0.32 - ravines * 0.28 - basinCarve;
    v = Math.max(-1.15, Math.min(1.15, v));
    v = Math.tanh(v * 0.95);
    return v * def.amplitude;
  };

  const seaLevel = def.liquid
    ? def.radius + def.liquid.level
    : def.radius;

  return {
    def,
    radius: def.radius,
    amplitude: def.amplitude,
    minR: def.radius - def.amplitude * 1.15,
    maxR: def.radius + def.amplitude * 1.15,
    seaLevel,
    heightAt,
    surfaceRadius: (nx, ny, nz) => def.radius + heightAt(nx, ny, nz),
  };
}
