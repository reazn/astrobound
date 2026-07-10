import { Mesh, Vector3, Group, type Camera } from "three";
import { createRng } from "../engine/rng";
import { createPlanet, type Planet } from "./planet";
import { createCubeSphereLod, type CubeSphereLod, type LodViewMode } from "./cubeSphereLod";
import { createTerrainMaterial } from "../visuals/toonMaterial";
import { createAtmosphere, type Atmosphere } from "../visuals/atmosphere";
import { createPlanetRocks, type PlanetRocks } from "../visuals/planetRocks";
import { createPlanetOre, type PlanetOre } from "../visuals/planetOre";
import type { PlanetLiquidMesh } from "../visuals/planetLiquid";
import { createPlanetRings, type PlanetRingsMesh } from "../visuals/planetRings";
import type { PlanetDef } from "../content/planets/types";

export interface PlanetInstance {
  def: PlanetDef;
  planet: Planet;
  mesh: Mesh;
  lod: Group;
  terrainLod: CubeSphereLod;
  atmosphere: Atmosphere;
  rocks: PlanetRocks;
  ore: PlanetOre;
  liquid: PlanetLiquidMesh | null;
  rings: PlanetRingsMesh | null;
  colliderVertices: Float32Array;
  colliderIndices: Uint32Array;
  systemPosition: Vector3;
  prevSystemPosition: Vector3;
  dispose(): void;
  updateLod(camera: Camera, focusPlanetLocal?: Vector3, mode?: LodViewMode): void;
  setLodDebug(on: boolean): void;
}

export async function createPlanetInstance(def: PlanetDef): Promise<PlanetInstance> {
  const rng = createRng(def.seed);
  const planet = createPlanet(def, rng.world);
  const mat = createTerrainMaterial();

  const terrainLod = createCubeSphereLod(planet, mat);
  const lod = terrainLod.group;

  const atmosphere = createAtmosphere(planet, rng.world);
  lod.add(atmosphere.group);

  const rocks = await createPlanetRocks(planet, createRng(`${def.seed}-rocks`).world);
  lod.add(rocks.group);

  const ore = await createPlanetOre(planet, createRng(`${def.seed}-ore`).world);
  lod.add(ore.group);

  // Liquid is chunked inside terrainLod (same quadtree as land).
  const liquid: PlanetLiquidMesh | null = terrainLod.hasLiquid
    ? {
      mesh: lod, // placeholder; visibility driven by terrainLod.updateLiquid
      kind: def.liquid!.kind,
      level: def.liquid!.level,
      seaRadius: terrainLod.seaRadius,
      update(_sun, _day, camPlanetLocal) {
        terrainLod.updateLiquid(camPlanetLocal);
      },
    }
    : null;

  const rings = createPlanetRings(def.radius, def.rings ?? []);
  if (rings) lod.add(rings.group);

  const meshProxy = terrainLod.group.children.find((c) => (c as Mesh).isMesh) as Mesh
    ?? new Mesh();

  return {
    def,
    planet,
    mesh: meshProxy,
    lod,
    terrainLod,
    atmosphere,
    rocks,
    ore,
    liquid,
    rings,
    colliderVertices: terrainLod.colliderVertices,
    colliderIndices: terrainLod.colliderIndices,
    systemPosition: new Vector3(),
    prevSystemPosition: new Vector3(),
    dispose() {
      lod.removeFromParent();
      atmosphere.skyDome.removeFromParent();
      terrainLod.dispose();
      rocks.group.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) mat?.dispose?.();
        }
      });
      ore.group.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) mat?.dispose?.();
        }
      });
    },
    updateLod(camera, focusPlanetLocal, mode) {
      terrainLod.update(camera, lod.position, focusPlanetLocal, mode ?? "space");
      const surface = (mode ?? "space") === "surface";
      rocks.group.visible = surface;
      ore.group.visible = surface;
    },
    setLodDebug(on) {
      terrainLod.setDebugVisuals(on);
    },
  };
}
