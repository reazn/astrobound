import {
  InstancedMesh, Matrix4, Quaternion, Vector3, Object3D, Mesh,
  BufferGeometry, Material, DynamicDrawUsage,
} from "three";
import type { RngStream } from "../engine/rng";
import { rngRange } from "../engine/rng";
import { loadGltf } from "../engine/gltfCache";
import { makeReadableToon } from "./toonMaterial";

// Asset: "Asteroid" by Poly by Google — CC-BY 3.0 via poly.pizza (needs credit).
// Ambient asteroids ride the local orbital frame so when you brake to a relative
// stop they stay put relative to you (instead of streaming past in star-rest).
// Spawns stay well outside the near field so rocks never pop in front of you.

const COUNT = 360;
const SHELL_MIN = 1400;
const SHELL_MAX = 7200;
const RECYCLE_DIST = 7800;
const PLANET_CLEAR = 2.6;
const STAR_CLEAR = 1.6;
const SCALE_MIN = 8;
const SCALE_MAX = 64;

export interface AsteroidBody {
  systemPosition: Vector3;
  maxR: number;
}

export interface AsteroidField {
  mesh: InstancedMesh;
  update(
    shipSystemPos: Vector3,
    renderOrigin: Vector3,
    planets: AsteroidBody[],
    starPos: Vector3,
    starRadius: number,
    active: boolean,
    dt: number,
    frameVel?: Vector3,
  ): void;
}

const MODEL_URL = "/models/asteroid.glb";

export async function loadAsteroidField(rng: RngStream): Promise<AsteroidField> {
  const gltf = await loadGltf(MODEL_URL);
  let srcGeo: BufferGeometry | null = null;
  let srcMat: Material | null = null;
  gltf.scene.traverse((o: Object3D) => {
    const m = o as Mesh;
    if (m.isMesh && !srcGeo) {
      srcGeo = m.geometry;
      srcMat = Array.isArray(m.material) ? m.material[0] : m.material;
    }
  });
  if (!srcGeo || !srcMat) throw new Error("asteroid.glb has no mesh");

  const geo = srcGeo as BufferGeometry;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const size = bb.getSize(new Vector3());
  const center = bb.getCenter(new Vector3());
  geo.translate(-center.x, -center.y, -center.z);
  const norm = 1 / (Math.max(size.x, size.y, size.z) || 1);
  geo.scale(norm, norm, norm);

  // Readable toon so rocks stay visible in shade (lit by sun, not emissive).
  const matClone = makeReadableToon(srcMat as Material);
  matClone.color.multiplyScalar(1.25);

  const mesh = new InstancedMesh(geo, matClone, COUNT);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.visible = false;

  const pos = Array.from({ length: COUNT }, () => new Vector3());
  const quat = Array.from({ length: COUNT }, () => new Quaternion());
  const spinAxis = Array.from({ length: COUNT }, () => new Vector3(0, 1, 0));
  const spinRate = new Float32Array(COUNT);
  const scale = new Float32Array(COUNT);

  const mat = new Matrix4();
  const scaleVec = new Vector3();
  const qDelta = new Quaternion();
  const tmp = new Vector3();
  const zero = new Vector3();
  let seeded = false;

  const randDir = (out: Vector3) => {
    const u = rng() * 2 - 1;
    const t = rng() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    return out.set(Math.cos(t) * s, u, Math.sin(t) * s);
  };

  const isClear = (p: Vector3, planets: AsteroidBody[], starPos: Vector3, starRadius: number) => {
    if (p.distanceTo(starPos) < starRadius * STAR_CLEAR) return false;
    for (const pl of planets) {
      if (p.distanceTo(pl.systemPosition) < pl.maxR * PLANET_CLEAR) return false;
    }
    return true;
  };

  const pickScale = () => {
    const t = rng();
    if (t < 0.55) return rngRange(rng, SCALE_MIN, SCALE_MIN + (SCALE_MAX - SCALE_MIN) * 0.35);
    if (t < 0.88) return rngRange(rng, SCALE_MIN + (SCALE_MAX - SCALE_MIN) * 0.3, SCALE_MAX * 0.75);
    return rngRange(rng, SCALE_MAX * 0.7, SCALE_MAX);
  };

  const respawn = (
    i: number, shipPos: Vector3, planets: AsteroidBody[], starPos: Vector3, starRadius: number,
  ) => {
    for (let tries = 0; tries < 10; tries++) {
      const roll = rng();
      const dist = roll < 0.4
        ? rngRange(rng, SHELL_MIN, SHELL_MIN + 1600)
        : roll < 0.8
          ? rngRange(rng, SHELL_MIN + 1200, SHELL_MAX * 0.75)
          : rngRange(rng, SHELL_MAX * 0.6, SHELL_MAX);
      randDir(tmp).multiplyScalar(dist);
      tmp.add(shipPos);
      if (tries === 9 || isClear(tmp, planets, starPos, starRadius)) break;
    }
    pos[i].copy(tmp);
    randDir(spinAxis[i]);
    spinRate[i] = rng() < 0.55 ? rngRange(rng, 0.02, 0.45) : 0;
    scale[i] = pickScale();
    quat[i].setFromAxisAngle(randDir(tmp), rng() * Math.PI * 2);
  };

  return {
    mesh,
    update(shipSystemPos, renderOrigin, planets, starPos, starRadius, active, dt, frameVel) {
      mesh.visible = active;
      if (!active) {
        seeded = false;
        return;
      }

      const fv = frameVel ?? zero;
      for (let i = 0; i < COUNT; i++) {
        if (!seeded || pos[i].distanceTo(shipSystemPos) > RECYCLE_DIST) {
          respawn(i, shipSystemPos, planets, starPos, starRadius);
        } else {
          pos[i].addScaledVector(fv, dt);
        }
        if (spinRate[i] !== 0) {
          qDelta.setFromAxisAngle(spinAxis[i], spinRate[i] * dt);
          quat[i].premultiply(qDelta);
        }
        scaleVec.setScalar(scale[i]);
        mat.compose(tmp.copy(pos[i]).sub(renderOrigin), quat[i], scaleVec);
        mesh.setMatrixAt(i, mat);
      }
      seeded = true;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
