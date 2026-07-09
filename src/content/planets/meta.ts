export type ClimateKind =
  | "scorched"
  | "arid"
  | "oasis"
  | "temperate"
  | "oceanic"
  | "tundra"
  | "ice"
  | "gas_giant";

export interface PlanetMeta {
  climate: ClimateKind;
  // Kelvin-ish game units (not strict SI — tuned for gameplay).
  temperatureK: number;
  // Earth masses (relative).
  massEarth: number;
  // Surface gravity relative to 1g.
  gravityG: number;
  // AU-ish: semiMajorAxis / 48000 (home Cragfall ≈ 1).
  orbitalAu: number;
  density: number;
  hasAtmosphere: boolean;
  habitability: number; // 0..1 soft score
}

export interface PlanetDefWithMeta {
  meta: PlanetMeta;
}
