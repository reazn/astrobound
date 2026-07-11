import { Group, Mesh, Vector3, LOD, type Camera, type MeshToonMaterial } from "three";
import { createRng } from "../engine/rng";
import { createPlanet, type Planet } from "./planet";
import {
  buildPlanetMesh, buildPlanetMeshAsync, createFaceGroup, lodSegments,
} from "./planetMesh";
import { createTerrainMaterial } from "../visuals/toonMaterial";
import { createAtmosphere, type Atmosphere } from "../visuals/atmosphere";
import { createPlanetRocks, type PlanetRocks } from "../visuals/planetRocks";
import { createPlanetOre, type PlanetOre } from "../visuals/planetOre";
import { createPlanetLiquid, type PlanetLiquidMesh } from "../visuals/planetLiquid";
import { createPlanetRings, type PlanetRingsMesh } from "../visuals/planetRings";
import type { PlanetDef } from "../content/planets/types";
import { geometryTriangleCount } from "../engine/meshStats";
import { applyCubeFaceVisibility } from "./planetFaceCull";

export type TerrainLodLevel = "high" | "mid" | "low" | "none";

export const LOD_DEBUG_COLORS = {
  high: "#3dff8a",
  mid: "#ffe14a",
  low: "#ff5a6e",
} as const;

export interface TerrainLodDebug {
  level: TerrainLodLevel;
  segments: number;
  triangles: number;
  highLoaded: boolean;
  highBuilding: boolean;
  camDist: number;
}

export interface PlanetInstance {
  def: PlanetDef;
  planet: Planet;
  mesh: Group;
  lod: LOD;
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
  updateLod(camera: Camera): void;
  setLodDebugTint(enabled: boolean): void;
  getTerrainLodDebug(camera: Camera): TerrainLodDebug;
}

export async function createPlanetInstance(def: PlanetDef): Promise<PlanetInstance> {
  const rng = createRng(def.seed);
  const planet = createPlanet(def, rng.world);
  const segs = lodSegments(def.faceSegments);
  const matHigh = createTerrainMaterial();
  const matMid = createTerrainMaterial();
  const matLow = createTerrainMaterial();

  const midBuilt = buildPlanetMesh(planet, segs.mid, matMid);
  const lowBuilt = buildPlanetMesh(planet, segs.low, matLow);

  const highGroup = new Group();
  highGroup.visible = false;
  let highFaces: Mesh[] = [];
  let highGeos = midBuilt.geometries;

  const r = planet.maxR;
  const nearDist = r + 140;
  const farDist = r * 2.8;
  const lod = new LOD();
  lod.addLevel(midBuilt.group, 0);
  lod.addLevel(lowBuilt.group, farDist);
  lod.autoUpdate = false;

  const atmosphere = createAtmosphere(planet, rng.world);
  lod.add(atmosphere.group);

  const rocks = createPlanetRocks();
  lod.add(rocks.group);

  const ore = createPlanetOre(planet, createRng(`${def.seed}-ore`).world);
  lod.add(ore.group);

  const liquid = createPlanetLiquid(planet, segs);
  if (liquid) lod.add(liquid.mesh);

  const rings = createPlanetRings(def.radius, def.rings ?? []);
  if (rings) lod.add(rings.group);

  let highLoaded = false;
  let highWanted = false;
  let building = false;
  let highOwnsGeo = false;
  let jobToken = 0;
  const camLocal = new Vector3();

  const rebuildLevels = (withHigh: boolean) => {
    while (lod.levels.length) lod.levels.pop();
    if (withHigh) {
      lod.addLevel(highGroup, 0);
      lod.addLevel(midBuilt.group, nearDist);
      lod.addLevel(lowBuilt.group, farDist);
    } else {
      lod.addLevel(midBuilt.group, 0);
      lod.addLevel(lowBuilt.group, farDist);
    }
  };

  const unloadHigh = () => {
    if (!highLoaded && !building) return;
    jobToken++;
    building = false;
    if (highOwnsGeo) {
      for (const g of highGeos) {
        if (!midBuilt.geometries.includes(g)) g.dispose();
      }
      highOwnsGeo = false;
    }
    while (highGroup.children.length) highGroup.remove(highGroup.children[0]);
    highFaces = [];
    highGeos = midBuilt.geometries;
    highGroup.visible = false;
    highLoaded = false;
    liquid?.releaseHigh();
    rebuildLevels(false);
  };

  const loadHigh = () => {
    if (highLoaded || building) return;
    building = true;
    const token = ++jobToken;
    buildPlanetMeshAsync(def, def.seed, segs.high, planet.seaLevel)
      .then((geometries) => {
        if (token !== jobToken || !highWanted) {
          for (const g of geometries) g.dispose();
          building = false;
          return;
        }
        while (highGroup.children.length) highGroup.remove(highGroup.children[0]);
        if (highOwnsGeo) {
          for (const g of highGeos) g.dispose();
        }
        const built = createFaceGroup(geometries, matHigh);
        for (const face of built.faces) highGroup.add(face);
        highFaces = built.faces;
        highGeos = geometries;
        highOwnsGeo = true;
        highLoaded = true;
        building = false;
        rebuildLevels(true);
      })
      .catch(() => {
        if (token === jobToken) building = false;
      });
  };

  let debugTint = false;

  const applyTint = () => {
    const mats: { mat: MeshToonMaterial; hex: string }[] = [
      { mat: matHigh, hex: LOD_DEBUG_COLORS.high },
      { mat: matMid, hex: LOD_DEBUG_COLORS.mid },
      { mat: matLow, hex: LOD_DEBUG_COLORS.low },
    ];
    for (const { mat, hex } of mats) {
      mat.color.set(debugTint ? hex : "#ffffff");
      mat.needsUpdate = true;
    }
  };

  const activeLevel = (): TerrainLodLevel => {
    if (highGroup.visible) return "high";
    if (midBuilt.group.visible) return "mid";
    if (lowBuilt.group.visible) return "low";
    return "none";
  };

  const activeFaces = (): Mesh[] => {
    const level = activeLevel();
    if (level === "high") return highFaces;
    if (level === "mid") return midBuilt.faces;
    if (level === "low") return lowBuilt.faces;
    return [];
  };

  const segmentsFor = (level: TerrainLodLevel): number => {
    if (level === "high") return segs.high;
    if (level === "mid") return segs.mid;
    if (level === "low") return segs.low;
    return 0;
  };

  const syncLiquidLod = (level: TerrainLodLevel) => {
    if (!liquid || level === "none") return;
    if (level === "high") {
      liquid.ensureHigh(planet, segs.high);
      liquid.setLodLevel("high");
    } else {
      liquid.setLodLevel(level);
    }
  };

  return {
    def,
    planet,
    mesh: midBuilt.group,
    lod,
    atmosphere,
    rocks,
    ore,
    liquid,
    rings,
    colliderVertices: midBuilt.colliderVertices,
    colliderIndices: midBuilt.colliderIndices,
    systemPosition: new Vector3(),
    prevSystemPosition: new Vector3(),
    dispose() {
      jobToken++;
      lod.removeFromParent();
      atmosphere.skyDome.removeFromParent();
      midBuilt.disposeGeometries();
      lowBuilt.disposeGeometries();
      if (highOwnsGeo) {
        for (const g of highGeos) g.dispose();
      }
      matHigh.dispose();
      matMid.dispose();
      matLow.dispose();
      liquid?.dispose();
      rocks.group.removeFromParent();
      ore.group.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) mat?.dispose?.();
        }
      });
      ore.group.removeFromParent();
    },
    updateLod(camera) {
      const dist = camera.position.distanceTo(lod.position);
      highWanted = dist < nearDist + 80;
      if (highWanted) loadHigh();
      else if (dist > nearDist + 220) unloadHigh();
      lod.update(camera);

      const level = activeLevel();
      syncLiquidLod(level);

      camLocal.copy(camera.position).sub(lod.position);
      applyCubeFaceVisibility(activeFaces(), camLocal, planet.maxR);
      if (liquid && liquid.mesh.visible) {
        liquid.applyFaceCull(camLocal, planet.maxR);
      }
    },
    setLodDebugTint(enabled) {
      debugTint = enabled;
      applyTint();
    },
    getTerrainLodDebug(camera) {
      const level = activeLevel();
      let triangles = 0;
      for (const face of activeFaces()) {
        if (face.visible) triangles += geometryTriangleCount(face.geometry);
      }
      return {
        level,
        segments: segmentsFor(level),
        triangles,
        highLoaded,
        highBuilding: building,
        camDist: camera.position.distanceTo(lod.position),
      };
    },
  };
}
