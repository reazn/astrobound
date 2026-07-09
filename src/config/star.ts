// Star spectral classes drive system climate. Green is a game-fantasy class
// (not astrophysical) used to bias verdant / oasis worlds.

export type StarType = "red" | "yellow" | "green" | "blue";

export interface StarDef {
  type: StarType;
  name: string;
  radius: number;
  color: string;
  coronaColor: string;
  lightIntensity: number;
  // Relative luminosity used for planet equilibrium temperature.
  luminosity: number;
}

export const STAR_TYPE_PRESETS: Record<StarType, Omit<StarDef, "name" | "radius" | "lightIntensity" | "luminosity"> & {
  radiusMin: number;
  radiusMax: number;
  intensityMin: number;
  intensityMax: number;
  luminosityMin: number;
  luminosityMax: number;
}> = {
  red: {
    type: "red",
    color: "#ff6b4a",
    coronaColor: "#ff3a1a",
    radiusMin: 2200,
    radiusMax: 5200,
    intensityMin: 1.6,
    intensityMax: 2.6,
    luminosityMin: 0.25,
    luminosityMax: 0.7,
  },
  yellow: {
    type: "yellow",
    color: "#fff2c0",
    coronaColor: "#ffb85a",
    radiusMin: 3200,
    radiusMax: 4800,
    intensityMin: 2.8,
    intensityMax: 3.8,
    luminosityMin: 0.85,
    luminosityMax: 1.25,
  },
  green: {
    type: "green",
    color: "#a8f0c0",
    coronaColor: "#4adf8a",
    radiusMin: 2800,
    radiusMax: 4500,
    intensityMin: 2.4,
    intensityMax: 3.4,
    luminosityMin: 0.7,
    luminosityMax: 1.1,
  },
  blue: {
    type: "blue",
    color: "#a8c8ff",
    coronaColor: "#5a8fff",
    radiusMin: 4500,
    radiusMax: 9000,
    intensityMin: 4.0,
    intensityMax: 6.5,
    luminosityMin: 2.2,
    luminosityMax: 5.5,
  },
};

// Home-system defaults (Sol-analogue yellow).
export const STAR = {
  radius: 4000,
  color: "#fff2c0",
  lightIntensity: 3.4,
  coronaColor: "#ffb85a",
} as const;

export function starDefFromHome(): StarDef {
  return {
    type: "yellow",
    name: "Solara",
    radius: STAR.radius,
    color: STAR.color,
    coronaColor: STAR.coronaColor,
    lightIntensity: STAR.lightIntensity,
    luminosity: 1,
  };
}
