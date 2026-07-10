import type { PlanetDef } from "./types";
import { DEFAULT_NOISE } from "./base";

// Frost: icy world with frozen-looking water in the basins.
export const FROST: PlanetDef = {
  id: "frost",
  name: "Frost",
  seed: "frost-039",
  climate: "ice",
  radius: 52000,
  faceSegments: 64,
  amplitude: 3200,
  noise: { ...DEFAULT_NOISE, mountainFreq: 1.05, terraceSteps: 5, baseOctaves: 6 },
  palette: {
    atmosphere: "#bcd8ea",
    lowland: "#6f8fa0",
    mid: "#a9c4d2",
    highland: "#d8e6ee",
    rock: "#5a6a76",
    peak: "#ffffff",
  },
  atmosphereThickness: 3600,
  fogNear: 48000,
  fogFar: 230000,
  cloudCoverage: 0.38,
  liquid: {
    kind: "water",
    level: -700,
    color: "#5aa0c4",
    opacity: 0.8,
  },
  orbit: {
    semiMajorAxis: 6250000,
    eccentricity: 0.02,
    periodSeconds: 22000,
    inclinationDeg: 8,
    argPeriapsisDeg: 90,
    initialMeanAnomalyDeg: 260,
  },
};
