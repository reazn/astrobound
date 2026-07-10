import { Group, Vector3 } from "three";

// Surface rocks are baked into the planet heightfield (see worldgen/planet.ts)
// so they share terrain mesh, collider, and palette coloring. This stub keeps
// the PlanetInstance / movement / occluder API stable with empty props.

export interface PlanetRocks {
  group: Group;
  centers: Vector3[];
  radii: number[];
}

export function createPlanetRocks(): PlanetRocks {
  return { group: new Group(), centers: [], radii: [] };
}
