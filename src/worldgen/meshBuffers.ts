import type { PlanetDef } from "../content/planets/types";
import type { RampColors } from "./palette";

// Pure mesh build (no three.js) so it can run on a Web Worker. Returns
// transferable typed arrays for the visual mesh + optional collider.

export interface MeshBuffers {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  colliderVertices: Float32Array;
  colliderIndices: Uint32Array;
}

const FACES = [
  { dir: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { dir: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { dir: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
  { dir: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { dir: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { dir: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
] as const;

function spherify(x: number, y: number, z: number, out: [number, number, number]) {
  const x2 = x * x, y2 = y * y, z2 = z * z;
  out[0] = x * Math.sqrt(1 - y2 * 0.5 - z2 * 0.5 + (y2 * z2) / 3);
  out[1] = y * Math.sqrt(1 - z2 * 0.5 - x2 * 0.5 + (z2 * x2) / 3);
  out[2] = z * Math.sqrt(1 - x2 * 0.5 - y2 * 0.5 + (x2 * y2) / 3);
  const len = Math.hypot(out[0], out[1], out[2]) || 1;
  out[0] /= len; out[1] /= len; out[2] /= len;
}

function sampleGradient(
  stops: readonly (readonly [number, [number, number, number]])[],
  t: number,
  out: [number, number, number],
) {
  if (t <= stops[0][0]) {
    out[0] = stops[0][1][0]; out[1] = stops[0][1][1]; out[2] = stops[0][1][2];
    return;
  }
  const last = stops[stops.length - 1];
  if (t >= last[0]) {
    out[0] = last[1][0]; out[1] = last[1][1]; out[2] = last[1][2];
    return;
  }
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [s0, c0] = stops[i - 1];
      const [s1, c1] = stops[i];
      const k = (t - s0) / (s1 - s0);
      out[0] = c0[0] + (c1[0] - c0[0]) * k;
      out[1] = c0[1] + (c1[1] - c0[1]) * k;
      out[2] = c0[2] + (c1[2] - c0[2]) * k;
      return;
    }
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function lerpRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function buildMeshBuffers(
  surfaceRadius: (nx: number, ny: number, nz: number) => number,
  minR: number,
  maxR: number,
  palette: RampColors,
  mottleFreq: number,
  segments: number,
  includeCollider: boolean,
  seaLevel?: number,
): MeshBuffers {
  const S = Math.max(8, segments);
  const perFace = (S + 1) * (S + 1);
  const vertexCount = perFace * 6;
  const sharedPos = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(6 * S * S * 6);

  const dir: [number, number, number] = [0, 0, 0];
  let vOff = 0;
  let iOff = 0;

  for (const face of FACES) {
    const faceBase = vOff / 3;
    for (let j = 0; j <= S; j++) {
      const b = (j / S) * 2 - 1;
      for (let i = 0; i <= S; i++) {
        const a = (i / S) * 2 - 1;
        const cx = face.dir[0] + face.u[0] * a + face.v[0] * b;
        const cy = face.dir[1] + face.u[1] * a + face.v[1] * b;
        const cz = face.dir[2] + face.u[2] * a + face.v[2] * b;
        spherify(cx, cy, cz, dir);
        const r = surfaceRadius(dir[0], dir[1], dir[2]);
        sharedPos[vOff++] = dir[0] * r;
        sharedPos[vOff++] = dir[1] * r;
        sharedPos[vOff++] = dir[2] * r;
      }
    }
    const row = S + 1;
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const aI = faceBase + i + j * row;
        const bI = aI + 1;
        const cI = aI + row;
        const dI = cI + 1;
        indices[iOff++] = aI;
        indices[iOff++] = bI;
        indices[iOff++] = dI;
        indices[iOff++] = aI;
        indices[iOff++] = dI;
        indices[iOff++] = cI;
      }
    }
  }

  const lowland = hexToRgb(palette.lowland);
  const mid = hexToRgb(palette.mid);
  const highland = hexToRgb(palette.highland);
  const rock = hexToRgb(palette.rock);
  const peak = hexToRgb(palette.peak);
  const heightStops: readonly (readonly [number, [number, number, number]])[] = [
    [0.0, lowland],
    [0.22, lerpRgb(lowland, mid, 0.35)],
    [0.4, mid],
    [0.62, highland],
    [0.82, lerpRgb(highland, rock, 0.4)],
    [1.0, peak],
  ];

  const triCount = indices.length / 3;
  const positions = new Float32Array(triCount * 9);
  const normals = new Float32Array(triCount * 9);
  const colors = new Float32Array(triCount * 9);
  const invRange = 1 / Math.max(0.0001, maxR - minR);
  const col: [number, number, number] = [0, 0, 0];
  const mf = mottleFreq;

  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];
    const ax = sharedPos[i0 * 3], ay = sharedPos[i0 * 3 + 1], az = sharedPos[i0 * 3 + 2];
    const bx = sharedPos[i1 * 3], by = sharedPos[i1 * 3 + 1], bz = sharedPos[i1 * 3 + 2];
    const cx = sharedPos[i2 * 3], cy = sharedPos[i2 * 3 + 1], cz = sharedPos[i2 * 3 + 2];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;

    const mx = (ax + bx + cx) / 3;
    const my = (ay + by + cy) / 3;
    const mz = (az + bz + cz) / 3;
    const surfaceR = Math.hypot(mx, my, mz) || 1;
    const rx = mx / surfaceR, ry = my / surfaceR, rz = mz / surfaceR;
    const slope01 = Math.min(1, Math.max(0, 1 - (nx * rx + ny * ry + nz * rz)));
    const heightNorm = (surfaceR - minR) * invRange;
    const mottle =
      Math.sin(mx * mf * 0.05) * Math.cos(mz * mf * 0.05) * 0.4 +
      Math.sin(my * mf * 0.11 + mx * mf * 0.07) * 0.3 +
      Math.sin((mx + mz) * mf * 0.18) * Math.cos(my * mf * 0.14) * 0.35;

    sampleGradient(heightStops, heightNorm, col);
    if (seaLevel !== undefined && surfaceR < seaLevel) {
      col[0] *= 0.45; col[1] *= 0.5; col[2] *= 0.55;
    }
    const rockBlend = Math.min(1, Math.max(0, (slope01 - 0.22) / 0.4));
    col[0] += (rock[0] - col[0]) * rockBlend * 0.95;
    col[1] += (rock[1] - col[1]) * rockBlend * 0.95;
    col[2] += (rock[2] - col[2]) * rockBlend * 0.95;
    if (heightNorm > 0.72) {
      const pk = (heightNorm - 0.72) / 0.28 * 0.55;
      col[0] += (peak[0] - col[0]) * pk;
      col[1] += (peak[1] - col[1]) * pk;
      col[2] += (peak[2] - col[2]) * pk;
    }
    const m = 1 + mottle * 0.16;
    col[0] *= m; col[1] *= m; col[2] *= m;

    const o = t * 9;
    positions[o] = ax; positions[o + 1] = ay; positions[o + 2] = az;
    positions[o + 3] = bx; positions[o + 4] = by; positions[o + 5] = bz;
    positions[o + 6] = cx; positions[o + 7] = cy; positions[o + 8] = cz;
    for (let k = 0; k < 3; k++) {
      normals[o + k * 3] = nx;
      normals[o + k * 3 + 1] = ny;
      normals[o + k * 3 + 2] = nz;
      colors[o + k * 3] = col[0];
      colors[o + k * 3 + 1] = col[1];
      colors[o + k * 3 + 2] = col[2];
    }
  }

  return {
    positions,
    normals,
    colors,
    colliderVertices: includeCollider ? sharedPos.slice() : new Float32Array(0),
    colliderIndices: includeCollider ? indices.slice() : new Uint32Array(0),
  };
}

export type WorkerPlanetPayload = {
  id: string;
  def: PlanetDef;
  seed: string;
  segments: number;
  includeCollider: boolean;
  seaLevel: number;
};
