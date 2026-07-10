import {
  Group, Mesh, Object3D, Vector3, Color, BufferGeometry, Material,
  MeshToonMaterial, InstancedMesh, Matrix4, Quaternion, DynamicDrawUsage,
} from "three";
import type { RngStream } from "../engine/rng";
import { rngRange } from "../engine/rng";
import { loadGltf } from "../engine/gltfCache";
import type { Planet } from "../worldgen/planet";
import { createTerrainRamp } from "../worldgen/palette";
import { readableToonGradient } from "./toonMaterial";

// Surface rocks scattered on each planet. Models: Quaternius rocks via poly.pizza
// (CC0) — https://poly.pizza/m/54jZKTAt5p · d2VWOdthtR · li0YBlBEMz · HtpdTh3Ld6

const ROCK_URLS = [
  "/models/rocks/rock_a.glb",
  "/models/rocks/rock_b.glb",
  "/models/rocks/rock_c.glb",
  "/models/rocks/rock_d.glb",
];

const COUNT_PER_PLANET = 900;
const SCALE_MIN = 1.2;
const SCALE_MAX = 28;

export interface PlanetRocks {
  group: Group;
  centers: Vector3[];
  radii: number[];
}

interface Proto {
  geo: BufferGeometry;
}

let protos: Proto[] | null = null;

async function loadProtos(): Promise<Proto[]> {
  if (protos) return protos;
  const out: Proto[] = [];
  for (const url of ROCK_URLS) {
    const gltf = await loadGltf(url);
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

function surfaceTint(
  planet: Planet,
  ramp: ReturnType<typeof createTerrainRamp>,
  up: Vector3,
  rng: RngStream,
  out: Color,
): Color {
  const r = planet.surfaceRadius(up.x, up.y, up.z);
  const heightNorm = (r - planet.minR) / Math.max(0.0001, planet.maxR - planet.minR);
  const eps = 0.012;
  const ux = up.x, uy = up.y, uz = up.z;
  let tx = 1 - ux * ux, ty = -ux * uy, tz = -ux * uz;
  let tl = Math.hypot(tx, ty, tz);
  if (tl < 1e-4) {
    tx = -uy * ux; ty = 1 - uy * uy; tz = -uy * uz;
    tl = Math.hypot(tx, ty, tz) || 1;
  }
  tx /= tl; ty /= tl; tz /= tl;
  const bx = uy * tz - uz * ty;
  const by = uz * tx - ux * tz;
  const bz = ux * ty - uy * tx;
  const rA = planet.surfaceRadius(ux + tx * eps, uy + ty * eps, uz + tz * eps);
  const rB = planet.surfaceRadius(ux + bx * eps, uy + by * eps, uz + bz * eps);
  const grade = Math.hypot(rA - r, rB - r) / (eps * Math.max(1, r));
  const slope01 = Math.min(1, grade * 2.4);
  const mottle = (rng() - 0.5) * 0.35;
  out.copy(ramp.colorAt(heightNorm, Math.max(0.35, slope01), mottle));
  out.offsetHSL(
    (rng() - 0.5) * 0.02,
    (rng() - 0.5) * 0.04,
    (rng() - 0.5) * 0.06,
  );
  return out;
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
  const color = new Color();
  const seaNorm = planet.def.liquid
    ? (planet.seaLevel - planet.minR) / Math.max(0.0001, planet.maxR - planet.minR)
    : undefined;
  const ramp = createTerrainRamp(planet.def.palette, seaNorm);

  for (let pi = 0; pi < pool.length; pi++) {
    const count = Math.floor(COUNT_PER_PLANET / pool.length)
      + (pi < COUNT_PER_PLANET % pool.length ? 1 : 0);
    if (count <= 0) continue;

    const material = new MeshToonMaterial({
      color: 0xffffff,
      gradientMap: readableToonGradient(),
    });
    (material as Material & { fog?: boolean }).fog = false;

    const mesh = new InstancedMesh(pool[pi].geo, material, count);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    let placed = 0;
    let attempts = 0;
    const maxAttempts = count * 8;
    while (placed < count && attempts < maxAttempts) {
      attempts++;
      const u = rng() * 2 - 1;
      const t = rng() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      up.set(Math.cos(t) * s, u, Math.sin(t) * s).normalize();
      const r = planet.surfaceRadius(up.x, up.y, up.z);
      if (planet.def.liquid && r < planet.seaLevel + 1.5) continue;
      pos.copy(up).multiplyScalar(r);

      qAlign.setFromUnitVectors(yUp, up);
      quat.setFromAxisAngle(up, rng() * Math.PI * 2);
      quat.premultiply(qAlign);

      const sc = rng() < 0.12
        ? rngRange(rng, SCALE_MAX * 0.55, SCALE_MAX)
        : rngRange(rng, SCALE_MIN, SCALE_MAX * 0.5);
      scale.set(
        sc * rngRange(rng, 0.85, 1.15),
        sc * rngRange(rng, 0.7, 1.1),
        sc * rngRange(rng, 0.85, 1.15),
      );

      pos.addScaledVector(up, -scale.y * 0.12);
      mat.compose(pos, quat, scale);
      mesh.setMatrixAt(placed, mat);
      mesh.setColorAt(placed, surfaceTint(planet, ramp, up, rng, color));
      centers.push(pos.clone());
      radii.push(Math.max(scale.x, scale.y, scale.z) * 0.62);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }

  return { group, centers, radii };
}
