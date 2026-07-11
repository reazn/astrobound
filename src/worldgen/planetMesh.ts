import { BufferGeometry, BufferAttribute, Group, Mesh, type Material } from "three";
import type { Planet } from "./planet";
import { buildMeshBuffers } from "./meshBuffers";
import type { LodWorkerRequest, LodWorkerResponse } from "./lodWorker";

export interface PlanetMesh {
  group: Group;
  faces: Mesh[];
  geometries: BufferGeometry[];
  segments: number;
  colliderVertices: Float32Array;
  colliderIndices: Uint32Array;
  disposeGeometries(): void;
}

export function geometryFromBuffers(
  positions: Float32Array,
  normals: Float32Array,
  colors: Float32Array,
): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export function splitCubeFaceGeometries(
  positions: Float32Array,
  normals: Float32Array,
  colors: Float32Array,
  segments: number,
): BufferGeometry[] {
  const S = Math.max(8, segments);
  const floatsPerFace = S * S * 2 * 9;
  const geos: BufferGeometry[] = [];
  for (let f = 0; f < 6; f++) {
    const a = f * floatsPerFace;
    const b = a + floatsPerFace;
    if (b > positions.length) break;
    const geo = geometryFromBuffers(
      positions.slice(a, b),
      normals.slice(a, b),
      colors.slice(a, b),
    );
    geo.userData.faceIndex = f;
    geos.push(geo);
  }
  return geos;
}

export function createFaceGroup(
  geometries: BufferGeometry[],
  material: Material,
): { group: Group; faces: Mesh[] } {
  const group = new Group();
  const faces: Mesh[] = [];
  for (let i = 0; i < geometries.length; i++) {
    const mesh = new Mesh(geometries[i], material);
    mesh.userData.faceIndex = i;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = true;
    group.add(mesh);
    faces.push(mesh);
  }
  return { group, faces };
}

export function buildPlanetMesh(planet: Planet, segments: number, material: Material): PlanetMesh {
  const S = Math.max(8, segments);
  const buffers = buildMeshBuffers(
    (nx, ny, nz) => planet.surfaceRadius(nx, ny, nz),
    planet.minR,
    planet.maxR,
    planet.def.palette,
    planet.def.noise.mottleFreq,
    S,
    true,
    planet.seaLevel,
  );
  const geometries = splitCubeFaceGeometries(
    buffers.positions, buffers.normals, buffers.colors, S,
  );
  const { group, faces } = createFaceGroup(geometries, material);
  return {
    group,
    faces,
    geometries,
    segments: S,
    colliderVertices: buffers.colliderVertices,
    colliderIndices: buffers.colliderIndices,
    disposeGeometries() {
      for (const g of geometries) g.dispose();
    },
  };
}

export function lodSegments(base: number): { high: number; mid: number; low: number } {
  const high = Math.max(48, Math.round(base * 1.15 * Math.SQRT2));
  return {
    high,
    mid: Math.max(28, Math.round(high / 5)),
    low: Math.max(12, Math.round(high / 12)),
  };
}

let worker: Worker | null = null;
let nextJobId = 1;
const pending = new Map<number, {
  resolve: (v: LodWorkerResponse) => void;
  reject: (e: Error) => void;
}>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./lodWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev: MessageEvent<LodWorkerResponse>) => {
      const job = pending.get(ev.data.jobId);
      if (!job) return;
      pending.delete(ev.data.jobId);
      job.resolve(ev.data);
    };
    worker.onerror = (err) => {
      for (const [, job] of pending) job.reject(new Error(err.message));
      pending.clear();
    };
  }
  return worker;
}

export function buildPlanetMeshAsync(
  def: Planet["def"],
  seed: string,
  segments: number,
  seaLevel: number,
): Promise<BufferGeometry[]> {
  const jobId = nextJobId++;
  const req: LodWorkerRequest = {
    jobId,
    payload: { id: def.id, def, seed, segments, includeCollider: false, seaLevel },
  };
  return new Promise((resolve, reject) => {
    pending.set(jobId, {
      resolve: (res) => {
        if (!res.ok) {
          reject(new Error(res.error));
          return;
        }
        resolve(splitCubeFaceGeometries(res.positions, res.normals, res.colors, segments));
      },
      reject,
    });
    getWorker().postMessage(req);
  });
}
