import type { PlanetDef } from "../content/planets/types";
import type { BiomeId, BiomeColors } from "../content/planets/biomes";
import type { RampColors } from "./palette";

// Mesh buffers for one cube-face UV patch (quadtree leaf). Pure typed arrays
// so builds can run on a worker.

export const CUBE_FACES = [
  { dir: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { dir: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { dir: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
  { dir: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { dir: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { dir: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
] as const;

export function spherify(x: number, y: number, z: number, out: [number, number, number]) {
  const x2 = x * x, y2 = y * y, z2 = z * z;
  out[0] = x * Math.sqrt(1 - y2 * 0.5 - z2 * 0.5 + (y2 * z2) / 3);
  out[1] = y * Math.sqrt(1 - z2 * 0.5 - x2 * 0.5 + (z2 * x2) / 3);
  out[2] = z * Math.sqrt(1 - x2 * 0.5 - y2 * 0.5 + (x2 * y2) / 3);
  const len = Math.hypot(out[0], out[1], out[2]) || 1;
  out[0] /= len; out[1] /= len; out[2] /= len;
}

export interface ChunkBiomeOpts {
  biomeAt: (nx: number, ny: number, nz: number) => BiomeId;
  biomeWeights?: (nx: number, ny: number, nz: number) => Partial<Record<BiomeId, number>>;
  colors: BiomeColors;
}

function mixBiomeColor(
  biome: ChunkBiomeOpts,
  rx: number, ry: number, rz: number,
  out: [number, number, number],
) {
  if (biome.biomeWeights) {
    const w = biome.biomeWeights(rx, ry, rz);
    let r = 0, g = 0, b = 0, sum = 0;
    for (const id of Object.keys(w) as BiomeId[]) {
      const wt = w[id] ?? 0;
      if (wt < 0.01) continue;
      const c = hexToRgb(biome.colors[id]);
      r += c[0] * wt; g += c[1] * wt; b += c[2] * wt;
      sum += wt;
    }
    if (sum > 1e-4) {
      out[0] = r / sum; out[1] = g / sum; out[2] = b / sum;
      return;
    }
  }
  const bc = hexToRgb(biome.colors[biome.biomeAt(rx, ry, rz)]);
  out[0] = bc[0]; out[1] = bc[1]; out[2] = bc[2];
}

function projectOnSurface(
  surfaceRadius: (nx: number, ny: number, nz: number) => number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
): [number, number, number] {
  const mx = (ax + bx) * 0.5;
  const my = (ay + by) * 0.5;
  const mz = (az + bz) * 0.5;
  const len = Math.hypot(mx, my, mz) || 1;
  const nx = mx / len, ny = my / len, nz = mz / len;
  const r = surfaceRadius(nx, ny, nz);
  return [nx * r, ny * r, nz * r];
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

export interface ChunkMeshBuffers {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  center: [number, number, number];
  boundRadius: number;
  cullRadius: number;
}

export function buildChunkBuffers(
  surfaceRadius: (nx: number, ny: number, nz: number) => number,
  minR: number,
  maxR: number,
  palette: RampColors,
  mottleFreq: number,
  faceIndex: number,
  u0: number,
  v0: number,
  size: number,
  segments: number,
  seaLevel?: number,
  withSkirts = true,
  biome?: ChunkBiomeOpts,
): ChunkMeshBuffers {
  const face = CUBE_FACES[faceIndex];
  const S = Math.max(2, segments);
  const pad = size / S * 0.4;
  const uPad = u0 - pad;
  const vPad = v0 - pad;
  const sizePad = size + pad * 2;
  const row = S + 1;
  const gridN = row * row;
  const sharedPos = new Float32Array(gridN * 3);
  const dir: [number, number, number] = [0, 0, 0];
  let vOff = 0;

  for (let j = 0; j <= S; j++) {
    const b = vPad + (j / S) * sizePad;
    for (let i = 0; i <= S; i++) {
      const a = uPad + (i / S) * sizePad;
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

  const verts = new Float32Array((gridN + S * S * 5) * 3);
  verts.set(sharedPos);
  let vertCount = gridN;
  const indices = new Uint32Array(S * S * 24);
  let iOff = 0;
  const steepThresh = (maxR - minR) * 0.045;

  const pushVert = (x: number, y: number, z: number): number => {
    const i = vertCount++;
    verts[i * 3] = x;
    verts[i * 3 + 1] = y;
    verts[i * 3 + 2] = z;
    return i;
  };

  const emitTri = (a: number, b: number, c: number) => {
    indices[iOff++] = a;
    indices[iOff++] = b;
    indices[iOff++] = c;
  };

  const radiusAt = (i: number) => Math.hypot(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]);
  const chord = (a: number, b: number) => {
    const dx = verts[a * 3] - verts[b * 3];
    const dy = verts[a * 3 + 1] - verts[b * 3 + 1];
    const dz = verts[a * 3 + 2] - verts[b * 3 + 2];
    return Math.hypot(dx, dy, dz);
  };

  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const aI = i + j * row;
      const bI = aI + 1;
      const cI = aI + row;
      const dI = cI + 1;
      const rA = radiusAt(aI), rB = radiusAt(bI), rC = radiusAt(cI), rD = radiusAt(dI);
      const rMin = Math.min(rA, rB, rC, rD);
      const rMax = Math.max(rA, rB, rC, rD);
      const maxDelta = rMax - rMin;
      const avgChord = (chord(aI, bI) + chord(bI, dI) + chord(dI, cI) + chord(cI, aI)) * 0.25;
      if (maxDelta > 0.75 * avgChord || maxDelta > steepThresh) {
        const mAB = projectOnSurface(
          surfaceRadius,
          verts[aI * 3], verts[aI * 3 + 1], verts[aI * 3 + 2],
          verts[bI * 3], verts[bI * 3 + 1], verts[bI * 3 + 2],
        );
        const mBD = projectOnSurface(
          surfaceRadius,
          verts[bI * 3], verts[bI * 3 + 1], verts[bI * 3 + 2],
          verts[dI * 3], verts[dI * 3 + 1], verts[dI * 3 + 2],
        );
        const mDC = projectOnSurface(
          surfaceRadius,
          verts[dI * 3], verts[dI * 3 + 1], verts[dI * 3 + 2],
          verts[cI * 3], verts[cI * 3 + 1], verts[cI * 3 + 2],
        );
        const mCA = projectOnSurface(
          surfaceRadius,
          verts[cI * 3], verts[cI * 3 + 1], verts[cI * 3 + 2],
          verts[aI * 3], verts[aI * 3 + 1], verts[aI * 3 + 2],
        );
        const cx4 = (verts[aI * 3] + verts[bI * 3] + verts[cI * 3] + verts[dI * 3]) * 0.25;
        const cy4 = (verts[aI * 3 + 1] + verts[bI * 3 + 1] + verts[cI * 3 + 1] + verts[dI * 3 + 1]) * 0.25;
        const cz4 = (verts[aI * 3 + 2] + verts[bI * 3 + 2] + verts[cI * 3 + 2] + verts[dI * 3 + 2]) * 0.25;
        const clen = Math.hypot(cx4, cy4, cz4) || 1;
        const cnx = cx4 / clen, cny = cy4 / clen, cnz = cz4 / clen;
        const cr = surfaceRadius(cnx, cny, cnz);
        const iAB = pushVert(mAB[0], mAB[1], mAB[2]);
        const iBD = pushVert(mBD[0], mBD[1], mBD[2]);
        const iDC = pushVert(mDC[0], mDC[1], mDC[2]);
        const iCA = pushVert(mCA[0], mCA[1], mCA[2]);
        const iCtr = pushVert(cnx * cr, cny * cr, cnz * cr);
        emitTri(aI, iAB, iCtr);
        emitTri(iAB, bI, iCtr);
        emitTri(bI, iBD, iCtr);
        emitTri(iBD, dI, iCtr);
        emitTri(dI, iDC, iCtr);
        emitTri(iDC, cI, iCtr);
        emitTri(cI, iCA, iCtr);
        emitTri(iCA, aI, iCtr);
      } else {
        emitTri(aI, bI, dI);
        emitTri(aI, dI, cI);
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
    [0.18, lerpRgb(lowland, mid, 0.4)],
    [0.38, mid],
    [0.58, highland],
    [0.78, lerpRgb(highland, rock, 0.35)],
    [1.0, peak],
  ];

  const triCount = iOff / 3;
  const positions = new Float32Array(triCount * 9);
  const normals = new Float32Array(triCount * 9);
  const colors = new Float32Array(triCount * 9);
  const invRange = 1 / Math.max(0.0001, maxR - minR);
  const col: [number, number, number] = [0, 0, 0];
  const mf = mottleFreq;

  const vertN = new Float32Array(vertCount * 3);
  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];
    const ax = verts[i0 * 3], ay = verts[i0 * 3 + 1], az = verts[i0 * 3 + 2];
    const bx = verts[i1 * 3], by = verts[i1 * 3 + 1], bz = verts[i1 * 3 + 2];
    const cxp = verts[i2 * 3], cyp = verts[i2 * 3 + 1], czp = verts[i2 * 3 + 2];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cxp - ax, e2y = cyp - ay, e2z = czp - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    vertN[i0 * 3] += nx; vertN[i0 * 3 + 1] += ny; vertN[i0 * 3 + 2] += nz;
    vertN[i1 * 3] += nx; vertN[i1 * 3 + 1] += ny; vertN[i1 * 3 + 2] += nz;
    vertN[i2 * 3] += nx; vertN[i2 * 3 + 1] += ny; vertN[i2 * 3 + 2] += nz;
  }
  for (let i = 0; i < vertCount; i++) {
    const nx = vertN[i * 3], ny = vertN[i * 3 + 1], nz = vertN[i * 3 + 2];
    const nl = Math.hypot(nx, ny, nz) || 1;
    vertN[i * 3] = nx / nl;
    vertN[i * 3 + 1] = ny / nl;
    vertN[i * 3 + 2] = nz / nl;
  }

  let cx = 0, cy = 0, cz = 0;
  let maxD2 = 0;

  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];
    const ax = verts[i0 * 3], ay = verts[i0 * 3 + 1], az = verts[i0 * 3 + 2];
    const bx = verts[i1 * 3], by = verts[i1 * 3 + 1], bz = verts[i1 * 3 + 2];
    const cxp = verts[i2 * 3], cyp = verts[i2 * 3 + 1], czp = verts[i2 * 3 + 2];
    const n0x = vertN[i0 * 3], n0y = vertN[i0 * 3 + 1], n0z = vertN[i0 * 3 + 2];
    const n1x = vertN[i1 * 3], n1y = vertN[i1 * 3 + 1], n1z = vertN[i1 * 3 + 2];
    const n2x = vertN[i2 * 3], n2y = vertN[i2 * 3 + 1], n2z = vertN[i2 * 3 + 2];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cxp - ax, e2y = cyp - ay, e2z = czp - az;
    let fnx = e1y * e2z - e1z * e2y;
    let fny = e1z * e2x - e1x * e2z;
    let fnz = e1x * e2y - e1y * e2x;
    const fnl = Math.hypot(fnx, fny, fnz) || 1;
    fnx /= fnl; fny /= fnl; fnz /= fnl;

    const mx = (ax + bx + cxp) / 3;
    const my = (ay + by + cyp) / 3;
    const mz = (az + bz + czp) / 3;
    cx += mx; cy += my; cz += mz;
    const surfaceR = Math.hypot(mx, my, mz) || 1;
    const rx = mx / surfaceR, ry = my / surfaceR, rz = mz / surfaceR;
    const slope01 = Math.min(1, Math.max(0, 1 - (fnx * rx + fny * ry + fnz * rz)));
    const heightNorm = (surfaceR - minR) * invRange;
    const mottle =
      Math.sin(mx * mf * 0.05) * Math.cos(mz * mf * 0.05) * 0.4 +
      Math.sin(my * mf * 0.11 + mx * mf * 0.07) * 0.3 +
      Math.sin((mx + mz) * mf * 0.18) * Math.cos(my * mf * 0.14) * 0.35;

    if (biome) {
      mixBiomeColor(biome, rx, ry, rz, col);
    } else {
      sampleGradient(heightStops, heightNorm, col);
      if (seaLevel !== undefined && surfaceR < seaLevel) {
        col[0] *= 0.45; col[1] *= 0.5; col[2] *= 0.55;
      }
      if (heightNorm > 0.7) {
        const pk = (heightNorm - 0.7) / 0.3 * 0.55;
        col[0] += (peak[0] - col[0]) * pk;
        col[1] += (peak[1] - col[1]) * pk;
        col[2] += (peak[2] - col[2]) * pk;
      }
    }
    const rockBlend = Math.min(1, Math.max(0, (slope01 - 0.26) / 0.42));
    col[0] += (rock[0] - col[0]) * rockBlend * 0.9;
    col[1] += (rock[1] - col[1]) * rockBlend * 0.9;
    col[2] += (rock[2] - col[2]) * rockBlend * 0.9;
    const m = 1 + mottle * 0.14;
    col[0] *= m; col[1] *= m; col[2] *= m;

    const o = t * 9;
    positions[o] = ax; positions[o + 1] = ay; positions[o + 2] = az;
    positions[o + 3] = bx; positions[o + 4] = by; positions[o + 5] = bz;
    positions[o + 6] = cxp; positions[o + 7] = cyp; positions[o + 8] = czp;
    normals[o] = n0x; normals[o + 1] = n0y; normals[o + 2] = n0z;
    normals[o + 3] = n1x; normals[o + 4] = n1y; normals[o + 5] = n1z;
    normals[o + 6] = n2x; normals[o + 7] = n2y; normals[o + 8] = n2z;
    for (let k = 0; k < 3; k++) {
      colors[o + k * 3] = col[0];
      colors[o + k * 3 + 1] = col[1];
      colors[o + k * 3 + 2] = col[2];
    }
  }

  cx /= triCount; cy /= triCount; cz /= triCount;
  for (let i = 0; i < sharedPos.length; i += 3) {
    const dx = sharedPos[i] - cx;
    const dy = sharedPos[i + 1] - cy;
    const dz = sharedPos[i + 2] - cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > maxD2) maxD2 = d2;
  }
  const cullRadius = Math.sqrt(maxD2) * 1.08;
  const skirtDrop = Math.max((maxR - minR) * 0.55, 800);

  if (!withSkirts) {
    return {
      positions,
      normals,
      colors,
      center: [cx, cy, cz],
      boundRadius: cullRadius,
      cullRadius,
    };
  }

  const skirtEdgeCount = S * 4;
  const skirtPositions = new Float32Array((triCount + skirtEdgeCount * 2) * 9);
  const skirtNormals = new Float32Array(skirtPositions.length);
  const skirtColors = new Float32Array(skirtPositions.length);
  skirtPositions.set(positions);
  skirtNormals.set(normals);
  skirtColors.set(colors);
  let sOff = triCount * 9;

  const edgeColorAt = (iVert: number): [number, number, number] => {
    const ax = sharedPos[iVert * 3], ay = sharedPos[iVert * 3 + 1], az = sharedPos[iVert * 3 + 2];
    const surfaceR = Math.hypot(ax, ay, az) || 1;
    const rx = ax / surfaceR, ry = ay / surfaceR, rz = az / surfaceR;
    if (biome) {
      mixBiomeColor(biome, rx, ry, rz, col);
      return [col[0], col[1], col[2]];
    }
    const heightNorm = (surfaceR - minR) * invRange;
    sampleGradient(heightStops, heightNorm, col);
    if (seaLevel !== undefined && surfaceR < seaLevel) {
      col[0] *= 0.45; col[1] *= 0.5; col[2] *= 0.55;
    }
    return [col[0], col[1], col[2]];
  };

  const emitSkirt = (i0: number, i1: number) => {
    const ax = sharedPos[i0 * 3], ay = sharedPos[i0 * 3 + 1], az = sharedPos[i0 * 3 + 2];
    const bx = sharedPos[i1 * 3], by = sharedPos[i1 * 3 + 1], bz = sharedPos[i1 * 3 + 2];
    const r0 = Math.hypot(ax, ay, az) || 1;
    const r1 = Math.hypot(bx, by, bz) || 1;
    const s0 = Math.max(1, r0 - skirtDrop) / r0;
    const s1 = Math.max(1, r1 - skirtDrop) / r1;
    const ax2 = ax * s0, ay2 = ay * s0, az2 = az * s0;
    const bx2 = bx * s1, by2 = by * s1, bz2 = bz * s1;
    const c0 = edgeColorAt(i0);
    const c1 = edgeColorAt(i1);
    const c0d: [number, number, number] = [c0[0] * 0.85, c0[1] * 0.85, c0[2] * 0.85];
    const c1d: [number, number, number] = [c1[0] * 0.85, c1[1] * 0.85, c1[2] * 0.85];
    const write = (
      x0: number, y0: number, z0: number,
      x1: number, y1: number, z1: number,
      x2: number, y2: number, z2: number,
      ca: [number, number, number],
      cb: [number, number, number],
      cc: [number, number, number],
    ) => {
      const e1x = x1 - x0, e1y = y1 - y0, e1z = z1 - z0;
      const e2x = x2 - x0, e2y = y2 - y0, e2z = z2 - z0;
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      skirtPositions[sOff] = x0; skirtPositions[sOff + 1] = y0; skirtPositions[sOff + 2] = z0;
      skirtPositions[sOff + 3] = x1; skirtPositions[sOff + 4] = y1; skirtPositions[sOff + 5] = z1;
      skirtPositions[sOff + 6] = x2; skirtPositions[sOff + 7] = y2; skirtPositions[sOff + 8] = z2;
      const cols = [ca, cb, cc];
      for (let k = 0; k < 3; k++) {
        skirtNormals[sOff + k * 3] = nx;
        skirtNormals[sOff + k * 3 + 1] = ny;
        skirtNormals[sOff + k * 3 + 2] = nz;
        skirtColors[sOff + k * 3] = cols[k][0];
        skirtColors[sOff + k * 3 + 1] = cols[k][1];
        skirtColors[sOff + k * 3 + 2] = cols[k][2];
      }
      sOff += 9;
    };
    write(ax, ay, az, bx, by, bz, bx2, by2, bz2, c0, c1, c1d);
    write(ax, ay, az, bx2, by2, bz2, ax2, ay2, az2, c0, c1d, c0d);
  };

  for (let i = 0; i < S; i++) {
    emitSkirt(i, i + 1);
    emitSkirt(S * row + i, S * row + i + 1);
    emitSkirt(i * row, (i + 1) * row);
    emitSkirt(i * row + S, (i + 1) * row + S);
  }

  return {
    positions: skirtPositions,
    normals: skirtNormals,
    colors: skirtColors,
    center: [cx, cy, cz],
    boundRadius: cullRadius + skirtDrop * 0.35,
    cullRadius,
  };
}


export function buildLiquidChunkBuffers(
  surfaceRadius: (nx: number, ny: number, nz: number) => number,
  seaRadius: number,
  faceIndex: number,
  u0: number,
  v0: number,
  size: number,
  segments: number,
  baseColor: [number, number, number],
  deepColor: [number, number, number],
  foamColor: [number, number, number],
  waveAmp: number,
): ChunkMeshBuffers | null {
  const face = CUBE_FACES[faceIndex];
  const S = Math.max(2, segments);
  const sharedPos = new Float32Array((S + 1) * (S + 1) * 3);
  const depths = new Float32Array((S + 1) * (S + 1));
  const dir: [number, number, number] = [0, 0, 0];
  const bury = Math.max(18, waveAmp * 2.2);
  let vOff = 0;
  let dOff = 0;
  let maxDepth = 1;
  let anyWater = false;
  const pad = (size / S) * 0.4;

  for (let j = 0; j <= S; j++) {
    const b = v0 - pad + (j / S) * (size + pad * 2);
    for (let i = 0; i <= S; i++) {
      const a = u0 - pad + (i / S) * (size + pad * 2);
      const cx = face.dir[0] + face.u[0] * a + face.v[0] * b;
      const cy = face.dir[1] + face.u[1] * a + face.v[1] * b;
      const cz = face.dir[2] + face.u[2] * a + face.v[2] * b;
      spherify(cx, cy, cz, dir);
      const terrainR = surfaceRadius(dir[0], dir[1], dir[2]);
      const depth = seaRadius - terrainR;
      if (depth > maxDepth) maxDepth = depth;
      if (depth > -bury) anyWater = true;
      const r = depth < 0
        ? seaRadius - Math.min(bury, -depth * 0.35 + waveAmp * 0.6)
        : seaRadius;
      sharedPos[vOff++] = dir[0] * r;
      sharedPos[vOff++] = dir[1] * r;
      sharedPos[vOff++] = dir[2] * r;
      depths[dOff++] = depth;
    }
  }
  if (!anyWater) return null;

  const row = S + 1;
  const triIdx: number[] = [];
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const aI = i + j * row;
      const bI = aI + 1;
      const cI = aI + row;
      const dI = cI + 1;
      const dA = depths[aI], dB = depths[bI], dC = depths[cI], dD = depths[dI];
      if (dA > -bury || dB > -bury || dD > -bury) {
        triIdx.push(aI, bI, dI);
      }
      if (dA > -bury || dD > -bury || dC > -bury) {
        triIdx.push(aI, dI, cI);
      }
    }
  }
  if (triIdx.length === 0) return null;

  const triCount = triIdx.length / 3;
  const positions = new Float32Array(triCount * 9);
  const normals = new Float32Array(triCount * 9);
  const colors = new Float32Array(triCount * 9);
  let cx = 0, cy = 0, cz = 0;
  let maxD2 = 0;
  const invMax = 1 / Math.max(0.001, maxDepth);

  for (let t = 0; t < triCount; t++) {
    const i0 = triIdx[t * 3], i1 = triIdx[t * 3 + 1], i2 = triIdx[t * 3 + 2];
    const ax = sharedPos[i0 * 3], ay = sharedPos[i0 * 3 + 1], az = sharedPos[i0 * 3 + 2];
    const bx = sharedPos[i1 * 3], by = sharedPos[i1 * 3 + 1], bz = sharedPos[i1 * 3 + 2];
    const cxp = sharedPos[i2 * 3], cyp = sharedPos[i2 * 3 + 1], czp = sharedPos[i2 * 3 + 2];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cxp - ax, e2y = cyp - ay, e2z = czp - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;

    const mx = (ax + bx + cxp) / 3;
    const my = (ay + by + cyp) / 3;
    const mz = (az + bz + czp) / 3;
    cx += mx; cy += my; cz += mz;
    const avgD = (depths[i0] + depths[i1] + depths[i2]) / 3;
    const deepT = Math.min(1, Math.max(0, avgD * invMax));
    const shore = Math.min(1, Math.max(0, 1 - Math.abs(avgD) / Math.max(8, bury)));
    let r = baseColor[0] + (deepColor[0] - baseColor[0]) * deepT;
    let g = baseColor[1] + (deepColor[1] - baseColor[1]) * deepT;
    let b = baseColor[2] + (deepColor[2] - baseColor[2]) * deepT;
    r += (foamColor[0] - r) * shore * 0.35;
    g += (foamColor[1] - g) * shore * 0.35;
    b += (foamColor[2] - b) * shore * 0.35;
    const h = Math.sin(mx * 0.01 + mz * 0.013) * 0.04 + 1;
    r *= h; g *= h; b *= h;

    const o = t * 9;
    positions[o] = ax; positions[o + 1] = ay; positions[o + 2] = az;
    positions[o + 3] = bx; positions[o + 4] = by; positions[o + 5] = bz;
    positions[o + 6] = cxp; positions[o + 7] = cyp; positions[o + 8] = czp;
    for (let k = 0; k < 3; k++) {
      normals[o + k * 3] = nx;
      normals[o + k * 3 + 1] = ny;
      normals[o + k * 3 + 2] = nz;
      colors[o + k * 3] = r;
      colors[o + k * 3 + 1] = g;
      colors[o + k * 3 + 2] = b;
    }
  }

  cx /= triCount; cy /= triCount; cz /= triCount;
  for (let i = 0; i < positions.length; i += 3) {
    const dx = positions[i] - cx, dy = positions[i + 1] - cy, dz = positions[i + 2] - cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > maxD2) maxD2 = d2;
  }

  return {
    positions,
    normals,
    colors,
    center: [cx, cy, cz],
    boundRadius: Math.sqrt(maxD2) * 1.2 + bury + waveAmp * 2,
    cullRadius: Math.sqrt(maxD2) * 1.2 + bury + waveAmp * 2,
  };
}

export type ChunkWorkerPayload = {
  id: string;
  def: PlanetDef;
  seed: string;
  seaLevel: number;
  faceIndex: number;
  u0: number;
  v0: number;
  size: number;
  segments: number;
};
