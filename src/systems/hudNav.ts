import type { Vector3 } from "three";
import { SHIP } from "../config/ship";

export type HudMarkerKind = "planet" | "station" | "player" | "ship";

export interface HudMarker {
  id: string;
  name: string;
  kind: HudMarkerKind;
  color: string;
  systemPosition: Vector3;
  radius: number;
}

export interface LookTargetInfo {
  marker: HudMarker;
  dist: number;
  eta: number;
  angleDeg: number;
}

export interface CompassEntry {
  marker: HudMarker;
  bearingRad: number;
  dist: number;
}

const DEG = 180 / Math.PI;

export function findLookTarget(
  camPos: Vector3,
  camForward: Vector3,
  markers: HudMarker[],
  speed: number,
): LookTargetInfo | null {
  let best: LookTargetInfo | null = null;
  const maxAngle = SHIP.lookTargetFovDeg * (Math.PI / 180);

  for (const m of markers) {
    const dx = m.systemPosition.x - camPos.x;
    const dy = m.systemPosition.y - camPos.y;
    const dz = m.systemPosition.z - camPos.z;
    const distCenter = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const dist = Math.max(0, distCenter - m.radius);
    const inv = 1 / distCenter;
    const dot = (dx * inv) * camForward.x + (dy * inv) * camForward.y + (dz * inv) * camForward.z;
    if (dot < 0.05) continue;
    const angle = Math.acos(Math.min(1, dot));
    const angularRadius = Math.atan2(m.radius, distCenter);
    if (angle > maxAngle + angularRadius) continue;
    const eta = speed > 0.5 ? dist / speed : Infinity;
    if (!best || angle < best.angleDeg * (Math.PI / 180)) {
      best = { marker: m, dist, eta, angleDeg: angle * DEG };
    }
  }
  return best;
}

export function computeCompassEntries(
  camPos: Vector3,
  camForward: Vector3,
  camRight: Vector3,
  markers: HudMarker[],
): CompassEntry[] {
  const entries: CompassEntry[] = [];
  for (const m of markers) {
    const dx = m.systemPosition.x - camPos.x;
    const dy = m.systemPosition.y - camPos.y;
    const dz = m.systemPosition.z - camPos.z;
    const distCenter = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const dist = Math.max(0, distCenter - m.radius);
    const inv = 1 / Math.max(1, distCenter);
    const dirX = dx * inv, dirY = dy * inv, dirZ = dz * inv;
    const fwd = dirX * camForward.x + dirY * camForward.y + dirZ * camForward.z;
    const right = dirX * camRight.x + dirY * camRight.y + dirZ * camRight.z;
    const bearingRad = Math.atan2(right, fwd);
    entries.push({ marker: m, bearingRad, dist });
  }
  entries.sort((a, b) => a.bearingRad - b.bearingRad);
  return entries;
}

export function kindIcon(kind: HudMarkerKind): string {
  if (kind === "station") return "◈";
  if (kind === "player") return "▲";
  if (kind === "ship") return "◆";
  return "●";
}
