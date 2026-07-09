import {
  Group, Vector3, Color, MeshToonMaterial, InstancedMesh, Matrix4,
  Quaternion, DynamicDrawUsage, IcosahedronGeometry, Material,
} from "three";
import type { RngStream } from "../engine/rng";
import { rngRange, rngInt } from "../engine/rng";
import type { Planet } from "../worldgen/planet";
import { readableToonGradient } from "./toonMaterial";

// Surface ore nodules — procedural icosahedrons tinted by climate / rarity.
// Reuses rock-style placement (sphere sample → surface radius).

const COUNT_BASE = 90;
const SCALE_MIN = 0.35;
const SCALE_MAX = 1.8;

export type OreKind = "iron" | "copper" | "crystal" | "carbon";

export interface PlanetOre {
  group: Group;
  centers: Vector3[];
  radii: number[];
  kinds: OreKind[];
}

const ORE_COLORS: Record<OreKind, string> = {
  iron: "#8a9aaa",
  copper: "#c87840",
  crystal: "#7fd6ff",
  carbon: "#3a3a42",
};

function pickKind(rng: RngStream, climate?: string): OreKind {
  const roll = rng();
  if (climate === "ice" || climate === "tundra") {
    if (roll < 0.45) return "crystal";
    if (roll < 0.7) return "iron";
    if (roll < 0.9) return "carbon";
    return "copper";
  }
  if (climate === "scorched" || climate === "arid") {
    if (roll < 0.4) return "iron";
    if (roll < 0.7) return "copper";
    if (roll < 0.9) return "carbon";
    return "crystal";
  }
  if (roll < 0.35) return "iron";
  if (roll < 0.55) return "copper";
  if (roll < 0.8) return "carbon";
  return "crystal";
}

export async function createPlanetOre(
  planet: Planet,
  rng: RngStream,
): Promise<PlanetOre> {
  const group = new Group();
  const centers: Vector3[] = [];
  const radii: number[] = [];
  const kinds: OreKind[] = [];

  const climate = planet.def.meta?.climate;
  const count = climate === "gas_giant"
    ? Math.floor(COUNT_BASE * 0.25)
    : COUNT_BASE + rngInt(rng, -20, 40);

  const geo = new IcosahedronGeometry(1, 1);
  const mat = new Matrix4();
  const quat = new Quaternion();
  const pos = new Vector3();
  const scale = new Vector3();
  const up = new Vector3();
  const qAlign = new Quaternion();
  const yUp = new Vector3(0, 1, 0);
  const color = new Color();

  // One InstancedMesh per ore kind for distinct tints.
  const byKind: Record<OreKind, number[]> = {
    iron: [], copper: [], crystal: [], carbon: [],
  };
  const placements: Array<{
    kind: OreKind; pos: Vector3; quat: Quaternion; scale: Vector3; radius: number;
  }> = [];

  let placed = 0;
  let attempts = 0;
  const maxAttempts = count * 10;
  while (placed < count && attempts < maxAttempts) {
    attempts++;
    const u = rng() * 2 - 1;
    const t = rng() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    up.set(Math.cos(t) * s, u, Math.sin(t) * s).normalize();
    const r = planet.surfaceRadius(up.x, up.y, up.z);
    if (planet.def.liquid && r < planet.seaLevel + 2) continue;

    // Prefer mid/high slopes — sample a tiny offset for grade.
    const eps = 0.015;
    const rA = planet.surfaceRadius(up.x + eps, up.y, up.z);
    const grade = Math.abs(rA - r) / (eps * Math.max(1, r));
    if (grade < 0.08 && rng() < 0.55) continue;

    pos.copy(up).multiplyScalar(r);
    qAlign.setFromUnitVectors(yUp, up);
    quat.setFromAxisAngle(up, rng() * Math.PI * 2).premultiply(qAlign);
    const sc = rngRange(rng, SCALE_MIN, SCALE_MAX);
    scale.set(sc * rngRange(rng, 0.8, 1.2), sc * rngRange(rng, 0.7, 1.15), sc * rngRange(rng, 0.8, 1.2));
    pos.addScaledVector(up, scale.y * 0.15);

    const kind = pickKind(rng, climate);
    const radius = Math.max(scale.x, scale.y, scale.z) * 0.7;
    placements.push({
      kind,
      pos: pos.clone(),
      quat: quat.clone(),
      scale: scale.clone(),
      radius,
    });
    byKind[kind].push(placements.length - 1);
    centers.push(pos.clone());
    radii.push(radius);
    kinds.push(kind);
    placed++;
  }

  for (const kind of Object.keys(byKind) as OreKind[]) {
    const idxs = byKind[kind];
    if (!idxs.length) continue;
    const material = new MeshToonMaterial({
      color: new Color(ORE_COLORS[kind]),
      gradientMap: readableToonGradient(),
      emissive: new Color(ORE_COLORS[kind]),
      emissiveIntensity: kind === "crystal" ? 0.35 : 0.12,
    });
    (material as Material & { fog?: boolean }).fog = false;
    const mesh = new InstancedMesh(geo, material, idxs.length);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    for (let i = 0; i < idxs.length; i++) {
      const p = placements[idxs[i]];
      color.set(ORE_COLORS[kind]);
      color.offsetHSL((rng() - 0.5) * 0.04, 0, (rng() - 0.5) * 0.08);
      mat.compose(p.pos, p.quat, p.scale);
      mesh.setMatrixAt(i, mat);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }

  return { group, centers, radii, kinds };
}
