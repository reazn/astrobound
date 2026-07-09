import { Vector3, Quaternion, type PerspectiveCamera } from "three";
import type { Input } from "../engine/input";
import type { Physics } from "../engine/physics";
import { settings } from "../config/settings";
import type { AnimatedCharacter } from "../visuals/animatedCharacter";
import { castCameraOccluders } from "./cameraOccluders";

// Third-person orbit camera for a spherical world. The camera's "up" tracks the
// player's surface normal. Yaw rotates the forward vector around that up (stable
// across the poles via re-projection); pitch tilts elevation. Scroll wheel
// zooms (clamped); a spring-arm raycast pulls the camera off terrain + registered
// occluders (ship, props); the character fades when forced very close.

export interface CameraRig {
  forward: Vector3;
  pitch: number;
}

export function createCameraRig(): CameraRig {
  return { forward: new Vector3(0, 0, -1), pitch: 0.32 };
}

const CONFIG = {
  // Negative pitch = look up; positive = look down.
  pitchMin: -0.95,
  pitchMax: 1.15,
  pivotHeight: 1.72,
  shoulder: 0.55,
  wheelStep: 2.0,
  collisionPad: 1.1,
  minDist: 2.0,
  collisionSmoothIn: 22,
  collisionSmoothOut: 14,
  fadeStart: 4.2,
  fadeEnd: 2.0,
  // Extra boom height / back-pull when looking up so the lens clears the head.
  lookUpPivotBoost: 0.85,
  lookUpDistBoost: 2.4,
  surfaceClearance: 1.35,
};

const q = new Quaternion();
const right = new Vector3();
const pivot = new Vector3();
const camDir = new Vector3();
const dir = new Vector3();
const localPivot = new Vector3();
const surfaceN = new Vector3();

let smoothedDist = settings.cameraDistance;
let hasSmoothed = false;

export function updateCameraFollow(
  rig: CameraRig,
  camera: PerspectiveCamera,
  playerPos: Vector3,
  playerUp: Vector3,
  input: Input,
  physics: Physics,
  character: AnimatedCharacter,
  playerLocalPos: Vector3,
  dt = 1 / 60,
  surfaceRadiusFn?: (nx: number, ny: number, nz: number) => number,
) {
  // Apply look 1:1 — low-pass on deltas feels like polling/lag on foot.
  // Ship steering keeps its own inertia filter separately.
  const { dx, dy } = input.consumeMouse();
  const sens = settings.mouseSensitivity;

  if (dx !== 0) {
    q.setFromAxisAngle(playerUp, -dx * sens);
    rig.forward.applyQuaternion(q);
  }
  rig.forward.addScaledVector(playerUp, -rig.forward.dot(playerUp));
  if (rig.forward.lengthSq() < 1e-6) rig.forward.set(0, 0, -1);
  rig.forward.normalize();

  const dyEff = settings.invertY ? -dy : dy;
  if (dyEff !== 0) {
    rig.pitch = Math.min(
      CONFIG.pitchMax,
      Math.max(CONFIG.pitchMin, rig.pitch + dyEff * sens),
    );
  }

  const wheel = input.consumeWheel();
  if (wheel !== 0) {
    settings.cameraDistance = Math.min(
      settings.maxZoom,
      Math.max(settings.minZoom, settings.cameraDistance + wheel * CONFIG.wheelStep),
    );
  }

  right.crossVectors(rig.forward, playerUp).normalize();
  const lookUp = Math.max(0, Math.min(1, -rig.pitch / -CONFIG.pitchMin));
  const pivotLift = CONFIG.pivotHeight + lookUp * CONFIG.lookUpPivotBoost;
  pivot.copy(playerPos)
    .addScaledVector(playerUp, pivotLift)
    .addScaledVector(right, CONFIG.shoulder);

  const cp = Math.cos(rig.pitch);
  const sp = Math.sin(rig.pitch);
  camDir.copy(rig.forward).multiplyScalar(-cp).addScaledVector(playerUp, sp).normalize();
  const wanted = settings.cameraDistance + lookUp * CONFIG.lookUpDistBoost;

  let blocked = wanted;
  localPivot.copy(playerLocalPos)
    .addScaledVector(playerUp, pivotLift)
    .addScaledVector(right, CONFIG.shoulder);
  dir.copy(camDir);

  if (physics.activeCollider) {
    const ray = new physics.rapier.Ray(
      { x: localPivot.x, y: localPivot.y, z: localPivot.z },
      { x: dir.x, y: dir.y, z: dir.z },
    );
    const hit = physics.world.castRay(ray, wanted, true);
    if (hit) blocked = Math.max(CONFIG.minDist, hit.timeOfImpact - CONFIG.collisionPad);
  }

  // Vehicles / props registered as camera occluders (planet-local space).
  const occ = castCameraOccluders(localPivot, dir, blocked);
  if (occ < blocked) blocked = Math.max(CONFIG.minDist, occ - CONFIG.collisionPad * 0.6);

  if (!hasSmoothed) {
    smoothedDist = blocked;
    hasSmoothed = true;
  } else {
    const rate = blocked < smoothedDist
      ? CONFIG.collisionSmoothIn
      : CONFIG.collisionSmoothOut;
    const k = 1 - Math.exp(-rate * dt);
    smoothedDist += (blocked - smoothedDist) * k;
  }

  camera.position.copy(pivot).addScaledVector(camDir, smoothedDist);

  // Analytical surface clamp — stops the lens diving under the planet when the
  // mid-LOD trimesh is coarse or the ray starts inside a facet.
  localPivot.copy(camera.position).add(playerLocalPos);
  surfaceN.copy(localPivot);
  const camR = surfaceN.length();
  if (camR > 1e-4) {
    surfaceN.multiplyScalar(1 / camR);
    let minR = playerLocalPos.length() + CONFIG.surfaceClearance;
    if (surfaceRadiusFn) {
      minR = Math.max(
        minR,
        surfaceRadiusFn(surfaceN.x, surfaceN.y, surfaceN.z) + CONFIG.surfaceClearance,
      );
    }
    if (camR < minR) {
      localPivot.copy(surfaceN).multiplyScalar(minR);
      camera.position.copy(localPivot).sub(playerLocalPos);
      smoothedDist = Math.min(smoothedDist, camera.position.distanceTo(pivot));
    }
  }

  camera.up.copy(playerUp);
  camera.lookAt(pivot);

  const fadeStart = CONFIG.fadeStart + lookUp * 1.2;
  const fadeEnd = CONFIG.fadeEnd + lookUp * 0.6;
  const t = (smoothedDist - fadeEnd) / (fadeStart - fadeEnd);
  character.setOpacity(Math.min(1, Math.max(0, t)));
}

export function resetCameraFollowSmoothing() {
  hasSmoothed = false;
  smoothedDist = settings.cameraDistance;
}
