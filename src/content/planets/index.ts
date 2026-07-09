import type { PlanetDef } from "./types";
import { CRAGFALL } from "./cragfall";
import { EMBER } from "./ember";
import { VERDANT } from "./verdant";
import { FROST } from "./frost";

// Registry: import every planet, expose the list + lookup + default spawn.
export const PLANET_REGISTRY: readonly PlanetDef[] = [CRAGFALL, EMBER, VERDANT, FROST];

export const PLANETS_BY_ID: Record<string, PlanetDef> = Object.fromEntries(
  PLANET_REGISTRY.map((p) => [p.id, p]),
);

export const HOME_PLANET = CRAGFALL;

export type { PlanetDef, OrbitElements, PlanetPalette, PlanetNoise } from "./types";
