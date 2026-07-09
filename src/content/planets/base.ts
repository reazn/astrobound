import type { PlanetNoise } from "./types";

// Tuned for spherical 3D FBM: continents, distinct mountain belts, deep basins
// for liquids, walkable hills. faceSegments drives near-surface LOD density.
export const DEFAULT_NOISE: PlanetNoise = {
  baseFreq: 0.72,
  baseOctaves: 5,
  baseGain: 0.52,
  baseLacunarity: 2.05,
  warpFreq: 0.85,
  warpAmount: 0.24,

  mountainFreq: 1.35,
  mountainOctaves: 5,
  maskFreq: 0.5,

  ravineFreq: 1.15,
  ravineMaskFreq: 0.5,

  terraceSteps: 3,
  terraceBlend: 0.8,
  mottleFreq: 8.0,
};
