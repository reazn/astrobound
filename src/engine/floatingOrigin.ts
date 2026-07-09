import type { Vector3 } from "three";

// Floating-origin rendering. The solar system spans tens of thousands of
// units — far enough that feeding absolute system-space coordinates straight
// into three.js would lose GPU float32 precision on fine surface detail
// (vertex "swimming"). The fix: every render frame, pick the currently
// POSSESSED entity's system-space position as the origin, and give every
// Object3D only the small DELTA to its own system position. The possessed
// entity itself then sits at exactly (0,0,0) in render space — perfect
// precision for the one thing the camera is always closest to — and distant
// bodies (planets, the star) get deltas of at most ~10^5 units, where float32
// error (~0.01 units) is far below anything visible at that distance.
//
// All simulation state stays in plain THREE.Vector3 (== regular float64 JS
// numbers) — the precision loss only happens once a translation is composed
// into a GPU-bound Float32Array matrix, which is exactly what this delta
// keeps small.

export function renderRelative(systemPos: Vector3, origin: Vector3, out: Vector3): Vector3 {
  return out.copy(systemPos).sub(origin);
}
