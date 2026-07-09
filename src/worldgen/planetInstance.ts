import { Mesh, Vector3, LOD, type Camera } from "three";
import { createRng } from "../engine/rng";
import { createPlanet, type Planet } from "./planet";
import { buildPlanetMesh, buildPlanetMeshAsync, lodSegments } from "./planetMesh";
import { createTerrainMaterial } from "../visuals/toonMaterial";
import { createAtmosphere, type Atmosphere } from "../visuals/atmosphere";
import { createPlanetRocks, type PlanetRocks } from "../visuals/planetRocks";
import { createPlanetLiquid, type PlanetLiquidMesh } from "../visuals/planetLiquid";
import type { PlanetDef } from "../content/planets/types";

export interface PlanetInstance {
  def: PlanetDef;
  planet: Planet;
  mesh: Mesh;
  lod: LOD;
  atmosphere: Atmosphere;
  rocks: PlanetRocks;
  liquid: PlanetLiquidMesh | null;
  colliderVertices: Float32Array;
  colliderIndices: Uint32Array;
  systemPosition: Vector3;
  prevSystemPosition: Vector3;
  updateLod(camera: Camera): void;
}

export async function createPlanetInstance(def: PlanetDef): Promise<PlanetInstance> {
  const rng = createRng(def.seed);
  const planet = createPlanet(def, rng.world);
  const segs = lodSegments(def.faceSegments);
  const mat = createTerrainMaterial();

  const midBuilt = buildPlanetMesh(planet, segs.mid);
  const lowBuilt = buildPlanetMesh(planet, segs.low);

  const meshMid = new Mesh(midBuilt.geometry, mat);
  const meshLow = new Mesh(lowBuilt.geometry, mat);
  const meshHigh = new Mesh(midBuilt.geometry, mat);
  meshHigh.visible = false;
  for (const m of [meshHigh, meshMid, meshLow]) {
    m.receiveShadow = false;
    m.castShadow = false;
    m.frustumCulled = false;
  }

  const r = planet.maxR;
  const nearDist = r + 140;
  const farDist = r * 2.8;
  const lod = new LOD();
  lod.addLevel(meshMid, 0);
  lod.addLevel(meshLow, farDist);
  lod.autoUpdate = false;

  const atmosphere = createAtmosphere(planet, rng.world);
  lod.add(atmosphere.group);

  const rocks = await createPlanetRocks(planet, createRng(`${def.seed}-rocks`).world);
  lod.add(rocks.group);

  // Match near-surface (high) terrain density so water facets match land.
  const liquid = createPlanetLiquid(planet, segs.high);
  if (liquid) lod.add(liquid.mesh);

  let highLoaded = false;
  let highWanted = false;
  let building = false;
  let highOwnsGeo = false;
  let jobToken = 0;

  const rebuildLevels = (withHigh: boolean) => {
    while (lod.levels.length) lod.levels.pop();
    if (withHigh) {
      lod.addLevel(meshHigh, 0);
      lod.addLevel(meshMid, nearDist);
      lod.addLevel(meshLow, farDist);
    } else {
      lod.addLevel(meshMid, 0);
      lod.addLevel(meshLow, farDist);
    }
  };

  const unloadHigh = () => {
    if (!highLoaded && !building) return;
    jobToken++;
    building = false;
    if (highOwnsGeo) {
      const geo = meshHigh.geometry;
      meshHigh.geometry = midBuilt.geometry;
      if (geo !== midBuilt.geometry) geo.dispose();
      highOwnsGeo = false;
    }
    meshHigh.visible = false;
    highLoaded = false;
    rebuildLevels(false);
  };

  const loadHigh = () => {
    if (highLoaded || building) return;
    building = true;
    const token = ++jobToken;
    buildPlanetMeshAsync(def, def.seed, segs.high, planet.seaLevel)
      .then((geometry) => {
        if (token !== jobToken || !highWanted) {
          geometry.dispose();
          building = false;
          return;
        }
        const old = meshHigh.geometry;
        meshHigh.geometry = geometry;
        meshHigh.visible = true;
        if (highOwnsGeo && old !== midBuilt.geometry) old.dispose();
        highOwnsGeo = true;
        highLoaded = true;
        building = false;
        rebuildLevels(true);
      })
      .catch(() => {
        if (token === jobToken) building = false;
      });
  };

  return {
    def,
    planet,
    mesh: meshMid,
    lod,
    atmosphere,
    rocks,
    liquid,
    colliderVertices: midBuilt.colliderVertices,
    colliderIndices: midBuilt.colliderIndices,
    systemPosition: new Vector3(),
    prevSystemPosition: new Vector3(),
    updateLod(camera) {
      const dist = camera.position.distanceTo(lod.position);
      highWanted = dist < nearDist + 80;
      if (highWanted) loadHigh();
      else if (dist > nearDist + 220) unloadHigh();
      lod.update(camera);
    },
  };
}
