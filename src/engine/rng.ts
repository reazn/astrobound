// Single seeded RNG service with named streams. Nothing in the game reads
// Math.random() directly — all randomness flows from ONE run seed so worlds are
// reproducible and (later) multiplayer-syncable.

export type RngStream = () => number; // returns float in [0, 1)

// mulberry32: tiny, fast, good-enough PRNG. Deterministic from a uint32 seed.
function mulberry32(seed: number): RngStream {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash a string seed into a uint32 (so players can type words as seeds).
export function hashSeed(seed: string | number): number {
  if (typeof seed === "number") return seed >>> 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Rng {
  readonly seed: number;
  world: RngStream;
  loot: RngStream;
  combat: RngStream;
}

// Each named stream is derived from the master seed with a fixed salt so the
// streams are independent but fully determined by the run seed.
export function createRng(seed: string | number): Rng {
  const master = hashSeed(seed);
  return {
    seed: master,
    world: mulberry32(master ^ 0x9e3779b1),
    loot: mulberry32(master ^ 0x85ebca77),
    combat: mulberry32(master ^ 0xc2b2ae3d),
  };
}

// Helpers usable with any stream.
export const rngRange = (r: RngStream, min: number, max: number) =>
  min + (max - min) * r();
export const rngInt = (r: RngStream, min: number, maxInclusive: number) =>
  Math.floor(min + (maxInclusive - min + 1) * r());
export const rngPick = <T>(r: RngStream, arr: readonly T[]): T =>
  arr[Math.floor(r() * arr.length)];
