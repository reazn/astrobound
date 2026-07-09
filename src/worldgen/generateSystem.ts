import type { RngStream } from "../engine/rng";
import { createRng, rngRange, rngInt, rngPick } from "../engine/rng";
import {
  STAR_TYPE_PRESETS, type StarDef, type StarType,
} from "../config/star";
import { DEFAULT_NOISE } from "../content/planets/base";
import type {
  PlanetDef, PlanetLiquid, PlanetNoise, PlanetPalette, PlanetRingBand,
  OrbitElements,
} from "../content/planets/types";
import type { ClimateKind, PlanetMeta } from "../content/planets/meta";

// Procedural star system: star type → climate weights → 1–10 spaced planets
// with temperature/mass metadata. Orbits never overlap (SMA + padding).

export interface StarSystemDef {
  id: string;
  seed: string;
  name: string;
  star: StarDef;
  planets: PlanetDef[];
  handcrafted: boolean;
}

const ORBIT = {
  smaMin: 18000,
  smaMax: 220000,
  eccMin: 0.01,
  eccMax: 0.14,
  incMax: 12,
  // Minimum gap between successive orbit envelopes (outer of inner + pad).
  padMin: 7000,
  padMax: 18000,
  periodScale: 0.00055, // period ≈ scale * sma^1.5
};

const NAME_A = [
  "Astra", "Vela", "Nyx", "Orion", "Kepler", "Helios", "Lyra", "Nova",
  "Cinder", "Frost", "Mirage", "Echo", "Quasar", "Rift", "Solace",
];
const NAME_B = [
  "Prime", "Minor", "Major", "Reach", "Drift", "Haven", "Expanse", "Gate",
  "Crown", "Well", "Spire", "Basin", "Rim", "Core", "Veil",
];

function climateWeights(star: StarType): Record<ClimateKind, number> {
  switch (star) {
    case "red":
      return {
        scorched: 0.08, arid: 0.18, oasis: 0.08, temperate: 0.1,
        oceanic: 0.08, tundra: 0.18, ice: 0.22, gas_giant: 0.08,
      };
    case "yellow":
      return {
        scorched: 0.1, arid: 0.12, oasis: 0.14, temperate: 0.22,
        oceanic: 0.14, tundra: 0.1, ice: 0.1, gas_giant: 0.08,
      };
    case "green":
      return {
        scorched: 0.05, arid: 0.08, oasis: 0.28, temperate: 0.25,
        oceanic: 0.18, tundra: 0.06, ice: 0.05, gas_giant: 0.05,
      };
    case "blue":
      return {
        scorched: 0.22, arid: 0.14, oasis: 0.06, temperate: 0.08,
        oceanic: 0.08, tundra: 0.1, ice: 0.14, gas_giant: 0.18,
      };
  }
}

function pickWeighted<T extends string>(
  rng: RngStream,
  weights: Record<T, number>,
): T {
  const keys = Object.keys(weights) as T[];
  let sum = 0;
  for (const k of keys) sum += weights[k];
  let roll = rng() * sum;
  for (const k of keys) {
    roll -= weights[k];
    if (roll <= 0) return k;
  }
  return keys[keys.length - 1];
}

function climateFromTemp(tempK: number, star: StarType, rng: RngStream): ClimateKind {
  // Soft bands with star-type bias for mid-range worlds.
  if (tempK > 520) return rng() < 0.55 ? "scorched" : "arid";
  if (tempK > 380) return rng() < 0.5 ? "arid" : "oasis";
  if (tempK > 280) {
    if (star === "green") return rng() < 0.55 ? "oasis" : "temperate";
    return pickWeighted(rng, {
      oasis: 0.25, temperate: 0.4, oceanic: 0.25, arid: 0.1,
    } as Record<ClimateKind, number>);
  }
  if (tempK > 200) return rng() < 0.45 ? "tundra" : "oceanic";
  if (tempK > 120) return rng() < 0.55 ? "ice" : "tundra";
  return "ice";
}

function paletteFor(climate: ClimateKind, rng: RngStream): PlanetPalette {
  const jitter = (hex: string) => {
    // Tiny HSL-ish nudge via channel noise (keeps hex-ish look).
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, ((n >> 16) & 255) + rngInt(rng, -12, 12)));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + rngInt(rng, -12, 12)));
    const b = Math.min(255, Math.max(0, (n & 255) + rngInt(rng, -12, 12)));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  };
  const base: Record<ClimateKind, PlanetPalette> = {
    scorched: {
      atmosphere: "#e08a55", lowland: "#6b3a2a", mid: "#9a5636",
      highland: "#c47a3e", rock: "#4a2c22", peak: "#f0b878",
    },
    arid: {
      atmosphere: "#d4b48a", lowland: "#8a6a3a", mid: "#b89050",
      highland: "#c8a868", rock: "#6a5040", peak: "#e8d8a8",
    },
    oasis: {
      atmosphere: "#7bd6a0", lowland: "#1f5a3d", mid: "#3f8a52",
      highland: "#7bab52", rock: "#5a5240", peak: "#d8e6b0",
    },
    temperate: {
      atmosphere: "#6fa8d6", lowland: "#2f6d63", mid: "#5f8f52",
      highland: "#a88b63", rock: "#6a6560", peak: "#e4dcc6",
    },
    oceanic: {
      atmosphere: "#5aa0c8", lowland: "#1a4a5a", mid: "#2a6a7a",
      highland: "#4a8a7a", rock: "#4a5560", peak: "#c8dce8",
    },
    tundra: {
      atmosphere: "#9ab0c0", lowland: "#5a6a70", mid: "#7a8a90",
      highland: "#a0b0b8", rock: "#5a6068", peak: "#e8f0f4",
    },
    ice: {
      atmosphere: "#bcd8ea", lowland: "#6f8fa0", mid: "#a9c4d2",
      highland: "#d8e6ee", rock: "#5a6a76", peak: "#ffffff",
    },
    gas_giant: {
      atmosphere: "#e8c89a", lowland: "#c4a06a", mid: "#d4b078",
      highland: "#e0c490", rock: "#9a7a52", peak: "#f2e0b8",
    },
  };
  const p = base[climate];
  return {
    atmosphere: jitter(p.atmosphere),
    lowland: jitter(p.lowland),
    mid: jitter(p.mid),
    highland: jitter(p.highland),
    rock: jitter(p.rock),
    peak: jitter(p.peak),
  };
}

function noiseFor(climate: ClimateKind, rng: RngStream): PlanetNoise {
  const n = { ...DEFAULT_NOISE };
  if (climate === "scorched" || climate === "arid") {
    n.mountainFreq = rngRange(rng, 1.2, 1.6);
    n.maskFreq = rngRange(rng, 0.4, 0.7);
  } else if (climate === "ice" || climate === "tundra") {
    n.mountainFreq = rngRange(rng, 0.9, 1.2);
    n.terraceSteps = rngInt(rng, 2, 5);
  } else if (climate === "gas_giant") {
    n.baseFreq = rngRange(rng, 0.4, 0.55);
    n.mountainFreq = rngRange(rng, 0.6, 0.9);
    n.terraceSteps = 2;
  } else if (climate === "oceanic") {
    n.baseFreq = rngRange(rng, 0.55, 0.7);
  }
  return n;
}

function liquidFor(climate: ClimateKind, rng: RngStream): PlanetLiquid | undefined {
  if (climate === "scorched") {
    return rng() < 0.7
      ? { kind: "lava", level: rngRange(rng, -14, -4), color: "#ff6a1a", opacity: 0.9 }
      : undefined;
  }
  if (climate === "arid") {
    return rng() < 0.25
      ? { kind: "water", level: rngRange(rng, -20, -10), color: "#2a6a7a", opacity: 0.7 }
      : undefined;
  }
  if (climate === "gas_giant") return undefined;
  if (climate === "ice") {
    return {
      kind: "water", level: rngRange(rng, -12, -4), color: "#5aa0c4", opacity: 0.78,
    };
  }
  if (climate === "oceanic") {
    return {
      kind: "water", level: rngRange(rng, -4, 4), color: "#146878", opacity: 0.86,
    };
  }
  return {
    kind: "water",
    level: rngRange(rng, -12, -4),
    color: climate === "oasis" ? "#146878" : "#1e6f92",
    opacity: 0.82,
  };
}

function ringsFor(climate: ClimateKind, rng: RngStream): readonly PlanetRingBand[] | undefined {
  if (climate !== "gas_giant" && rng() > 0.08) return undefined;
  if (climate !== "gas_giant" && rng() > 0.5) return undefined;
  const tint = climate === "ice" ? "#c8dce8" : "#d8c4a0";
  return [
    { innerScale: 1.35, outerScale: 1.55, color: tint, opacity: 0.5 },
    { innerScale: 1.62, outerScale: 1.95, color: tint, opacity: 0.65 },
    { innerScale: 2.05, outerScale: 2.4, color: tint, opacity: 0.4 },
  ];
}

function radiusFor(climate: ClimateKind, rng: RngStream): number {
  if (climate === "gas_giant") return rngRange(rng, 1100, 1900);
  if (climate === "ice" || climate === "oceanic") return rngRange(rng, 420, 1100);
  return rngRange(rng, 220, 900);
}

function generateStar(rng: RngStream): StarDef {
  const type = rngPick(rng, ["red", "yellow", "green", "blue"] as const);
  const p = STAR_TYPE_PRESETS[type];
  return {
    type,
    name: `${rngPick(rng, NAME_A)} ${type[0].toUpperCase()}${type.slice(1)}`,
    radius: rngRange(rng, p.radiusMin, p.radiusMax),
    color: p.color,
    coronaColor: p.coronaColor,
    lightIntensity: rngRange(rng, p.intensityMin, p.intensityMax),
    luminosity: rngRange(rng, p.luminosityMin, p.luminosityMax),
  };
}

function keplerPeriod(sma: number): number {
  return Math.max(2400, ORBIT.periodScale * Math.pow(sma, 1.5));
}

function planetName(rng: RngStream, index: number): string {
  return `${rngPick(rng, NAME_A)}-${rngPick(rng, NAME_B)} ${index + 1}`;
}

function buildPlanet(
  seed: string,
  index: number,
  star: StarDef,
  sma: number,
  forcedClimate: ClimateKind | null,
  rng: RngStream,
): PlanetDef {
  const ecc = rngRange(rng, ORBIT.eccMin, ORBIT.eccMax);
  // Equilibrium temp ~ L^0.25 / sqrt(a). Tuned so home-ish SMA @ L=1 ≈ 290K.
  const au = sma / 48000;
  const tempK = 290 * Math.pow(star.luminosity, 0.25) / Math.sqrt(Math.max(0.15, au));

  let climate = forcedClimate ?? climateFromTemp(tempK, star.type, rng);
  // Outer slots bias toward ice / gas giants.
  if (!forcedClimate && index >= 5 && rng() < 0.35) {
    climate = rng() < 0.55 ? "ice" : "gas_giant";
  }
  // Inner slots bias hot under blue/yellow.
  if (!forcedClimate && index === 0 && (star.type === "blue" || star.type === "yellow")) {
    if (rng() < 0.55) climate = rng() < 0.5 ? "scorched" : "arid";
  }

  const radius = radiusFor(climate, rng);
  const amplitude = climate === "gas_giant"
    ? rngRange(rng, 40, 80)
    : rngRange(rng, 70, 140);
  const density = climate === "gas_giant"
    ? rngRange(rng, 0.15, 0.45)
    : rngRange(rng, 0.7, 1.4);
  const massEarth = density * Math.pow(radius / 560, 3);
  const gravityG = Math.max(0.15, Math.min(2.8, massEarth / Math.pow(radius / 560, 2)));
  const hasAtmo = climate !== "scorched" || rng() < 0.4;
  const habitability = (() => {
    if (climate === "temperate" || climate === "oasis") return rngRange(rng, 0.55, 0.95);
    if (climate === "oceanic") return rngRange(rng, 0.35, 0.7);
    if (climate === "tundra" || climate === "arid") return rngRange(rng, 0.1, 0.35);
    return rngRange(rng, 0, 0.12);
  })();

  const meta: PlanetMeta = {
    climate,
    temperatureK: tempK,
    massEarth,
    gravityG,
    orbitalAu: au,
    density,
    hasAtmosphere: hasAtmo,
    habitability,
  };

  const orbit: OrbitElements = {
    semiMajorAxis: sma,
    eccentricity: ecc,
    periodSeconds: keplerPeriod(sma),
    inclinationDeg: rngRange(rng, 0, ORBIT.incMax) * (rng() < 0.5 ? 1 : -1),
    argPeriapsisDeg: rngRange(rng, 0, 360),
    initialMeanAnomalyDeg: rngRange(rng, 0, 360),
  };

  const atmoThick = hasAtmo
    ? (climate === "gas_giant" ? rngRange(rng, 120, 200) : rngRange(rng, 45, 110))
    : rngRange(rng, 15, 40);

  return {
    id: `${seed}-p${index}`,
    name: planetName(rng, index),
    seed: `${seed}-planet-${index}`,
    radius,
    faceSegments: climate === "gas_giant" ? 400 : rngInt(rng, 340, 400),
    amplitude,
    noise: noiseFor(climate, rng),
    palette: paletteFor(climate, rng),
    atmosphereThickness: atmoThick,
    fogNear: radius * 1.2,
    fogFar: radius * 6,
    cloudCoverage: climate === "scorched" || climate === "arid"
      ? rngRange(rng, 0, 0.2)
      : climate === "gas_giant"
        ? rngRange(rng, 0.55, 0.9)
        : rngRange(rng, 0.25, 0.7),
    liquid: liquidFor(climate, rng),
    rings: ringsFor(climate, rng),
    orbit,
    meta,
  };
}

export function generateStarSystem(seed: string): StarSystemDef {
  const rng = createRng(seed).world;
  const star = generateStar(rng);
  const count = rngInt(rng, 1, 10);
  const weights = climateWeights(star.type);

  const planets: PlanetDef[] = [];
  // First orbit clears the star corona + a buffer.
  let prevOuter = Math.max(ORBIT.smaMin, star.radius * 5.5);

  for (let i = 0; i < count; i++) {
    const pad = rngRange(rng, ORBIT.padMin, ORBIT.padMax);
    // Estimate radius before full build for spacing (use climate guess).
    const guessClimate = pickWeighted(rng, weights);
    const guessR = radiusFor(guessClimate, rng) * 1.2;
    let sma = prevOuter + pad + guessR;
    if (sma > ORBIT.smaMax) break;

    const forced = i === 0 || i === count - 1 ? null : null;
    const def = buildPlanet(seed, i, star, sma, forced, rng);
    // Recompute envelope with real radius + ecc.
    const maxR = def.radius + def.amplitude * 1.15;
    // If guess undershot, push SMA out once.
    if (def.orbit.semiMajorAxis < prevOuter + pad + maxR) {
      sma = prevOuter + pad + maxR;
      def.orbit.semiMajorAxis = sma;
      def.orbit.periodSeconds = keplerPeriod(sma);
      if (def.meta) def.meta.orbitalAu = sma / 48000;
    }
    prevOuter = def.orbit.semiMajorAxis * (1 + def.orbit.eccentricity) + maxR;
    planets.push(def);
  }

  // Ensure at least one planet.
  if (planets.length === 0) {
    planets.push(buildPlanet(seed, 0, star, ORBIT.smaMin * 1.4, "temperate", rng));
  }

  return {
    id: seed,
    seed,
    name: `${star.name} System`,
    star,
    planets,
    handcrafted: false,
  };
}

export function randomSystemSeed(rng: RngStream): string {
  return `sys-${rngInt(rng, 100000, 999999)}-${rngInt(rng, 1000, 9999)}`;
}
