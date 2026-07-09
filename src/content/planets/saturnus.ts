import type { PlanetDef } from "./types";
import { DEFAULT_NOISE } from "./base";

// Saturn-analogue: large gas-giant scale world with broad striped rings.
export const SATURNUS: PlanetDef = {
  id: "saturnus",
  name: "Saturnus",
  seed: "saturnus-001",
  radius: 1680,
  faceSegments: 420,
  amplitude: 55,
  noise: {
    ...DEFAULT_NOISE,
    baseFreq: 0.48,
    mountainFreq: 0.75,
    terraceSteps: 2,
    maskFreq: 0.35,
  },
  palette: {
    atmosphere: "#e8c89a",
    lowland: "#c4a06a",
    mid: "#d4b078",
    highland: "#e0c490",
    rock: "#9a7a52",
    peak: "#f2e0b8",
  },
  atmosphereThickness: 160,
  fogNear: 1200,
  fogFar: 7000,
  cloudCoverage: 0.75,
  rings: [
    { innerScale: 1.35, outerScale: 1.55, color: "#d8c4a0", opacity: 0.55 },
    { innerScale: 1.62, outerScale: 1.95, color: "#c8b090", opacity: 0.72 },
    { innerScale: 2.05, outerScale: 2.45, color: "#b89870", opacity: 0.48 },
    { innerScale: 2.55, outerScale: 2.85, color: "#e0d0b0", opacity: 0.35 },
  ],
  orbit: {
    semiMajorAxis: 165000,
    eccentricity: 0.04,
    periodSeconds: 28000,
    inclinationDeg: 4,
    argPeriapsisDeg: 140,
    initialMeanAnomalyDeg: 80,
  },
};
