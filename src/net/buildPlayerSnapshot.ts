import type { Entity, ShipComp } from "../ecs/components";
import type { PossessionState } from "../systems/possession";
import type {
  CoordFrame,
  PlayerSnapshot,
  TransformSnapshot,
  ShipSnapshot,
  BoardPhase,
  PossessionMode,
} from "./protocol";
import {
  MOVEMENT_FLAG_GROUNDED,
  MOVEMENT_FLAG_FLYING,
  MOVEMENT_FLAG_HOVERBOARD,
  MOVEMENT_FLAG_IN_LIQUID,
  MOVEMENT_FLAG_SLIDING,
} from "./protocol";

const toVec3 = (v: { x: number; y: number; z: number }): [number, number, number] => [v.x, v.y, v.z];

export function buildCoordFrame(
  state: PossessionState,
  shipMode: ShipComp["mode"] | null,
  _dockBay: number | null,
): CoordFrame {
  if (state.mode === "ship" && shipMode === "flying") return { kind: "system" };
  if (state.mode === "ship" && shipMode === "docked") return { kind: "station", stationId: "meridian" };
  return { kind: "planet", planetId: state.currentPlanet.def.id };
}

export function movementFlagsFromEntity(player: Entity): number {
  const m = player.movement;
  if (!m) return 0;
  let flags = 0;
  if (m.grounded) flags |= MOVEMENT_FLAG_GROUNDED;
  if (m.flying) flags |= MOVEMENT_FLAG_FLYING;
  if (m.hoverboarding) flags |= MOVEMENT_FLAG_HOVERBOARD;
  if (m.inLiquid) flags |= MOVEMENT_FLAG_IN_LIQUID;
  if (m.sliding) flags |= MOVEMENT_FLAG_SLIDING;
  return flags;
}

export function buildPlayerTransform(
  entity: Entity,
  frame: CoordFrame,
): TransformSnapshot {
  const pos = entity.position!;
  const vel = entity.movement?.velocity ?? entity.ship?.velocity;
  const t: TransformSnapshot = {
    frame,
    position: toVec3(pos),
    velocity: vel ? toVec3(vel) : [0, 0, 0],
  };
  if (entity.up) t.up = toVec3(entity.up);
  if (entity.faceDir) t.faceDir = toVec3(entity.faceDir);
  if (entity.ship?.orientation) {
    const q = entity.ship.orientation;
    t.orientation = [q.x, q.y, q.z, q.w];
  }
  if (entity.ship?.angVel) t.angularVel = toVec3(entity.ship.angVel);
  return t;
}

export function buildShipSnapshot(
  ship: Entity,
  frame: CoordFrame,
  boardPhase: BoardPhase,
): ShipSnapshot | undefined {
  const s = ship.ship;
  if (!s) return undefined;
  return {
    entityId: ship.networkId ?? "ship",
    mode: s.mode,
    transform: buildPlayerTransform(ship, frame),
    throttle: s.throttle,
    boostFuel: s.boostFuel,
    boosting: s.boosting,
    warpPhase: s.warpPhase,
    warpTargetId: s.warpTargetId,
    warpT: s.warpT,
    dockBay: s.dockBay,
    phaseT: s.phaseT,
    boardPhase,
  };
}

export function buildLocalPlayerSnapshot(
  player: Entity,
  ship: Entity,
  state: PossessionState,
  session: { playerId: string; displayName: string; characterId: string; shipId: string },
  boardPhase: BoardPhase,
): PlayerSnapshot {
  const possession: PossessionMode = state.mode;
  const shipMode = ship.ship?.mode ?? "landed";
  const frame = buildCoordFrame(state, shipMode, state.dockBay);
  const transformEntity = possession === "ship" ? ship : player;
  const transform = buildPlayerTransform(transformEntity, frame);
  return {
    playerId: session.playerId,
    networkId: player.networkId ?? session.playerId,
    displayName: session.displayName,
    appearance: { characterId: session.characterId, shipId: session.shipId },
    possession,
    boardPhase,
    transform,
    movementFlags: movementFlagsFromEntity(player),
    ship: possession === "ship" ? buildShipSnapshot(ship, frame, boardPhase) : undefined,
  };
}
