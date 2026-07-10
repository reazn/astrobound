import { BufferGeometry, BufferAttribute } from "three";
import type { Planet } from "./planet";
import { buildMeshBuffers } from "./meshBuffers";
import type { LodWorkerRequest, LodWorkerResponse } from "./lodWorker";

export interface PlanetMesh {
  geometry: BufferGeometry;
  colliderVertices: Float32Array;
  colliderIndices: Uint32Array;
}

export function buildPlanetMesh(planet: Planet, segments?: number): PlanetMesh {
  const S = Math.max(8, segments ?? planet.def.faceSegments);
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
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(buffers.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(buffers.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(buffers.colors, 3));
  geometry.computeBoundingSphere();
  return {
    geometry,
    colliderVertices: buffers.colliderVertices,
    colliderIndices: buffers.colliderIndices,
  };
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

export function lodSegments(base: number): { high: number; mid: number; low: number } {
  // √2 on segments ≈ 2× triangle count (poly ∝ S²); liquid uses high.
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
): Promise<BufferGeometry> {
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
        resolve(geometryFromBuffers(res.positions, res.normals, res.colors));
      },
      reject,
    });
    getWorker().postMessage(req);
  });
}
