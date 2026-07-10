// Naive surface-nets isosurface (no huge MC tables). Negative SDF = solid rock.

export interface McMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

export function marchCubes(
  res: number,
  origin: [number, number, number],
  cell: number,
  sample: (x: number, y: number, z: number) => number,
  iso = 0,
): McMesh {
  const n = res + 1;
  const field = new Float32Array(n * n * n);
  const at = (x: number, y: number, z: number) => field[x + y * n + z * n * n];
  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        field[x + y * n + z * n * n] = sample(
          origin[0] + x * cell,
          origin[1] + y * cell,
          origin[2] + z * cell,
        );
      }
    }
  }

  const vertId = new Int32Array(res * res * res);
  vertId.fill(-1);
  const pos: number[] = [];

  const edgeCross = (
    ax: number, ay: number, az: number, av: number,
    bx: number, by: number, bz: number, bv: number,
  ): [number, number, number] | null => {
    if ((av < iso) === (bv < iso)) return null;
    const t = Math.abs(bv - av) < 1e-8 ? 0.5 : (iso - av) / (bv - av);
    return [
      origin[0] + (ax + (bx - ax) * t) * cell,
      origin[1] + (ay + (by - ay) * t) * cell,
      origin[2] + (az + (bz - az) * t) * cell,
    ];
  };

  const corners: readonly [number, number, number][] = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ];
  const edges: readonly [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7],
  ];

  for (let z = 0; z < res; z++) {
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        let inside = 0;
        const vals = new Float32Array(8);
        for (let i = 0; i < 8; i++) {
          const [ox, oy, oz] = corners[i];
          vals[i] = at(x + ox, y + oy, z + oz);
          if (vals[i] < iso) inside++;
        }
        if (inside === 0 || inside === 8) continue;

        let sx = 0, sy = 0, sz = 0, count = 0;
        for (const [a, b] of edges) {
          const [ax, ay, az] = corners[a];
          const [bx, by, bz] = corners[b];
          const p = edgeCross(
            x + ax, y + ay, z + az, vals[a],
            x + bx, y + by, z + bz, vals[b],
          );
          if (!p) continue;
          sx += p[0]; sy += p[1]; sz += p[2];
          count++;
        }
        if (count === 0) continue;
        const id = pos.length / 3;
        pos.push(sx / count, sy / count, sz / count);
        vertId[x + y * res + z * res * res] = id;
      }
    }
  }

  const idx: number[] = [];
  const emitQuad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) {
      idx.push(a, c, b, a, d, c);
    } else {
      idx.push(a, b, c, a, c, d);
    }
  };

  for (let z = 0; z < res; z++) {
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const v = at(x, y, z);
        if (x < res - 1) {
          const v2 = at(x + 1, y, z);
          if ((v < iso) !== (v2 < iso)) {
            const y0 = Math.max(0, y - 1), z0 = Math.max(0, z - 1);
            emitQuad(
              vertId[x + y0 * res + z0 * res * res],
              vertId[x + y * res + z0 * res * res],
              vertId[x + y * res + z * res * res],
              vertId[x + y0 * res + z * res * res],
              v2 < iso,
            );
          }
        }
        if (y < res - 1) {
          const v2 = at(x, y + 1, z);
          if ((v < iso) !== (v2 < iso)) {
            const x0 = Math.max(0, x - 1), z0 = Math.max(0, z - 1);
            emitQuad(
              vertId[x0 + y * res + z0 * res * res],
              vertId[x + y * res + z0 * res * res],
              vertId[x + y * res + z * res * res],
              vertId[x0 + y * res + z * res * res],
              v < iso,
            );
          }
        }
        if (z < res - 1) {
          const v2 = at(x, y, z + 1);
          if ((v < iso) !== (v2 < iso)) {
            const x0 = Math.max(0, x - 1), y0 = Math.max(0, y - 1);
            emitQuad(
              vertId[x0 + y0 * res + z * res * res],
              vertId[x + y0 * res + z * res * res],
              vertId[x + y * res + z * res * res],
              vertId[x0 + y * res + z * res * res],
              v2 < iso,
            );
          }
        }
      }
    }
  }

  const positions = new Float32Array(pos);
  const indices = new Uint32Array(idx);
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3, i1 = indices[i + 1] * 3, i2 = indices[i + 2] * 3;
    const ax = positions[i0], ay = positions[i0 + 1], az = positions[i0 + 2];
    const bx = positions[i1], by = positions[i1 + 1], bz = positions[i1 + 2];
    const cx = positions[i2], cy = positions[i2 + 1], cz = positions[i2 + 2];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    normals[i0] += nx; normals[i0 + 1] += ny; normals[i0 + 2] += nz;
    normals[i1] += nx; normals[i1 + 1] += ny; normals[i1 + 2] += nz;
    normals[i2] += nx; normals[i2 + 1] += ny; normals[i2 + 2] += nz;
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l;
  }
  return { positions, normals, indices };
}
