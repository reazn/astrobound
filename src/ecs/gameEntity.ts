// Shared classification for gameplay assets. Use these kinds when registering
// camera occluders, interaction targets, or future networking filters so
// vehicles / props / characters stay easy to find and tune in one place.

export type EntityKind =
  | "player"
  | "vehicle"
  | "prop"
  | "terrain"
  | "celestial"
  | "station"
  | "fx";

export interface GameEntityDesc {
  id: string;
  kind: EntityKind;
  label?: string;
  // Spring-arm / camera should stop against this asset.
  blocksCamera: boolean;
  // Approximate collision radius for camera rays (world units).
  cameraRadius: number;
}

export const ENTITY_PRESETS = {
  player: {
    kind: "player" as const,
    blocksCamera: false,
    cameraRadius: 0.6,
  },
  ship: {
    kind: "vehicle" as const,
    blocksCamera: true,
    cameraRadius: 6.5,
  },
  rock: {
    kind: "prop" as const,
    blocksCamera: true,
    cameraRadius: 2.5,
  },
  planet: {
    kind: "celestial" as const,
    blocksCamera: true,
    cameraRadius: 0,
  },
  station: {
    kind: "station" as const,
    blocksCamera: true,
    cameraRadius: 40,
  },
} as const;

export function describeEntity(
  id: string,
  preset: keyof typeof ENTITY_PRESETS,
  overrides: Partial<GameEntityDesc> = {},
): GameEntityDesc {
  const base = ENTITY_PRESETS[preset];
  return {
    id,
    kind: base.kind,
    blocksCamera: base.blocksCamera,
    cameraRadius: base.cameraRadius,
    ...overrides,
  };
}
