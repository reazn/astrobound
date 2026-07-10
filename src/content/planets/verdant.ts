import type { PlanetDef } from "./types";
import { DEFAULT_NOISE } from "./base";

// Verdant: lush world with deep green seas.
export const VERDANT: PlanetDef = {
  id: "verdant",
  name: "Verdant",
  seed: "verdant-027",
  climate: "oasis",
  radius: 42000,
  faceSegments: 64,
  amplitude: 3000,
  noise: { ...DEFAULT_NOISE, baseFreq: 0.58, mountainFreq: 1.0, baseOctaves: 6 },
  palette: {
    atmosphere: "#7bd6a0",
    lowland: "#1f5a3d",
    mid: "#3f8a52",
    highland: "#7bab52",
    rock: "#5a5240",
    peak: "#d8e6b0",
  },
  atmosphereThickness: 4800,
  fogNear: 45000,
  fogFar: 240000,
  cloudCoverage: 0.68,
  liquid: {
    kind: "water",
    level: -640,
    color: "#146878",
    opacity: 0.84,
  },
  orbit: {
    semiMajorAxis: 4100000,
    eccentricity: 0.1,
    periodSeconds: 13200,
    inclinationDeg: 5,
    argPeriapsisDeg: 200,
    initialMeanAnomalyDeg: 30,
  },
};
