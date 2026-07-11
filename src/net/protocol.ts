export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export type CoordFrame =
  | { kind: "system" }
  | { kind: "planet"; planetId: string }
  | { kind: "station"; stationId: string };

export interface TransformSnapshot {
  frame: CoordFrame;
  position: Vec3;
  velocity: Vec3;
  orientation?: Quat;
  angularVel?: Vec3;
  up?: Vec3;
  faceDir?: Vec3;
}

export interface AppearanceSnapshot {
  characterId: string;
  shipId: string;
}

export type PossessionMode = "onFoot" | "ship";
export type BoardPhase = "idle" | "boarding" | "exiting";

export interface ShipSnapshot {
  entityId: string;
  mode: "landed" | "flying" | "docked" | "launching" | "landing";
  transform: TransformSnapshot;
  throttle: number;
  boostFuel: number;
  boosting: boolean;
  warpPhase: "idle" | "charging" | "cruising";
  warpTargetId: string | null;
  warpT: number;
  dockBay: number | null;
  phaseT: number;
  boardPhase: BoardPhase;
}

export interface PlayerSnapshot {
  playerId: string;
  networkId: string;
  displayName: string;
  appearance: AppearanceSnapshot;
  possession: PossessionMode;
  boardPhase: BoardPhase;
  transform: TransformSnapshot;
  movementFlags: number;
  ship?: ShipSnapshot;
}

export interface PlanetBodySnapshot {
  id: string;
  systemPosition: Vec3;
}

export interface WorldSnapshot {
  tick: number;
  time: number;
  seed: string;
  systemId: string;
  players: PlayerSnapshot[];
  planets: PlanetBodySnapshot[];
  stationPosition: Vec3;
}

export interface InputEnvelope {
  tick: number;
  playerId: string;
  keys: string[];
  mouseDx: number;
  mouseDy: number;
  scrollDelta: number;
}

export interface TimeSync {
  tick: number;
  time: number;
  nowMs: number;
}

export const MOVEMENT_FLAG_GROUNDED = 1 << 0;
export const MOVEMENT_FLAG_FLYING = 1 << 1;
export const MOVEMENT_FLAG_HOVERBOARD = 1 << 2;
export const MOVEMENT_FLAG_IN_LIQUID = 1 << 3;
export const MOVEMENT_FLAG_SLIDING = 1 << 4;

export function vec3Dist(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function vec3Len(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

export function framesEqual(a: CoordFrame, b: CoordFrame): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "planet" && b.kind === "planet") return a.planetId === b.planetId;
  if (a.kind === "station" && b.kind === "station") return a.stationId === b.stationId;
  return true;
}
