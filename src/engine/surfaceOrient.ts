import { Vector3, Quaternion, Matrix4, type Object3D } from "three";

// Shared helper: build/apply an orientation from a surface (up, faceDir)
// basis. Used for the on-foot player, a landed ship, and to seed a ship's free
// flight quaternion at the moment of launch.

const _right = new Vector3();
const _basis = new Matrix4();
const _q = new Quaternion();

export function basisQuaternion(up: Vector3, faceDir: Vector3, out: Quaternion): Quaternion {
  _right.crossVectors(up, faceDir).normalize();
  _basis.makeBasis(_right, up, faceDir);
  return out.setFromRotationMatrix(_basis);
}

export function orientOnSurface(
  mesh: Object3D, up: Vector3, faceDir: Vector3, snapImmediate = false,
) {
  basisQuaternion(up, faceDir, _q);
  if (snapImmediate) mesh.quaternion.copy(_q);
  else mesh.quaternion.slerp(_q, 0.3);
}
