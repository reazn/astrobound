import { Vector3, type Quaternion, type PerspectiveCamera } from "three";
import { SHIP } from "../config/ship";
import { settings } from "../config/settings";
import type { Physics } from "../engine/physics";
import { castCameraOccluders } from "./cameraOccluders";

const desiredPos = new Vector3();
const back = new Vector3();
const up = new Vector3();
const lookTarget = new Vector3();
const offset = new Vector3();
const offsetDir = new Vector3();
const localPivot = new Vector3();
const surfaceN = new Vector3();

let currentFov = settings.fov;
let smoothedDist: number = SHIP.cameraDistance;
let hasSmoothed = false;

const IGNORE_SELF = new Set(["player-ship"]);

// Chase camera for the ship. Spring-arms against the active planet collider +
// registered occluders so it can't sink into terrain/props. Collision is ONLY
// used near the planet — casting from huge planet-local coordinates (deep
// space) loses float32 precision and violently shakes the camera.
export function updateShipCamera(
  camera: PerspectiveCamera,
  shipRenderPos: Vector3,
  shipLocalPos: Vector3 | null,
  shipOrientation: Quaternion,
  dt: number,
  boosting: boolean,
  warpPhase: string,
  physics: Physics,
  planetMaxR = 0,
  surfaceRadiusFn?: (nx: number, ny: number, nz: number) => number,
  landBlend = 0,
): number {
  back.set(0, 0, 1).applyQuaternion(shipOrientation);
  up.set(0, 1, 0).applyQuaternion(shipOrientation);

  const distScale = 1 - Math.max(0, Math.min(1, landBlend)) * 0.28;
  offset.copy(back).multiplyScalar(SHIP.cameraDistance * distScale)
    .addScaledVector(up, SHIP.cameraHeight * distScale);
  let wanted = offset.length();
  offsetDir.copy(offset).multiplyScalar(1 / wanted);

  let blocked = wanted;
  const nearPlanet = !!shipLocalPos
    && !!physics.activeCollider
    && planetMaxR > 0
    && shipLocalPos.length() < planetMaxR * SHIP.cameraCollisionMaxRange;

  if (nearPlanet && shipLocalPos && physics.activeCollider) {
    localPivot.copy(shipLocalPos);
    const ray = new physics.rapier.Ray(
      { x: localPivot.x, y: localPivot.y, z: localPivot.z },
      { x: offsetDir.x, y: offsetDir.y, z: offsetDir.z },
    );
    const hit = physics.world.castRay(ray, wanted, true);
    if (hit) {
      blocked = Math.max(SHIP.cameraMinDist, hit.timeOfImpact - SHIP.cameraCollisionPad);
    }

    const occ = castCameraOccluders(localPivot, offsetDir, blocked, IGNORE_SELF);
    if (occ < blocked) {
      blocked = Math.max(SHIP.cameraMinDist, occ - SHIP.cameraCollisionPad * 0.5);
    }
  }

  if (!hasSmoothed) {
    smoothedDist = blocked;
    hasSmoothed = true;
  } else {
    const rate = blocked < smoothedDist
      ? SHIP.cameraCollisionSmooth * 1.6
      : SHIP.cameraCollisionSmooth;
    const k = 1 - Math.exp(-rate * dt);
    smoothedDist += (blocked - smoothedDist) * k;
  }

  desiredPos.copy(shipRenderPos).addScaledVector(offsetDir, smoothedDist);

  const followRate = landBlend > 0
    ? SHIP.cameraFollow * (0.4 + 0.6 * landBlend)
    : SHIP.cameraFollow;
  const followSpeed = Math.min(1, 1 - Math.exp(-followRate * dt));
  camera.position.lerp(desiredPos, followSpeed);

  if (nearPlanet && shipLocalPos && surfaceRadiusFn) {
    localPivot.copy(shipLocalPos).add(camera.position).sub(shipRenderPos);
    surfaceN.copy(localPivot);
    const camR = surfaceN.length();
    if (camR > 1e-4) {
      surfaceN.multiplyScalar(1 / camR);
      const minR = surfaceRadiusFn(surfaceN.x, surfaceN.y, surfaceN.z) + 2.2;
      if (camR < minR) {
        localPivot.copy(surfaceN).multiplyScalar(minR);
        camera.position.copy(localPivot).sub(shipLocalPos).add(shipRenderPos);
        smoothedDist = Math.min(smoothedDist, camera.position.distanceTo(shipRenderPos));
      }
    }
  }

  lookTarget.copy(shipRenderPos).addScaledVector(up, SHIP.cameraHeight * 0.3);
  camera.up.set(0, 1, 0).applyQuaternion(shipOrientation);
  camera.lookAt(lookTarget);

  let targetFov = settings.fov;
  if (warpPhase !== "idle") targetFov += SHIP.warpFovAdd;
  else if (boosting) targetFov += SHIP.boostFovAdd;

  currentFov += (targetFov - currentFov) * Math.min(1, dt * 7);
  if (Math.abs(camera.fov - currentFov) > 0.05) {
    camera.fov = currentFov;
    camera.updateProjectionMatrix();
  }

  return camera.position.distanceTo(shipRenderPos);
}

export function resetShipCameraFov(camera: PerspectiveCamera) {
  currentFov = settings.fov;
  camera.fov = settings.fov;
  camera.updateProjectionMatrix();
  hasSmoothed = false;
  smoothedDist = SHIP.cameraDistance;
}
