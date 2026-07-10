import {
  Group, Mesh, BufferGeometry, BufferAttribute, MeshToonMaterial, Color, Vector3,
} from "three";
import type { RngStream } from "../engine/rng";
import { rngRange } from "../engine/rng";
import type { Planet } from "../worldgen/planet";
import { marchCubes } from "../worldgen/marchingCubes";
import { toonGradient } from "./toonMaterial";

export interface CaveColliderMesh {
  vertices: Float32Array;
  indices: Uint32Array;
}

export interface PlanetCaves {
  group: Group;
  colliders: CaveColliderMesh[];
  entrances: Vector3[];
  dispose(): void;
}

interface Chamber {
  x: number;
  y: number;
  z: number;
  r: number;
  lava: boolean;
}

const sdSphere = (px: number, py: number, pz: number, cx: number, cy: number, cz: number, r: number) =>
  Math.hypot(px - cx, py - cy, pz - cz) - r;

const sdCapsule = (
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  r: number,
) => {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const ab2 = abx * abx + aby * aby + abz * abz || 1;
  let t = (apx * abx + apy * aby + apz * abz) / ab2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(apx - abx * t, apy - aby * t, apz - abz * t) - r;
};

const basisFromUp = (up: Vector3) => {
  const right = new Vector3();
  if (Math.abs(up.y) < 0.9) right.set(0, 1, 0).cross(up).normalize();
  else right.set(1, 0, 0).cross(up).normalize();
  const forward = new Vector3().crossVectors(up, right).normalize();
  return { right, forward, up: up.clone().normalize() };
};

const fibonacciDir = (i: number, n: number, out: Vector3) => {
  const t = (i + 0.5) / n;
  const y = 1 - 2 * t;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const phi = i * 2.399963229728653;
  out.set(Math.cos(phi) * r, y, Math.sin(phi) * r);
  return out;
};

const hexRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export function createPlanetCaves(planet: Planet, rng: RngStream): PlanetCaves {
  const group = new Group();
  const colliders: CaveColliderMesh[] = [];
  const entrances: Vector3[] = [];
  const climate = planet.climate;
  if (climate === "gas_giant" || planet.terrain.caveMouthWeight < 0.05) {
    return { group, colliders, entrances, dispose() {} };
  }

  const want = climate === "scorched" ? 7
    : climate === "arid" ? 5
    : climate === "ice" ? 4
    : 6;
  const sampleN = 1800;
  const candidates: { score: number; dir: Vector3; r: number }[] = [];
  const dir = new Vector3();
  const sea = planet.def.liquid ? planet.seaLevel : planet.minR;

  for (let i = 0; i < sampleN; i++) {
    fibonacciDir(i, sampleN, dir);
    const mouth = planet.caveMouthAt(dir.x, dir.y, dir.z);
    if (mouth < 0.42) continue;
    const r = planet.surfaceRadius(dir.x, dir.y, dir.z);
    if (r < sea + 12) continue;
    candidates.push({ score: mouth + rng() * 0.08, dir: dir.clone(), r });
  }
  candidates.sort((a, b) => b.score - a.score);

  const picked: typeof candidates = [];
  for (const c of candidates) {
    if (picked.length >= want) break;
    let ok = true;
    for (const p of picked) {
      if (c.dir.dot(p.dir) > 0.92) { ok = false; break; }
    }
    if (ok) picked.push(c);
  }

  const rockHex = planet.biomeColors.rock;
  const caveHex = planet.biomeColors.cave_mouth;
  const rockCol = hexRgb(rockHex);
  const caveCol = hexRgb(caveHex);
  const rockMat = new MeshToonMaterial({
    vertexColors: true,
    gradientMap: toonGradient(),
    fog: false,
  });
  const lavaMat = new MeshToonMaterial({
    color: new Color("#ff5a14"),
    emissive: new Color("#ff3a08"),
    emissiveIntensity: 0.85,
    gradientMap: toonGradient(),
    fog: false,
  });

  for (const site of picked) {
    const { right, forward, up } = basisFromUp(site.dir);
    entrances.push(up.clone().multiplyScalar(site.r));

    const chambers: Chamber[] = [];
    const shaftDepth = rngRange(rng, 55, 95);
    const mainR = rngRange(rng, 38, 62);
    chambers.push({
      x: 0,
      y: -shaftDepth - mainR * 0.35,
      z: 0,
      r: mainR,
      lava: climate === "scorched" ? rng() < 0.75 : rng() < 0.35,
    });

    const sideN = 1 + Math.floor(rng() * 3);
    for (let s = 0; s < sideN; s++) {
      const ang = rng() * Math.PI * 2;
      const dist = rngRange(rng, mainR * 0.9, mainR * 1.8);
      const sr = rngRange(rng, 22, 42);
      chambers.push({
        x: Math.cos(ang) * dist,
        y: chambers[0].y + rngRange(rng, -28, 18),
        z: Math.sin(ang) * dist,
        r: sr,
        lava: climate === "scorched" ? rng() < 0.55 : rng() < 0.22,
      });
    }

    const minY = Math.min(...chambers.map((c) => c.y - c.r)) - 8;
    const maxY = 18;
    const maxXZ = Math.max(...chambers.map((c) => Math.hypot(c.x, c.z) + c.r)) + 16;
    const extentY = maxY - minY;
    const extentXZ = maxXZ * 2;
    const cell = Math.max(3.2, Math.min(extentXZ, extentY) / 36);
    const resX = Math.ceil(extentXZ / cell);
    const resY = Math.ceil(extentY / cell);
    const resZ = Math.ceil(extentXZ / cell);
    const res = Math.min(42, Math.max(resX, resY, resZ));
    const origin: [number, number, number] = [
      -res * cell * 0.5,
      minY,
      -res * cell * 0.5,
    ];

    const detail = (x: number, y: number, z: number) => {
      const n1 = Math.sin(x * 0.11 + z * 0.09) * Math.cos(y * 0.13);
      const n2 = Math.sin(x * 0.23 - y * 0.17 + z * 0.19) * 0.55;
      return n1 * 2.2 + n2 * 1.6;
    };

    const sample = (lx: number, ly: number, lz: number) => {
      let d = sdCapsule(lx, ly, lz, 0, 10, 0, 0, -shaftDepth, 0, 9.5);
      for (const c of chambers) {
        d = Math.min(d, sdSphere(lx, ly, lz, c.x, c.y, c.z, c.r));
      }
      for (let i = 1; i < chambers.length; i++) {
        const a = chambers[0], b = chambers[i];
        d = Math.min(d, sdCapsule(lx, ly, lz, a.x, a.y, a.z, b.x, b.y, b.z, 10));
      }
      d += detail(lx, ly, lz);
      return d;
    };

    const meshData = marchCubes(res, origin, cell, sample, 0);
    if (meshData.indices.length < 30) continue;

    const colors = new Float32Array(meshData.positions.length);
    for (let i = 0; i < meshData.positions.length; i += 3) {
      const ly = meshData.positions[i + 1];
      const deep = Math.min(1, Math.max(0, (-ly - 20) / 80));
      colors[i] = rockCol[0] + (caveCol[0] - rockCol[0]) * deep;
      colors[i + 1] = rockCol[1] + (caveCol[1] - rockCol[1]) * deep;
      colors[i + 2] = rockCol[2] + (caveCol[2] - rockCol[2]) * deep;
      const m = 0.88 + (Math.sin(meshData.positions[i] * 0.07) * 0.06);
      colors[i] *= m; colors[i + 1] *= m; colors[i + 2] *= m;
    }

    const worldPos = new Float32Array(meshData.positions.length);
    const worldNrm = new Float32Array(meshData.normals.length);
    const entrance = up.clone().multiplyScalar(site.r);
    for (let i = 0; i < meshData.positions.length; i += 3) {
      const lx = meshData.positions[i];
      const ly = meshData.positions[i + 1];
      const lz = meshData.positions[i + 2];
      const wx = entrance.x + right.x * lx + up.x * ly + forward.x * lz;
      const wy = entrance.y + right.y * lx + up.y * ly + forward.y * lz;
      const wz = entrance.z + right.z * lx + up.z * ly + forward.z * lz;
      worldPos[i] = wx; worldPos[i + 1] = wy; worldPos[i + 2] = wz;

      const nx = meshData.normals[i], ny = meshData.normals[i + 1], nz = meshData.normals[i + 2];
      const nnx = right.x * nx + up.x * ny + forward.x * nz;
      const nny = right.y * nx + up.y * ny + forward.y * nz;
      const nnz = right.z * nx + up.z * ny + forward.z * nz;
      const nl = Math.hypot(nnx, nny, nnz) || 1;
      worldNrm[i] = nnx / nl; worldNrm[i + 1] = nny / nl; worldNrm[i + 2] = nnz / nl;
    }

    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(worldPos, 3));
    geo.setAttribute("normal", new BufferAttribute(worldNrm, 3));
    geo.setAttribute("color", new BufferAttribute(colors, 3));
    geo.setIndex(new BufferAttribute(meshData.indices, 1));
    const wall = new Mesh(geo, rockMat);
    wall.frustumCulled = true;
    wall.renderOrder = 1;
    group.add(wall);

    colliders.push({ vertices: worldPos, indices: meshData.indices });

    for (const c of chambers) {
      if (!c.lava) continue;
      const lavaY = c.y - c.r * 0.72;
      const lavaR = c.r * 0.62;
      const segs = 18;
      const lPos: number[] = [];
      const lNrm: number[] = [];
      const lIdx: number[] = [];
      const centerLocal = [c.x, lavaY, c.z] as const;
      const pushWorld = (lx: number, ly: number, lz: number) => {
        const wx = entrance.x + right.x * lx + up.x * ly + forward.x * lz;
        const wy = entrance.y + right.y * lx + up.y * ly + forward.y * lz;
        const wz = entrance.z + right.z * lx + up.z * ly + forward.z * lz;
        lPos.push(wx, wy, wz);
        lNrm.push(up.x, up.y, up.z);
      };
      pushWorld(centerLocal[0], centerLocal[1], centerLocal[2]);
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const ripple = 1 + Math.sin(a * 3.0) * 0.06;
        pushWorld(
          c.x + Math.cos(a) * lavaR * ripple,
          lavaY + 0.4,
          c.z + Math.sin(a) * lavaR * ripple,
        );
      }
      for (let i = 0; i < segs; i++) {
        lIdx.push(0, i + 1, i + 2);
      }
      const lGeo = new BufferGeometry();
      lGeo.setAttribute("position", new BufferAttribute(new Float32Array(lPos), 3));
      lGeo.setAttribute("normal", new BufferAttribute(new Float32Array(lNrm), 3));
      lGeo.setIndex(lIdx);
      const lavaMesh = new Mesh(lGeo, lavaMat);
      lavaMesh.renderOrder = 2;
      group.add(lavaMesh);
    }
  }

  return {
    group,
    colliders,
    entrances,
    dispose() {
      group.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        m.geometry?.dispose();
      });
      rockMat.dispose();
      lavaMat.dispose();
    },
  };
}
