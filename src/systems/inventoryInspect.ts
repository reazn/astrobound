import { Vector3, Quaternion, type PerspectiveCamera } from "three";
import type { AnimatedCharacter } from "../visuals/animatedCharacter";
import { basisQuaternion } from "../engine/surfaceOrient";

const CONFIG = {
  distance: 3.35,
  panScreenFrac: 0.2,
  lookHeight: 1.12,
  heightNudge: 0.04,
  posSmooth: 7,
  lookSmooth: 7,
  turnSmooth: 5.5,
};

const desiredPos = new Vector3();
const lookAt = new Vector3();
const frontDir = new Vector3();
const camRight = new Vector3();
const targetFace = new Vector3();
const targetQuat = new Quaternion();
const smoothPos = new Vector3();
const smoothLook = new Vector3();

let active = false;

export function resetInventoryInspect() {
  active = false;
}

export function beginInventoryInspect(camera: PerspectiveCamera, playerUp: Vector3) {
  camera.updateMatrixWorld(true);

  frontDir.copy(camera.position);
  frontDir.addScaledVector(playerUp, -frontDir.dot(playerUp));
  if (frontDir.lengthSq() < 1e-6) {
    camera.getWorldDirection(frontDir);
    frontDir.multiplyScalar(-1);
    frontDir.addScaledVector(playerUp, -frontDir.dot(playerUp));
  }
  if (frontDir.lengthSq() < 1e-6) frontDir.set(0, 0, 1);
  else frontDir.normalize();

  camRight.crossVectors(playerUp, frontDir);
  if (camRight.lengthSq() < 1e-6) camRight.set(1, 0, 0);
  else camRight.normalize();

  const fovRad = (camera.fov * Math.PI) / 180;
  const halfW = Math.tan(fovRad / 2) * CONFIG.distance * camera.aspect;
  const panRight = halfW * 2 * CONFIG.panScreenFrac;

  desiredPos
    .copy(frontDir).multiplyScalar(CONFIG.distance)
    .addScaledVector(camRight, panRight)
    .addScaledVector(playerUp, CONFIG.lookHeight + CONFIG.heightNudge);
  lookAt.set(0, 0, 0).addScaledVector(playerUp, CONFIG.lookHeight);

  smoothPos.copy(camera.position);
  smoothLook.copy(lookAt);
  active = true;
}

export function updateInventoryInspect(
  camera: PerspectiveCamera,
  character: AnimatedCharacter,
  playerUp: Vector3,
  _faceToward: Vector3,
  _playerLocalPos: Vector3,
  _physics: unknown,
  dt: number,
  _surfaceRadiusFn?: (nx: number, ny: number, nz: number) => number,
): void {
  character.setOpacity(1);
  if (!active) beginInventoryInspect(camera, playerUp);

  character.object.position.set(0, 0, 0);

  const fovRad = (camera.fov * Math.PI) / 180;
  const halfW = Math.tan(fovRad / 2) * CONFIG.distance * camera.aspect;
  const panRight = halfW * 2 * CONFIG.panScreenFrac;

  desiredPos
    .copy(frontDir).multiplyScalar(CONFIG.distance)
    .addScaledVector(camRight, panRight)
    .addScaledVector(playerUp, CONFIG.lookHeight + CONFIG.heightNudge);
  lookAt.set(0, 0, 0).addScaledVector(playerUp, CONFIG.lookHeight);

  const kPos = 1 - Math.exp(-CONFIG.posSmooth * dt);
  const kLook = 1 - Math.exp(-CONFIG.lookSmooth * dt);
  smoothPos.lerp(desiredPos, kPos);
  smoothLook.lerp(lookAt, kLook);

  camera.position.copy(smoothPos);
  camera.up.copy(playerUp);
  camera.lookAt(smoothLook);

  targetFace.copy(frontDir);
  if (targetFace.lengthSq() > 1e-6) {
    targetFace.normalize();
    basisQuaternion(playerUp, targetFace, targetQuat);
    const kTurn = 1 - Math.exp(-CONFIG.turnSmooth * dt);
    character.object.quaternion.slerp(targetQuat, kTurn);
  }
}
