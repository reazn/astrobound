import {
  Group, Mesh, Object3D, Vector3, Color, BufferGeometry, Material,
  MeshToonMaterial, InstancedMesh, Matrix4, Quaternion, DynamicDrawUsage,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { RngStream } from "../engine/rng";
import { rngRange, rngInt } from "../engine/rng";
import type { Planet } from "../worldgen/planet";
import type { PlanetPalette } from "../content/planets/types";
import { readableToonGradient } from "./toonMaterial";

// Surface rocks scattered on each planet. Models: Quaternius rocks via poly.pizza
// (CC0) — https://poly.pizza/m/54jZKTAt5p · d2VWOdthtR · li0YBlBEMz · HtpdTh3Ld6

const ROCK_URLS = [
  "/models/rocks/rock_a.glb",
  "/models/rocks/rock_b.glb",
  "/models/rocks/rock_c.glb",
  "/models/rocks/rock_d.glb",
];

const COUNT_PER_PLANET = 90;
const SCALE_MIN = 0.8;
const SCALE_MAX = 7.5;

export interface PlanetRocks {
  group: Group;
  // Planet-local centers for camera occlusion / interaction.
  centers: Vector3[];
  radii: number[];
}

interface Proto {
  geo: BufferGeometry;
}

const loader = new GLTFLoader();
let protos: Proto[] | null = null;

async function loadProtos(): Promise<Proto[]> {
  if (protos) return protos;
  const out: Proto[] = [];
  for (const url of ROCK_URLS) {
    const gltf = await loader.loadAsync(url);
    let found: BufferGeometry | undefined;
    gltf.scene.traverse((o: Object3D) => {
      if (found) return;
      const m = o as Mesh;
      if (m.isMesh) found = m.geometry.clone();
    });
    if (!found) continue;
    const geo: BufferGeometry = found;
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const size = bb.getSize(new Vector3());
    const center = bb.getCenter(new Vector3());
    geo.translate(-center.x, -bb.min.y, -center.z);
    const norm = 1 / (Math.max(size.x, size.y, size.z) || 1);
    geo.scale(norm, norm, norm);
    out.push({ geo });
  }
  protos = out;
  return out;
}

function tintForPalette(p: PlanetPalette, rng: RngStream): Color {
  const picks = [p.rock, p.highland, p.mid, p.peak, p.lowland];
  const base = new Color(picks[rngInt(rng, 0, picks.length - 1)]);
  base.offsetHSL(
    (rng() - 0.5) * 0.04,
    (rng() - 0.5) * 0.08,
    (rng() - 0.5) * 0.12,
  );
  return base;
}

export async function createPlanetRocks(
  planet: Planet,
  rng: RngStream,
): Promise<PlanetRocks> {
  const pool = await loadProtos();
  const group = new Group();
  const centers: Vector3[] = [];
  const radii: number[] = [];
  if (pool.length === 0) return { group, centers, radii };

  const mat = new Matrix4();
  const quat = new Quaternion();
  const pos = new Vector3();
  const scale = new Vector3();
  const up = new Vector3();
  const qAlign = new Quaternion();
  const yUp = new Vector3(0, 1, 0);

  for (let pi = 0; pi < pool.length; pi++) {
    const count = Math.floor(COUNT_PER_PLANET / pool.length)
      + (pi < COUNT_PER_PLANET % pool.length ? 1 : 0);
    if (count <= 0) continue;

    const color = tintForPalette(planet.def.palette, rng);
    const material = new MeshToonMaterial({
      color,
      gradientMap: readableToonGradient(),
    });
    (material as Material & { fog?: boolean }).fog = false;

    const mesh = new InstancedMesh(pool[pi].geo, material, count);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;

    for (let i = 0; i < count; i++) {
      const u = rng() * 2 - 1;
      const t = rng() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      up.set(Math.cos(t) * s, u, Math.sin(t) * s).normalize();
      const r = planet.surfaceRadius(up.x, up.y, up.z);
      pos.copy(up).multiplyScalar(r);

      qAlign.setFromUnitVectors(yUp, up);
      quat.setFromAxisAngle(up, rng() * Math.PI * 2);
      quat.premultiply(qAlign);

      const sc = rng() < 0.15
        ? rngRange(rng, SCALE_MAX * 0.65, SCALE_MAX)
        : rngRange(rng, SCALE_MIN, SCALE_MAX * 0.55);
      scale.set(
        sc * rngRange(rng, 0.85, 1.15),
        sc * rngRange(rng, 0.7, 1.1),
        sc * rngRange(rng, 0.85, 1.15),
      );

      pos.addScaledVector(up, -scale.y * 0.12);
      mat.compose(pos, quat, scale);
      mesh.setMatrixAt(i, mat);
      centers.push(pos.clone());
      radii.push(Math.max(scale.x, scale.y, scale.z) * 0.55);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  return { group, centers, radii };
}
