// Data shapes for a planet. Planets are pure data — worldgen/visuals read these.
// Adding a planet means one new file + one registry line.

export interface PlanetPalette {
  atmosphere: string; // rim glow / sky tint
  lowland: string;
  mid: string;
  highland: string;
  rock: string; // steep-slope blend
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

// Elliptical (Kepler) orbital elements around the star.
export interface OrbitElements {
  semiMajorAxis: number; // system units
  eccentricity: number; // 0 = circular
  periodSeconds: number;
  inclinationDeg: number;
  argPeriapsisDeg: number;
  initialMeanAnomalyDeg: number;
}

export type LiquidKind = "water" | "lava";

export interface PlanetLiquid {
  kind: LiquidKind;
  // Height offset from planet.radius. Negative fills basins; 0 ≈ mean sea level.
  level: number;
  color: string;
  opacity: number; // 0..1 surface alpha
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
  cloudCoverage: number; // 0..1, 0 disables clouds
  liquid?: PlanetLiquid;
  orbit: OrbitElements;
  hasStation?: boolean;
}
