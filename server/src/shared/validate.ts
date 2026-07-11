import type { CoordFrame, TransformSnapshot, Vec3, PossessionMode } from "./protocol.js";
import { framesEqual, vec3Dist, vec3Len } from "./protocol.js";
import type { PlayerRole } from "./events.js";

const MAX_ONFOOT_SPEED = 48;
const MAX_SHIP_SPEED = 12000;
const MAX_TELEPORT_ONFOOT = 80;
const MAX_TELEPORT_SHIP = 2500;
const MAX_ANGULAR = 14;

export interface TransformValidationContext {
  role: PlayerRole;
  possession: PossessionMode;
  movementFlags: number;
  expectedFrame: CoordFrame;
  prev: TransformSnapshot | null;
  dt: number;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export function validateTransform(
  next: TransformSnapshot,
  ctx: TransformValidationContext,
): ValidationResult {
  if (ctx.possession === "onFoot" && next.frame.kind !== "planet") {
    return { ok: false, reason: "frame_illegal" };
  }

  const isDebugFly = (ctx.movementFlags & (1 << 1)) !== 0;
  if (isDebugFly && ctx.role !== "admin") {
    return { ok: false, reason: "fly_not_allowed" };
  }

  if (!ctx.prev) return { ok: true };

  if (!framesEqual(ctx.prev.frame, next.frame)) {
    return { ok: true };
  }

  const dist = vec3Dist(ctx.prev.position, next.position);
  const maxSpeed = ctx.possession === "ship" ? MAX_SHIP_SPEED : MAX_ONFOOT_SPEED;
  const maxTeleport = ctx.possession === "ship" ? MAX_TELEPORT_SHIP : MAX_TELEPORT_ONFOOT;
  const maxDist = maxSpeed * Math.max(ctx.dt, 1 / 30) * 1.5;

  if (dist > maxDist && dist > maxTeleport) {
    return { ok: false, reason: "teleport" };
  }

  const speed = vec3Len(next.velocity);
  if (speed > maxSpeed * 2) {
    return { ok: false, reason: "speed" };
  }

  if (next.angularVel) {
    const ang = vec3Len(next.angularVel);
    if (ang > MAX_ANGULAR * 3) return { ok: false, reason: "angular" };
  }

  return { ok: true };
}

export function validateInteractionRange(
  actorPos: Vec3,
  targetPos: Vec3,
  maxRange: number,
): ValidationResult {
  if (vec3Dist(actorPos, targetPos) > maxRange) {
    return { ok: false, reason: "out_of_range" };
  }
  return { ok: true };
}

export function canUseDebugFly(role: PlayerRole): boolean {
  return role === "admin";
}
