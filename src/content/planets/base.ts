import type { PlanetNoise } from "./types";

// Tuned for spherical 3D FBM on large worlds. Frequencies are angular (unit
// sphere); amplitude on PlanetDef sets relief in world units.
export const DEFAULT_NOISE: PlanetNoise = {
  baseFreq: 0.68,
  baseOctaves: 6,
  baseGain: 0.52,
  baseLacunarity: 2.08,
  warpFreq: 0.9,
  warpAmount: 0.28,

  mountainFreq: 1.4,
  mountainOctaves: 6,
  maskFreq: 0.48,

  ravineFreq: 1.25,
  ravineMaskFreq: 0.52,

  terraceSteps: 4,
  terraceBlend: 0.75,
  mottleFreq: 10.0,
};
