// Serializable world state for future multiplayer sync. Plain data only — no
// Three.js objects, no closures. The sim tick produces these; a net layer
// (not wired yet) would broadcast and apply them.

export type Vec3 = [number, number, number];

export interface ShipSnapshot {
  entityId: string;
  mode: "landed" | "flying" | "docked" | "launching" | "landing";
  position: Vec3;
  velocity: Vec3;
  orientation: [number, number, number, number];
  throttle: number;
  boostFuel: number;
  boosting: boolean;
  warpPhase: "idle" | "charging" | "cruising";
  warpTargetId: string | null;
  warpT: number;
  dockBay: number | null;
  planetId: string | null;
}

export interface PlayerSnapshot {
  entityId: string;
  position: Vec3;
  planetId: string;
  velocity: Vec3;
}

export interface PlanetBodySnapshot {
  id: string;
  systemPosition: Vec3;
}

export interface WorldSnapshot {
  tick: number;
  time: number;
  seed: string;
  ships: ShipSnapshot[];
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
