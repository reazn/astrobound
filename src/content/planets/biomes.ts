import type { ClimateKind } from "./meta";

// Surface biome IDs for coloring + future props/life spawn weights.
// Enterable caverns live in visuals/planetCaves.ts; `cave_mouth` marks pits.

export type BiomeId =
  | "ocean"
  | "beach"
  | "grassland"
  | "forest"
  | "desert"
  | "scrub"
  | "rock"
  | "alpine"
  | "snow"
  | "tundra"
  | "ice_sheet"
  | "lava_field"
  | "ash"
  | "cave_mouth";

export interface BiomeColors {
  ocean: string;
  beach: string;
  grassland: string;
  forest: string;
  desert: string;
  scrub: string;
  rock: string;
  alpine: string;
  snow: string;
  tundra: string;
  ice_sheet: string;
  lava_field: string;
  ash: string;
  cave_mouth: string;
}

/** How strongly each landform appears. 0 = off, 1 = default, >1 = exaggerated. */
export interface TerrainProfile {
  mountainWeight: number;
  ravineWeight: number;
  cliffWeight: number;
  rockPillarWeight: number;
  basinWeight: number;
  duneWeight: number;
  caveMouthWeight: number;
  /** Soft-clamp needle peaks that read as mesh glitches (0..1, higher = flatter caps). */
  spikeSoftness: number;
}

export const DEFAULT_TERRAIN: TerrainProfile = {
  mountainWeight: 1,
  ravineWeight: 1,
  cliffWeight: 1,
  rockPillarWeight: 0.65,
  basinWeight: 1,
  duneWeight: 0.5,
  caveMouthWeight: 0.55,
  spikeSoftness: 0.55,
};

export const terrainForClimate = (climate: ClimateKind): TerrainProfile => {
  switch (climate) {
    case "scorched":
      return {
        mountainWeight: 1.15,
        ravineWeight: 0.7,
        cliffWeight: 1.35,
        rockPillarWeight: 1.1,
        basinWeight: 0.85,
        duneWeight: 0.2,
        caveMouthWeight: 0.85,
        spikeSoftness: 0.62,
      };
    case "arid":
      return {
        mountainWeight: 0.85,
        ravineWeight: 0.9,
        cliffWeight: 0.9,
        rockPillarWeight: 0.5,
        basinWeight: 1.1,
        duneWeight: 1.4,
        caveMouthWeight: 0.55,
        spikeSoftness: 0.5,
      };
    case "oasis":
      return {
        mountainWeight: 0.75,
        ravineWeight: 0.85,
        cliffWeight: 0.7,
        rockPillarWeight: 0.35,
        basinWeight: 1.2,
        duneWeight: 0.25,
        caveMouthWeight: 0.5,
        spikeSoftness: 0.48,
      };
    case "temperate":
      return { ...DEFAULT_TERRAIN };
    case "oceanic":
      return {
        mountainWeight: 0.55,
        ravineWeight: 0.5,
        cliffWeight: 0.6,
        rockPillarWeight: 0.25,
        basinWeight: 1.35,
        duneWeight: 0.15,
        caveMouthWeight: 0.35,
        spikeSoftness: 0.45,
      };
    case "tundra":
      return {
        mountainWeight: 0.95,
        ravineWeight: 0.75,
        cliffWeight: 1.05,
        rockPillarWeight: 0.55,
        basinWeight: 0.9,
        duneWeight: 0.1,
        caveMouthWeight: 0.55,
        spikeSoftness: 0.58,
      };
    case "ice":
      return {
        mountainWeight: 1.05,
        ravineWeight: 0.55,
        cliffWeight: 1.2,
        rockPillarWeight: 0.4,
        basinWeight: 0.7,
        duneWeight: 0.05,
        caveMouthWeight: 0.5,
        spikeSoftness: 0.65,
      };
    case "gas_giant":
      return {
        mountainWeight: 0.25,
        ravineWeight: 0.1,
        cliffWeight: 0.15,
        rockPillarWeight: 0,
        basinWeight: 0.4,
        duneWeight: 0.8,
        caveMouthWeight: 0,
        spikeSoftness: 0.75,
      };
  }
};

export const biomeColorsForClimate = (climate: ClimateKind): BiomeColors => {
  switch (climate) {
    case "scorched":
      return {
        ocean: "#4a1810", beach: "#8a4a28", grassland: "#6b3a2a", forest: "#5a3020",
        desert: "#9a5636", scrub: "#7a4530", rock: "#4a2c22", alpine: "#8a6040",
        snow: "#f0b878", tundra: "#6b4a3a", ice_sheet: "#e8c8a0",
        lava_field: "#ff4a12", ash: "#3a2a28", cave_mouth: "#1a0c08",
      };
    case "arid":
      return {
        ocean: "#2a5a6a", beach: "#c8b070", grassland: "#8a9a50", forest: "#5a7040",
        desert: "#c4a060", scrub: "#a88850", rock: "#6a5040", alpine: "#b09070",
        snow: "#e8d8a8", tundra: "#9a8a70", ice_sheet: "#d8d0c0",
        lava_field: "#a04020", ash: "#5a4a40", cave_mouth: "#2a2018",
      };
    case "oasis":
      return {
        ocean: "#146878", beach: "#c8c070", grassland: "#3f8a52", forest: "#1f5a3d",
        desert: "#a89050", scrub: "#6a8a40", rock: "#5a5240", alpine: "#7bab52",
        snow: "#d8e6b0", tundra: "#6a8a70", ice_sheet: "#e0ecd0",
        lava_field: "#884020", ash: "#4a4038", cave_mouth: "#142018",
      };
    case "oceanic":
      return {
        ocean: "#0a4060", beach: "#c0b888", grassland: "#2a6a5a", forest: "#1a4a4a",
        desert: "#8a7a50", scrub: "#4a7a60", rock: "#4a5560", alpine: "#6a8a7a",
        snow: "#c8dce8", tundra: "#5a7a80", ice_sheet: "#d0e4f0",
        lava_field: "#703020", ash: "#3a4048", cave_mouth: "#081820",
      };
    case "tundra":
      return {
        ocean: "#3a5060", beach: "#a0a898", grassland: "#6a7a60", forest: "#4a5a50",
        desert: "#8a8070", scrub: "#707868", rock: "#5a6068", alpine: "#8a9498",
        snow: "#e8f0f4", tundra: "#7a8a90", ice_sheet: "#d0dce4",
        lava_field: "#6a3020", ash: "#4a4848", cave_mouth: "#1a2024",
      };
    case "ice":
      return {
        ocean: "#3a6080", beach: "#b0c4d0", grassland: "#7a9098", forest: "#5a7078",
        desert: "#a0b0b8", scrub: "#809098", rock: "#5a6a76", alpine: "#c0d0d8",
        snow: "#ffffff", tundra: "#a9c4d2", ice_sheet: "#e8f4fc",
        lava_field: "#6a4030", ash: "#4a5058", cave_mouth: "#1a2830",
      };
    case "gas_giant":
      return {
        ocean: "#c4a06a", beach: "#d4b078", grassland: "#d8b888", forest: "#c4a06a",
        desert: "#e0c490", scrub: "#d0b080", rock: "#9a7a52", alpine: "#e8d0a0",
        snow: "#f2e0b8", tundra: "#dcc8a0", ice_sheet: "#f0e8d0",
        lava_field: "#a05030", ash: "#8a7060", cave_mouth: "#5a4838",
      };
    case "temperate":
    default:
      return {
        ocean: "#1a4a6a", beach: "#c8b878", grassland: "#4a8a48", forest: "#2f6d40",
        desert: "#b89858", scrub: "#6a8a48", rock: "#6a6560", alpine: "#a88b63",
        snow: "#e4dcc6", tundra: "#7a8a70", ice_sheet: "#e8eef4",
        lava_field: "#883820", ash: "#4a4844", cave_mouth: "#1a1814",
      };
  }
};
