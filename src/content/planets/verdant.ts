import type { PlanetDef } from "./types";
import { DEFAULT_NOISE } from "./base";

// Verdant: lush world with deep green seas.
export const VERDANT: PlanetDef = {
  id: "verdant",
  name: "Verdant",
  seed: "verdant-027",
  radius: 840,
  faceSegments: 400,
  amplitude: 110,
  noise: { ...DEFAULT_NOISE, baseFreq: 0.62, mountainFreq: 1.05 },
  palette: {
    atmosphere: "#7bd6a0",
    lowland: "#1f5a3d",
    mid: "#3f8a52",
    highland: "#7bab52",
    rock: "#5a5240",
    peak: "#d8e6b0",
  },
  atmosphereThickness: 100,
  fogNear: 900,
  fogFar: 4800,
  cloudCoverage: 0.62,
  liquid: {
    kind: "water",
    level: -8,
    color: "#146878",
    opacity: 0.84,
  },
  orbit: {
    semiMajorAxis: 82000,
    eccentricity: 0.1,
    periodSeconds: 13200,
    inclinationDeg: 5,
    argPeriapsisDeg: 200,
    initialMeanAnomalyDeg: 30,
  },
};
