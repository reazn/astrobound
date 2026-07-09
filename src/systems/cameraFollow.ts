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
  pitchMin: -0.35,
  pitchMax: 1.2,
  pivotHeight: 1.5,
  shoulder: 0.7,
  wheelStep: 2.0,
  collisionPad: 1.1,
  minDist: 1.4,
  collisionSmooth: 16,
  fadeStart: 3.2,
  fadeEnd: 1.2,
  // Keep the lens above the local surface even if the trimesh miss-fires.
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
  const { dx, dy } = input.consumeMouse();
  const sens = settings.mouseSensitivity;

  q.setFromAxisAngle(playerUp, -dx * sens);
  rig.forward.applyQuaternion(q);
  rig.forward.addScaledVector(playerUp, -rig.forward.dot(playerUp));
  if (rig.forward.lengthSq() < 1e-6) rig.forward.set(0, 0, -1);
  rig.forward.normalize();

  const dyEff = settings.invertY ? -dy : dy;
  rig.pitch = Math.min(
    CONFIG.pitchMax,
    Math.max(CONFIG.pitchMin, rig.pitch + dyEff * sens),
  );

  const wheel = input.consumeWheel();
  if (wheel !== 0) {
    settings.cameraDistance = Math.min(
      settings.maxZoom,
      Math.max(settings.minZoom, settings.cameraDistance + wheel * CONFIG.wheelStep),
    );
  }

  right.crossVectors(rig.forward, playerUp).normalize();
  pivot.copy(playerPos)
    .addScaledVector(playerUp, CONFIG.pivotHeight)
    .addScaledVector(right, CONFIG.shoulder);

  const cp = Math.cos(rig.pitch);
  const sp = Math.sin(rig.pitch);
  camDir.copy(rig.forward).multiplyScalar(-cp).addScaledVector(playerUp, sp).normalize();
  const wanted = settings.cameraDistance;

  let blocked = wanted;
  localPivot.copy(playerLocalPos)
    .addScaledVector(playerUp, CONFIG.pivotHeight)
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
  } else if (blocked < smoothedDist) {
    smoothedDist = blocked;
  } else {
    const k = 1 - Math.exp(-CONFIG.collisionSmooth * dt);
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

  const t = (smoothedDist - CONFIG.fadeEnd) / (CONFIG.fadeStart - CONFIG.fadeEnd);
  character.setOpacity(Math.min(1, Math.max(0, t)));
}

export function resetCameraFollowSmoothing() {
  hasSmoothed = false;
  smoothedDist = settings.cameraDistance;
}
