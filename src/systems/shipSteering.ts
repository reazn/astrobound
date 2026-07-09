import { Quaternion, Vector3 } from "three";
import type { ShipComp } from "../ecs/components";
import type { Input } from "../engine/input";
import { SHIP } from "../config/ship";
import { settings } from "../config/settings";

const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, -1);
const qDelta = new Quaternion();

let smoothDx = 0;
let smoothDy = 0;

function rotateLocal(q: Quaternion, axis: Vector3, angle: number) {
  qDelta.setFromAxisAngle(axis, angle);
  q.multiply(qDelta);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// Rotation is inertial: the mouse sets a soft steer target, mouse deltas are
// low-pass filtered, and angular velocity eases toward pitch/yaw rates so
// turns ramp in and coast out instead of snapping.
export function updateShipSteering(s: ShipComp, input: Input, dt: number) {
  const { dx, dy } = input.consumeMouse();
  const sens = settings.mouseSensitivity * SHIP.steerInputScale;
  const dyEff = settings.invertY ? -dy : dy;

  const blend = 1 - Math.exp(-SHIP.mouseSmooth * dt);
  smoothDx += (dx - smoothDx) * blend;
  smoothDy += (dyEff - smoothDy) * blend;

  const moving = Math.abs(smoothDx) > 0.02 || Math.abs(smoothDy) > 0.02;
  if (moving) {
    s.steerX = clamp(s.steerX + smoothDx * sens, -1, 1);
    s.steerY = clamp(s.steerY + smoothDy * sens, -1, 1);
  } else {
    const decay = Math.exp(-SHIP.steerDecay * dt);
    s.steerX *= decay;
    s.steerY *= decay;
  }

  const roll = (input.held("KeyA") ? 1 : 0) - (input.held("KeyD") ? 1 : 0);

  const tgtPitch = -s.steerY * SHIP.pitchRate;
  const tgtYaw = -s.steerX * SHIP.yawRate;
  const tgtRoll = -roll * SHIP.rollRate;
  const kTurn = 1 - Math.exp(-SHIP.turnResponse * dt);
  const kRoll = 1 - Math.exp(-SHIP.rollResponse * dt);
  s.angVel.x += (tgtPitch - s.angVel.x) * kTurn;
  s.angVel.y += (tgtYaw - s.angVel.y) * kTurn;
  s.angVel.z += (tgtRoll - s.angVel.z) * kRoll;

  rotateLocal(s.orientation, X_AXIS, s.angVel.x * dt);
  rotateLocal(s.orientation, Y_AXIS, s.angVel.y * dt);
  rotateLocal(s.orientation, Z_AXIS, s.angVel.z * dt);
}

export function getSteerDisplay(s: ShipComp) {
  return { x: s.steerX, y: s.steerY };
}

export function resetSteerSmoothing() {
  smoothDx = 0;
  smoothDy = 0;
}
