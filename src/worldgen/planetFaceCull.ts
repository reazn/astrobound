import { type Mesh, type Object3D, type Vector3 } from "three";

export const CUBE_FACE_DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export function applyCubeFaceVisibility(
  faces: Array<Mesh | Object3D | null | undefined>,
  camPlanetLocal: Vector3,
  planetRadius: number,
) {
  const d = camPlanetLocal.length();
  if (d < 1e-4) return;
  const inv = 1 / d;
  const cx = camPlanetLocal.x * inv;
  const cy = camPlanetLocal.y * inv;
  const cz = camPlanetLocal.z * inv;
  const nearSurface = d < planetRadius * 1.4;
  const bias = nearSurface ? -0.42 : -0.05;

  for (let i = 0; i < 6; i++) {
    const face = faces[i];
    if (!face) continue;
    const fd = CUBE_FACE_DIRS[i];
    face.visible = fd[0] * cx + fd[1] * cy + fd[2] * cz > bias;
  }
}
