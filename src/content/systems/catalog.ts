import { Vector3 } from "three";
import { PLANET_REGISTRY, HOME_PLANET } from "../planets";
import { STATION_NAME, STATION_ORBIT, STATION_RADIUS } from "../station";
import { starDefFromHome } from "../../config/star";
import { createRng } from "../../engine/rng";
import {
  generateStarSystem, randomSystemSeed, type StarSystemDef,
} from "../../worldgen/generateSystem";
import { orbitPositionAt } from "../../worldgen/orbits";
import type { MapBody } from "../../ui/systemMap";

// Lightweight "known" systems: full PlanetDef data for map preview, but no
// meshes / physics until the player teleports.

export interface KnownSystem {
  def: StarSystemDef;
  // True when this is the system the player currently occupies.
  isHomeCatalog: boolean;
}

export function homeStarSystem(): StarSystemDef {
  return {
    id: "home-solara",
    seed: "solar-001",
    name: "Solara System",
    star: starDefFromHome(),
    planets: [...PLANET_REGISTRY],
    handcrafted: true,
  };
}

export function createKnownSystemsCatalog(count = 6): KnownSystem[] {
  const list: KnownSystem[] = [
    { def: homeStarSystem(), isHomeCatalog: true },
  ];
  const rng = createRng("known-systems-v1").world;
  for (let i = 0; i < count; i++) {
    const seed = randomSystemSeed(rng);
    list.push({ def: generateStarSystem(seed), isHomeCatalog: false });
  }
  return list;
}

export function discoverKnownSystem(catalog: KnownSystem[]): KnownSystem {
  const rng = createRng(`discover-${Date.now()}-${catalog.length}`).world;
  const entry: KnownSystem = {
    def: generateStarSystem(randomSystemSeed(rng)),
    isHomeCatalog: false,
  };
  catalog.push(entry);
  return entry;
}

const _pos = new Vector3();

/** Build map bodies from a known system def (no PlanetInstance required). */
export function mapBodiesFromSystemDef(
  sys: StarSystemDef,
  time: number,
  includeStation: boolean,
): MapBody[] {
  const bodies: MapBody[] = sys.planets.map((p) => {
    orbitPositionAt(p.orbit, time, _pos);
    return {
      name: p.name,
      color: p.palette.atmosphere,
      kind: "planet" as const,
      orbit: p.orbit,
      position: _pos.clone(),
      radius: p.radius + p.amplitude,
      detail: p.meta
        ? `${p.meta.climate} · ${Math.round(p.meta.temperatureK)}K · ${p.meta.massEarth.toFixed(2)} M⊕`
        : p.id === HOME_PLANET.id
          ? `home · r ${p.radius}u`
          : `r ${p.radius}u`,
      hasRings: !!(p.rings && p.rings.length > 0),
      ringColor: p.rings?.[1]?.color ?? p.rings?.[0]?.color,
    };
  });
  if (includeStation && sys.handcrafted) {
    orbitPositionAt(STATION_ORBIT, time, _pos);
    bodies.push({
      name: STATION_NAME,
      color: "#7ab0ff",
      kind: "station",
      orbit: STATION_ORBIT,
      position: _pos.clone(),
      radius: STATION_RADIUS,
    });
  }
  return bodies;
}
