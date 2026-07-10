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
    radiusMin: 110000,
    radiusMax: 260000,
    intensityMin: 1.6,
    intensityMax: 2.6,
    luminosityMin: 0.25,
    luminosityMax: 0.7,
  },
  yellow: {
    type: "yellow",
    color: "#fff2c0",
    coronaColor: "#ffb85a",
    radiusMin: 160000,
    radiusMax: 240000,
    intensityMin: 2.8,
    intensityMax: 3.8,
    luminosityMin: 0.85,
    luminosityMax: 1.25,
  },
  green: {
    type: "green",
    color: "#a8f0c0",
    coronaColor: "#4adf8a",
    radiusMin: 140000,
    radiusMax: 225000,
    intensityMin: 2.4,
    intensityMax: 3.4,
    luminosityMin: 0.7,
    luminosityMax: 1.1,
  },
  blue: {
    type: "blue",
    color: "#a8c8ff",
    coronaColor: "#5a8fff",
    radiusMin: 225000,
    radiusMax: 450000,
    intensityMin: 4.0,
    intensityMax: 6.5,
    luminosityMin: 2.2,
    luminosityMax: 5.5,
  },
};

export const STAR = {
  radius: 200000,
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
