import { createNoise3D, type NoiseFunction3D } from "simplex-noise";
import type { RngStream } from "../engine/rng";
import type { PlanetDef } from "../content/planets/types";
import type { BiomeId, BiomeColors, TerrainProfile } from "../content/planets/biomes";
import {
  terrainForClimate,
  biomeColorsForClimate,
} from "../content/planets/biomes";
import type { ClimateKind } from "../content/planets/meta";

// Spherical heightfield via 3D simplex. Climate-weighted mountains, cliffs,
// ravines, rock pillars, basins, and cave-mouth pits. Enterable caverns are
// separate SDF meshes (see visuals/planetCaves.ts).

export interface Planet {
  def: PlanetDef;
  radius: number;
  amplitude: number;
  minR: number;
  maxR: number;
  seaLevel: number;
  climate: ClimateKind;
  terrain: TerrainProfile;
  biomeColors: BiomeColors;
  heightAt(nx: number, ny: number, nz: number): number;
  surfaceRadius(nx: number, ny: number, nz: number): number;
  biomeAt(nx: number, ny: number, nz: number): BiomeId;
  /** Soft biome weights for vertex-color blending (sum ≈ 1). */
  biomeWeights(nx: number, ny: number, nz: number): Partial<Record<BiomeId, number>>;
  /** 0..1 cave-mouth field (for props / cave entrances). */
  caveMouthAt(nx: number, ny: number, nz: number): number;
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

function resolveClimate(def: PlanetDef): ClimateKind {
  return def.climate ?? def.meta?.climate ?? "temperate";
}

export function createPlanet(def: PlanetDef, rngWorld: RngStream): Planet {
  const continental = createNoise3D(rngWorld);
  const warp = createNoise3D(rngWorld);
  const mount = createNoise3D(rngWorld);
  const mountMask = createNoise3D(rngWorld);
  const detail = createNoise3D(rngWorld);
  const micro = createNoise3D(rngWorld);
  const ravine = createNoise3D(rngWorld);
  const ravineMask = createNoise3D(rngWorld);
  const basin = createNoise3D(rngWorld);
  const dune = createNoise3D(rngWorld);
  const cliff = createNoise3D(rngWorld);
  const pillar = createNoise3D(rngWorld);
  const cave = createNoise3D(rngWorld);
  const moisture = createNoise3D(rngWorld);
  const tempN = createNoise3D(rngWorld);
  const n = def.noise;

  const climate = resolveClimate(def);
  const terrain = def.terrain ?? terrainForClimate(climate);
  const biomeColors = def.biomes ?? biomeColorsForClimate(climate);
  const T = terrain;

  const caveMouthField = (nx: number, ny: number, nz: number): number => {
    if (T.caveMouthWeight <= 0.01) return 0;
    const c = cave(nx * 2.4, ny * 2.4, nz * 2.4);
    const m = cave(nx * 5.1 + 3.1, ny * 5.1, nz * 5.1);
    return Math.pow(clamp01((-c * 0.5 + 0.22) * (-m * 0.5 + 0.35) * 4.5), 1.8)
      * T.caveMouthWeight;
  };

  const heightAt = (nx: number, ny: number, nz: number): number => {
    const wf = n.warpFreq, wa = n.warpAmount;
    const wx = nx + wa * warp(nx * wf, ny * wf, nz * wf);
    const wy = ny + wa * warp(ny * wf, nz * wf, nx * wf);
    const wz = nz + wa * warp(nz * wf, nx * wf, ny * wf);

    let land = fbm(continental, wx, wy, wz, n.baseFreq, n.baseOctaves, n.baseGain, n.baseLacunarity);
    const land01 = clamp01(land * 0.5 + 0.5);
    land = Math.pow(land01, 1.12) * 2 - 1;

    const basinN = basin(nx * n.baseFreq * 0.42, ny * n.baseFreq * 0.42, nz * n.baseFreq * 0.42);
    const basinCarve = Math.pow(clamp01(-basinN * 0.5 + 0.38), 1.55) * 0.32 * T.basinWeight;

    const mMask = clamp01(
      (mountMask(nx * n.maskFreq, ny * n.maskFreq, nz * n.maskFreq) * 0.5 + 0.5 - 0.2) / 0.52,
    );
    const shelf = clamp01((land + 0.08) / 0.78);
    let mountains = ridged(mount, wx, wy, wz, n.mountainFreq, n.mountainOctaves)
      * mMask * shelf * T.mountainWeight;

    const cliffN = ridged(cliff, wx * 1.35, wy * 1.35, wz * 1.35, n.mountainFreq * 1.6, 4);
    const cliffBand = clamp01((mountains - 0.28) / 0.45) * cliffN;
    mountains += cliffBand * 0.22 * T.cliffWeight;

    const pillarN = ridged(pillar, wx * 2.8, wy * 2.8, wz * 2.8, n.mountainFreq * 2.2, 3);
    const pillars = Math.pow(pillarN, 2.2) * mMask * clamp01(land + 0.1) * 0.28 * T.rockPillarWeight;

    const hills = fbm(detail, wx, wy, wz, n.baseFreq * 2.4, 5, 0.48, 2.12) * 0.28;
    const microN = fbm(micro, wx, wy, wz, n.baseFreq * 6.5, 4, 0.45, 2.2) * 0.08;
    const dunes = ridged(dune, wx, wy, wz, n.baseFreq * 3.8, 3) * 0.07
      * clamp01(0.55 - Math.abs(land)) * T.duneWeight;

    const rMask = clamp01(
      (ravineMask(nx * n.ravineMaskFreq, ny * n.ravineMaskFreq, nz * n.ravineMaskFreq)
        * 0.5 + 0.5 - 0.48) / 0.45,
    );
    const rav = ridged(ravine, wx, wy, wz, n.ravineFreq, 4);
    const ravines = rav * rav * rMask * clamp01(land + 0.35) * T.ravineWeight;

    const caveMouth = caveMouthField(nx, ny, nz);

    let v = land * 0.4 + mountains * 0.42 + hills * 0.26 + microN + dunes + pillars
      - ravines * 0.2 - basinCarve - caveMouth * 0.65;

    if (n.terraceSteps > 1 && v > 0.15) {
      const t = (v - 0.15) / 0.85;
      const steps = n.terraceSteps;
      const stepped = Math.floor(t * steps) / steps;
      const blend = n.terraceBlend;
      v = 0.15 + (t * (1 - blend) + stepped * blend) * 0.85;
    }

    const soft = Math.max(0.55, T.spikeSoftness);
    if (Math.abs(v) > 0.48) {
      const excess = Math.abs(v) - 0.48;
      const sign = v < 0 ? -1 : 1;
      v = sign * (0.48 + excess / (1 + excess * (2.4 + soft * 4)));
    }

    v = Math.max(-0.72, Math.min(0.72, v));
    v = Math.tanh(v * 0.78);
    return v * def.amplitude;
  };

  const softBand = (x: number, lo: number, hi: number) => {
    if (x <= lo || x >= hi) return 0;
    const mid = (lo + hi) * 0.5;
    const half = (hi - lo) * 0.5 || 1;
    return clamp01(1 - Math.abs(x - mid) / half);
  };

  const biomeWeights = (nx: number, ny: number, nz: number): Partial<Record<BiomeId, number>> => {
    const h = heightAt(nx, ny, nz);
    const r = def.radius + h;
    const sea = def.liquid ? def.radius + def.liquid.level : def.radius - def.amplitude;
    let elev = (r - sea) / Math.max(1, def.amplitude);
    const moist = moisture(nx * 1.1, ny * 1.1, nz * 1.1) * 0.5 + 0.5;
    const heat = tempN(nx * 0.7, ny * 0.7, nz * 0.7) * 0.5 + 0.5;
    const lat = Math.abs(ny);
    const warpN = moisture(nx * 2.4, ny * 2.4, nz * 2.4) * 0.07;
    elev += warpN;

    const w: Partial<Record<BiomeId, number>> = {};
    const add = (id: BiomeId, v: number) => {
      if (v <= 0.001) return;
      w[id] = (w[id] ?? 0) + v;
    };

    const mouth = caveMouthField(nx, ny, nz);
    add("cave_mouth", softBand(mouth, 0.35, 1.05) * clamp01((elev - 0.02) / 0.12));

    if (def.liquid?.kind === "lava") {
      add("lava_field", softBand(elev, -0.2, 0.16));
    }
    if (def.liquid) {
      add("ocean", clamp01((-elev - 0.01) / 0.12));
      add("beach", softBand(elev, -0.04, 0.14));
    }

    if (climate === "ice" || (climate === "tundra" && lat > 0.5)) {
      add("snow", softBand(elev, 0.35, 1.2) + lat * 0.35);
      add("ice_sheet", softBand(lat, 0.55, 1.1) * 0.9);
      add("tundra", softBand(elev, -0.05, 0.55) * (1 - lat * 0.4));
    } else if (climate === "scorched") {
      add("rock", softBand(elev, 0.28, 1.1));
      add("ash", (1 - moist) * softBand(elev, -0.05, 0.55));
      add("desert", moist * softBand(elev, -0.05, 0.55));
    } else if (climate === "arid") {
      add("rock", softBand(elev, 0.45, 1.1));
      add("desert", (1 - moist) * softBand(elev, -0.05, 0.7));
      add("scrub", moist * softBand(elev, -0.05, 0.65));
    } else {
      add("snow", softBand(elev, 0.62, 1.2) * (lat * 0.7 + (1 - heat) * 0.5));
      add("alpine", softBand(elev, 0.52, 0.85));
      add("rock", softBand(elev, 0.32, 0.7));
      add("forest", moist * softBand(heat, 0.25, 0.8) * softBand(elev, 0.02, 0.5));
      add("desert", (1 - moist) * softBand(elev, 0.0, 0.45) * 0.85);
      add("scrub", softBand(moist, 0.28, 0.52) * softBand(elev, 0.0, 0.48));
      add("grassland", softBand(moist, 0.35, 0.85) * softBand(elev, 0.0, 0.45));
      if (climate === "tundra") add("tundra", softBand(elev, -0.05, 0.5));
    }

    let sum = 0;
    for (const k of Object.keys(w) as BiomeId[]) sum += w[k] ?? 0;
    if (sum < 1e-4) {
      w.grassland = 1;
      return w;
    }
    for (const k of Object.keys(w) as BiomeId[]) w[k] = (w[k] ?? 0) / sum;
    return w;
  };

  const biomeAt = (nx: number, ny: number, nz: number): BiomeId => {
    const w = biomeWeights(nx, ny, nz);
    let best: BiomeId = "grassland";
    let bestV = -1;
    for (const k of Object.keys(w) as BiomeId[]) {
      const v = w[k] ?? 0;
      if (v > bestV) { bestV = v; best = k; }
    }
    return best;
  };

  const seaLevel = def.liquid
    ? def.radius + def.liquid.level
    : def.radius;

  return {
    def,
    radius: def.radius,
    amplitude: def.amplitude,
    minR: def.radius - def.amplitude * 0.85,
    maxR: def.radius + def.amplitude * 0.85,
    seaLevel,
    climate,
    terrain,
    biomeColors,
    heightAt,
    surfaceRadius: (nx, ny, nz) => def.radius + heightAt(nx, ny, nz),
    biomeAt,
    biomeWeights,
    caveMouthAt: caveMouthField,
  };
}
