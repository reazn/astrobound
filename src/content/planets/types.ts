import type { ClimateKind, PlanetMeta } from "./meta";
import type { BiomeColors, TerrainProfile } from "./biomes";

export interface PlanetPalette {
  atmosphere: string;
  lowland: string;
  mid: string;
  highland: string;
  rock: string;
  peak: string;
}

export interface PlanetNoise {
  baseFreq: number;
  baseOctaves: number;
  baseGain: number;
  baseLacunarity: number;
  warpFreq: number;
  warpAmount: number;
  mountainFreq: number;
  mountainOctaves: number;
  maskFreq: number;
  ravineFreq: number;
  ravineMaskFreq: number;
  terraceSteps: number;
  terraceBlend: number;
  mottleFreq: number;
}

export interface OrbitElements {
  semiMajorAxis: number;
  eccentricity: number;
  periodSeconds: number;
  inclinationDeg: number;
  argPeriapsisDeg: number;
  initialMeanAnomalyDeg: number;
}

export type LiquidKind = "water" | "lava";

export interface PlanetLiquid {
  kind: LiquidKind;
  level: number;
  color: string;
  opacity: number;
}

export interface PlanetRingBand {
  innerScale: number;
  outerScale: number;
  color: string;
  opacity: number;
}

export interface PlanetDef {
  id: string;
  name: string;
  seed: string;
  radius: number;
  faceSegments: number;
  amplitude: number;
  noise: PlanetNoise;
  palette: PlanetPalette;
  atmosphereThickness: number;
  fogNear: number;
  fogFar: number;
  cloudCoverage: number;
  liquid?: PlanetLiquid;
  rings?: readonly PlanetRingBand[];
  orbit: OrbitElements;
  hasStation?: boolean;
  meta?: PlanetMeta;
  terrain?: TerrainProfile;
  biomes?: BiomeColors;
  climate?: ClimateKind;
}

export type { BiomeColors, TerrainProfile, ClimateKind };
