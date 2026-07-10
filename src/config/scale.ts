// Global world scale. Planets / orbits / star grew ~50× for NMS-scale worlds.
// Ship hull and on-foot character stay human-sized; travel uses warp + higher cruise.

export const WORLD_SCALE = 50;

// Freeze Kepler motion — static system layout is cheaper and avoids orbital
// frame shake while iterating large planets. Set false to restore orbits.
export const STATIC_ORBITS = true;

// Home Cragfall SMA after scale — used as 1 AU reference for procedural meta.
export const AU_REF = 48000 * WORLD_SCALE;

export const scaleWorld = (v: number) => v * WORLD_SCALE;
