import {
  Group, Vector3, Color, Mesh, BufferGeometry, Float32BufferAttribute,
  MeshStandardMaterial, MeshPhysicalMaterial, Material, Quaternion,
} from "three";
import type { RngStream } from "../engine/rng";
import { rngRange, rngInt } from "../engine/rng";
import type { Planet } from "../worldgen/planet";
import { lodSegments } from "../worldgen/planetMesh";

const COUNT_BASE = 90;
const SCALE_MIN = 0.45;
const SCALE_MAX = 2.2;

export type OreKind = "iron" | "copper" | "crystal" | "carbon";

export interface PlanetOre {
  group: Group;
  centers: Vector3[];
  radii: number[];
  kinds: OreKind[];
}

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

function facetLength(planet: Planet): number {
  const segs = lodSegments(planet.def.faceSegments);
  return (Math.PI * 0.5 * planet.radius) / Math.max(1, segs.high);
}

function subdivForSize(size: number, facetLen: number): number {
  let detail = 0;
  let edge = size * 1.05;
  while (edge > facetLen * 1.15 && detail < 3) {
    edge *= 0.5;
    detail++;
  }
  return detail;
}

function icosaVertices(radius: number): number[] {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw: number[][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const out: number[] = [];
  for (const p of raw) {
    const len = Math.hypot(p[0], p[1], p[2]) || 1;
    out.push((p[0] / len) * radius, (p[1] / len) * radius, (p[2] / len) * radius);
  }
  return out;
}

const ICOSA_FACES: number[][] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

function midKey(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

function subdivide(
  verts: number[],
  faces: number[][],
  detail: number,
  radius: number,
): { verts: number[]; faces: number[][] } {
  let v = verts.slice();
  let f = faces.map((t) => t.slice());
  for (let d = 0; d < detail; d++) {
    const cache = new Map<string, number>();
    const next: number[][] = [];
    const midpoint = (i0: number, i1: number): number => {
      const key = midKey(i0, i1);
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const ax = v[i0 * 3], ay = v[i0 * 3 + 1], az = v[i0 * 3 + 2];
      const bx = v[i1 * 3], by = v[i1 * 3 + 1], bz = v[i1 * 3 + 2];
      let x = (ax + bx) * 0.5, y = (ay + by) * 0.5, z = (az + bz) * 0.5;
      const len = Math.hypot(x, y, z) || 1;
      x = (x / len) * radius;
      y = (y / len) * radius;
      z = (z / len) * radius;
      const idx = v.length / 3;
      v.push(x, y, z);
      cache.set(key, idx);
      return idx;
    };
    for (const tri of f) {
      const a = midpoint(tri[0], tri[1]);
      const b = midpoint(tri[1], tri[2]);
      const c = midpoint(tri[2], tri[0]);
      next.push([tri[0], a, c], [tri[1], b, a], [tri[2], c, b], [a, b, c]);
    }
    f = next;
  }
  return { verts: v, faces: f };
}

function deformVerts(
  verts: number[],
  rng: RngStream,
  kind: OreKind,
): { positions: number[]; colors: number[] } {
  const n = verts.length / 3;
  const positions: number[] = [];
  const colors: number[] = [];
  const base = new Color();
  const fleck = new Color();

  if (kind === "iron") base.set("#8a9aaa");
  else if (kind === "copper") base.set("#c87840");
  else if (kind === "crystal") base.set("#7fd6ff");
  else base.set("#2e2e34");

  for (let i = 0; i < n; i++) {
    let x = verts[i * 3], y = verts[i * 3 + 1], z = verts[i * 3 + 2];
    const len = Math.hypot(x, y, z) || 1;
    const nx = x / len, ny = y / len, nz = z / len;

    if (kind === "iron") {
      const lump = 1 + (rng() - 0.5) * 0.35 + (rng() - 0.5) * 0.2 * Math.abs(ny);
      const squash = 1 + (rng() - 0.5) * 0.18;
      x *= lump; y *= lump * squash; z *= lump;
      fleck.copy(base).offsetHSL(0, 0, (rng() - 0.3) * 0.25);
      if (rng() < 0.12) fleck.set("#c8d4e0");
    } else if (kind === "copper") {
      const lump = 1 + (rng() - 0.5) * 0.4;
      x *= lump; y *= lump * rngRange(rng, 0.75, 1.15); z *= lump;
      fleck.copy(base);
      if (rng() < 0.28) fleck.set("#5a9a6a");
      else fleck.offsetHSL((rng() - 0.5) * 0.04, 0.05, (rng() - 0.5) * 0.12);
    } else if (kind === "crystal") {
      const spike = rng() < 0.38 ? rngRange(rng, 1.35, 2.1) : rngRange(rng, 0.85, 1.15);
      const facet = 1 + (rng() - 0.5) * 0.15;
      x = nx * len * spike * facet;
      y = ny * len * spike * facet;
      z = nz * len * spike * facet;
      fleck.copy(base).offsetHSL((rng() - 0.5) * 0.08, 0.1, (rng() - 0.5) * 0.2);
      if (rng() < 0.2) fleck.set("#e8f7ff");
    } else {
      const lump = 1 + (rng() - 0.5) * 0.55;
      const dent = rng() < 0.2 ? rngRange(rng, 0.55, 0.8) : 1;
      x *= lump * dent; y *= lump * rngRange(rng, 0.65, 1.2); z *= lump * dent;
      fleck.copy(base);
      if (rng() < 0.08) fleck.set("#6a6a78");
      else fleck.offsetHSL(0, 0, (rng() - 0.5) * 0.1);
    }

    positions.push(x, y, z);
    colors.push(fleck.r, fleck.g, fleck.b);
  }
  return { positions, colors };
}

function buildOreGeometry(kind: OreKind, rng: RngStream, radius: number, facetLen: number): BufferGeometry {
  const detail = subdivForSize(radius, facetLen);
  const base = icosaVertices(radius);
  const { verts, faces } = subdivide(base, ICOSA_FACES, detail, radius);
  const { positions, colors } = deformVerts(verts, rng, kind);

  const triPos: number[] = [];
  const triNrm: number[] = [];
  const triCol: number[] = [];
  for (const face of faces) {
    const i0 = face[0], i1 = face[1], i2 = face[2];
    const ax = positions[i0 * 3], ay = positions[i0 * 3 + 1], az = positions[i0 * 3 + 2];
    const bx = positions[i1 * 3], by = positions[i1 * 3 + 1], bz = positions[i1 * 3 + 2];
    const cx = positions[i2 * 3], cy = positions[i2 * 3 + 1], cz = positions[i2 * 3 + 2];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    triPos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (let k = 0; k < 3; k++) triNrm.push(nx, ny, nz);
    triCol.push(
      colors[i0 * 3], colors[i0 * 3 + 1], colors[i0 * 3 + 2],
      colors[i1 * 3], colors[i1 * 3 + 1], colors[i1 * 3 + 2],
      colors[i2 * 3], colors[i2 * 3 + 1], colors[i2 * 3 + 2],
    );
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(triPos, 3));
  geo.setAttribute("normal", new Float32BufferAttribute(triNrm, 3));
  geo.setAttribute("color", new Float32BufferAttribute(triCol, 3));
  return geo;
}

function makeMaterial(kind: OreKind): Material {
  if (kind === "crystal") {
    const mat = new MeshPhysicalMaterial({
      color: 0xa8e8ff,
      vertexColors: true,
      metalness: 0.05,
      roughness: 0.08,
      transmission: 0.72,
      thickness: 0.85,
      ior: 1.55,
      transparent: true,
      opacity: 0.88,
      emissive: new Color("#4ec8ff"),
      emissiveIntensity: 0.28,
      flatShading: true,
    });
    (mat as Material & { fog?: boolean }).fog = false;
    return mat;
  }
  if (kind === "iron") {
    const mat = new MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      metalness: 0.88,
      roughness: 0.32,
      flatShading: true,
    });
    (mat as Material & { fog?: boolean }).fog = false;
    return mat;
  }
  if (kind === "copper") {
    const mat = new MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      metalness: 0.78,
      roughness: 0.38,
      flatShading: true,
    });
    (mat as Material & { fog?: boolean }).fog = false;
    return mat;
  }
  const mat = new MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    metalness: 0.15,
    roughness: 0.92,
    flatShading: true,
  });
  (mat as Material & { fog?: boolean }).fog = false;
  return mat;
}

export function createPlanetOre(
  planet: Planet,
  rng: RngStream,
): PlanetOre {
  const group = new Group();
  const centers: Vector3[] = [];
  const radii: number[] = [];
  const kinds: OreKind[] = [];

  const climate = planet.def.meta?.climate;
  const count = climate === "gas_giant"
    ? Math.floor(COUNT_BASE * 0.25)
    : COUNT_BASE + rngInt(rng, -20, 40);

  const facetLen = facetLength(planet);
  const up = new Vector3();
  const pos = new Vector3();
  const yUp = new Vector3(0, 1, 0);
  const qAlign = new Quaternion();
  const qSpin = new Quaternion();

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

    const eps = 0.015;
    const rA = planet.surfaceRadius(up.x + eps, up.y, up.z);
    const grade = Math.abs(rA - r) / (eps * Math.max(1, r));
    if (grade < 0.08 && rng() < 0.55) continue;

    const kind = pickKind(rng, climate);
    const sc = rngRange(rng, SCALE_MIN, SCALE_MAX);
    const sx = sc * rngRange(rng, 0.8, 1.25);
    const sy = sc * rngRange(rng, 0.65, 1.2);
    const sz = sc * rngRange(rng, 0.8, 1.25);
    const size = Math.max(sx, sy, sz);

    const geo = buildOreGeometry(kind, rng, 1, facetLen / Math.max(0.001, size));
    const mat = makeMaterial(kind);
    const mesh = new Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;

    pos.copy(up).multiplyScalar(r);
    pos.addScaledVector(up, sy * 0.2);
    qAlign.setFromUnitVectors(yUp, up);
    qSpin.setFromAxisAngle(up, rng() * Math.PI * 2);
    mesh.position.copy(pos);
    mesh.quaternion.copy(qSpin).premultiply(qAlign);
    mesh.scale.set(sx, sy, sz);

    group.add(mesh);
    centers.push(pos.clone());
    radii.push(size * (kind === "crystal" ? 0.85 : 0.7));
    kinds.push(kind);
    placed++;
  }

  return { group, centers, radii, kinds };
}
