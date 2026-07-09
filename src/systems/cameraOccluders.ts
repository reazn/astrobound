import { Vector3 } from "three";
import type { EntityKind, GameEntityDesc } from "../ecs/gameEntity";

// Lightweight camera occlusion: sphere proxies for vehicles/props that the
// spring-arm should not clip through. Terrain still uses the Rapier trimesh.

export interface CameraOccluder {
  desc: GameEntityDesc;
  // Writes the occluder center in the SAME space as the camera ray origin.
  getCenter: (out: Vector3) => Vector3;
  enabled: boolean;
}

const registry: CameraOccluder[] = [];
const centerTmp = new Vector3();
const toCenter = new Vector3();

export function clearCameraOccluders() {
  registry.length = 0;
}

export function registerCameraOccluder(occluder: CameraOccluder) {
  const i = registry.findIndex((o) => o.desc.id === occluder.desc.id);
  if (i >= 0) registry[i] = occluder;
  else registry.push(occluder);
}

export function unregisterCameraOccluder(id: string) {
  const i = registry.findIndex((o) => o.desc.id === id);
  if (i >= 0) registry.splice(i, 1);
}

export function listCameraOccluders(kind?: EntityKind): readonly CameraOccluder[] {
  if (!kind) return registry;
  return registry.filter((o) => o.desc.kind === kind);
}

export function raySphereToi(
  origin: Vector3,
  dir: Vector3,
  center: Vector3,
  radius: number,
  maxT: number,
): number | null {
  toCenter.copy(origin).sub(center);
  const b = toCenter.dot(dir);
  const c = toCenter.lengthSq() - radius * radius;
  if (c > 0 && b > 0) return null;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t < 0 || t > maxT) {
    if (c < 0) return 0;
    return null;
  }
  return t;
}

export function castCameraOccluders(
  origin: Vector3,
  dir: Vector3,
  maxT: number,
  ignoreIds?: ReadonlySet<string>,
): number {
  let best = maxT;
  for (const o of registry) {
    if (!o.enabled || !o.desc.blocksCamera) continue;
    if (ignoreIds?.has(o.desc.id)) continue;
    const r = o.desc.cameraRadius;
    if (r <= 0) continue;
    o.getCenter(centerTmp);
    const t = raySphereToi(origin, dir, centerTmp, r, best);
    if (t !== null && t < best) best = t;
  }
  return best;
}
