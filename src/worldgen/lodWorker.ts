/// <reference lib="webworker" />
import { createRng } from "../engine/rng";
import { createPlanet } from "./planet";
import { buildMeshBuffers, type WorkerPlanetPayload } from "./meshBuffers";

export type LodWorkerRequest = {
  jobId: number;
  payload: WorkerPlanetPayload;
};

export type LodWorkerResponse = {
  jobId: number;
  ok: true;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
} | {
  jobId: number;
  ok: false;
  error: string;
};

self.onmessage = (ev: MessageEvent<LodWorkerRequest>) => {
  const { jobId, payload } = ev.data;
  try {
    const rng = createRng(payload.seed);
    const planet = createPlanet(payload.def, rng.world);
    const buffers = buildMeshBuffers(
      (nx, ny, nz) => planet.surfaceRadius(nx, ny, nz),
      planet.minR,
      planet.maxR,
      payload.def.palette,
      payload.def.noise.mottleFreq,
      payload.segments,
      false,
      payload.seaLevel,
    );
    const res: LodWorkerResponse = {
      jobId,
      ok: true,
      positions: buffers.positions,
      normals: buffers.normals,
      colors: buffers.colors,
    };
    (self as DedicatedWorkerGlobalScope).postMessage(res, [
      buffers.positions.buffer,
      buffers.normals.buffer,
      buffers.colors.buffer,
    ]);
  } catch (e) {
    const res: LodWorkerResponse = {
      jobId,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
    (self as DedicatedWorkerGlobalScope).postMessage(res);
  }
};
