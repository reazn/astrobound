import type { PlanetDef } from "./types";
import { DEFAULT_NOISE } from "./base";

// Ember: hot rock world with lava pools in the lows. No clouds.
export const EMBER: PlanetDef = {
  id: "ember",
  name: "Ember",
  seed: "ember-014",
  radius: 13000,
  faceSegments: 64,
  amplitude: 4200,
  noise: { ...DEFAULT_NOISE, mountainFreq: 1.55, maskFreq: 0.58, baseFreq: 0.78 },
  palette: {
    atmosphere: "#e08a55",
    lowland: "#6b3a2a",
    mid: "#9a5636",
    highland: "#c47a3e",
    rock: "#4a2c22",
    peak: "#f0b878",
  },
  atmosphereThickness: 2400,
  fogNear: 28000,
  fogFar: 150000,
  cloudCoverage: 0,
  liquid: {
    kind: "lava",
    level: -360,
    color: "#ff6a1a",
    opacity: 0.9,
  },
  orbit: {
    semiMajorAxis: 1500000,
    eccentricity: 0.15,
    periodSeconds: 4800,
    inclinationDeg: 3,
    argPeriapsisDeg: 40,
    initialMeanAnomalyDeg: 140,
  },
};
