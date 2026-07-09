import type { PlanetDef } from "./types";
import { DEFAULT_NOISE } from "./base";

// Frost: icy world with frozen-looking water in the basins.
export const FROST: PlanetDef = {
  id: "frost",
  name: "Frost",
  seed: "frost-039",
  radius: 1040,
  faceSegments: 400,
  amplitude: 130,
  noise: { ...DEFAULT_NOISE, mountainFreq: 1.1, terraceSteps: 4 },
  palette: {
    atmosphere: "#bcd8ea",
    lowland: "#6f8fa0",
    mid: "#a9c4d2",
    highland: "#d8e6ee",
    rock: "#5a6a76",
    peak: "#ffffff",
  },
  atmosphereThickness: 75,
  fogNear: 900,
  fogFar: 4500,
  cloudCoverage: 0.3,
  liquid: {
    kind: "water",
    level: -10,
    color: "#5aa0c4",
    opacity: 0.8,
  },
  orbit: {
    semiMajorAxis: 125000,
    eccentricity: 0.02,
    periodSeconds: 22000,
    inclinationDeg: 8,
    argPeriapsisDeg: 90,
    initialMeanAnomalyDeg: 260,
  },
};
