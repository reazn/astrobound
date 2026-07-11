import type { Vector3, Quaternion, Object3D } from "three";
import type { AnimatedCharacter } from "../visuals/animatedCharacter";

// All component interfaces. Entities are plain data; logic lives in systems.
// This keeps the shape network/multiplayer-friendly later: every field here is
// a plain number/Vector3/string, nothing is a closure or DOM reference.

// On-foot locomotion on a planet surface (see systems/playerMovement). Gravity
// points to the current planet's center; "up" is the local surface normal.
export interface MovementState {
  velocity: Vector3;
  grounded: boolean;
  jumpsLeft: number;
  coyote: number;
  buffer: number;
  sliding: boolean;
  slideTime: number;
  slideCooldown: number;
  up: Vector3;
  faceDir: Vector3;
  speed01: number;
  didJump: boolean;
  didSlide: boolean;
  flying: boolean;
  inLiquid: boolean;
  hoverboarding: boolean;
  hoverPitch: number;
  hoverRoll: number;
  hoverPitchVel: number;
  hoverRollVel: number;
}

export interface DerivedStats {
  moveSpeedMult: number;
  extraJumps: number;
  jumpHeightMult: number;
}

export type ShipMode = "landed" | "flying" | "docked" | "launching" | "landing";
export type WarpPhase = "idle" | "charging" | "cruising";

// Ship flight state. `position`/`prevPosition`/`up`/`faceDir` on the Entity
// carry the transform: PLANET-RELATIVE while landed (same frame as the
// on-foot player), full SYSTEM-SPACE while flying. `orientation` is the free
// flight quaternion, used only while flying.
export interface ShipComp {
  mode: ShipMode;
  velocity: Vector3;
  orientation: Quaternion;
  throttle: number;
  boostFuel: number;
  boosting: boolean;
  steerX: number;
  steerY: number;
  angVel: Vector3; // smoothed pitch/yaw/roll rates (x/y/z) for inertial steering
  warpPhase: WarpPhase;
  warpTargetId: string | null;
  warpT: number;
  warpFrom: Vector3;
  warpTo: Vector3;
  // Take-off / landing tween (planet-local frame): progress + endpoints.
  phaseT: number;
  phaseFrom: Vector3;
  phaseTo: Vector3;
  dockBay: number | null;
  inAtmospherePlanetId: string | null;
}

export interface Entity {
  player?: true;
  ship?: ShipComp;

  // Transform. Meaning depends on mode (see ShipComp doc above); for the
  // on-foot player it is always planet-relative to the current planet.
  position?: Vector3;
  prevPosition?: Vector3;
  up?: Vector3;
  faceDir?: Vector3;

  movement?: MovementState; // on-foot only
  stats?: DerivedStats; // on-foot only

  character?: AnimatedCharacter; // animated GLB wrapper (player)
  mesh?: Object3D; // raw mesh (ship)
}
