import type { PlanetDef } from "./types";
import { DEFAULT_NOISE } from "./base";

// Ember: hot rock world with lava pools in the lows. No clouds.
export const EMBER: PlanetDef = {
  id: "ember",
  name: "Ember",
  seed: "ember-014",
  radius: 260,
  faceSegments: 360,
  amplitude: 95,
  noise: { ...DEFAULT_NOISE, mountainFreq: 1.45, maskFreq: 0.55 },
  palette: {
    atmosphere: "#e08a55",
    lowland: "#6b3a2a",
    mid: "#9a5636",
    highland: "#c47a3e",
    rock: "#4a2c22",
    peak: "#f0b878",
  },
  atmosphereThickness: 55,
  fogNear: 700,
  fogFar: 3600,
  cloudCoverage: 0,
  liquid: {
    kind: "lava",
    level: -8,
    color: "#ff6a1a",
    opacity: 0.9,
  },
  orbit: {
    semiMajorAxis: 30000,
    eccentricity: 0.15,
    periodSeconds: 4800,
    inclinationDeg: 3,
    argPeriapsisDeg: 40,
    initialMeanAnomalyDeg: 140,
  },
};
