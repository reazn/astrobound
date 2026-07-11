import type { PlanetDef } from "./types";
import { DEFAULT_NOISE } from "./base";

// Home planet: teal lowlands, warm stone crags, lakes in the basins.
export const CRAGFALL: PlanetDef = {
  id: "cragfall",
  name: "Cragfall",
  seed: "cragfall-001",
  radius: 560,
  faceSegments: 380,
  amplitude: 118,
  noise: DEFAULT_NOISE,
  palette: {
    atmosphere: "#6fa8d6",
    lowland: "#2f6d63",
    mid: "#5f8f52",
    highland: "#a88b63",
    rock: "#6a6560",
    peak: "#e4dcc6",
  },
  atmosphereThickness: 90,
  fogNear: 800,
  fogFar: 4200,
  cloudCoverage: 0.52,
  liquid: {
    kind: "water",
    level: -10,
    color: "#1e6f92",
    opacity: 0.82,
  },
  orbit: {
    semiMajorAxis: 48000,
    eccentricity: 0.05,
    periodSeconds: 7200,
    inclinationDeg: 0,
    argPeriapsisDeg: 0,
    initialMeanAnomalyDeg: 0,
  },
  hasStation: true,
};
