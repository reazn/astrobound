import {
  BufferGeometry,
  InstancedMesh,
  Mesh,
  type Object3D,
} from "three";

export function geometryTriangleCount(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) return Math.floor(index.count / 3);
  const pos = geometry.getAttribute("position");
  if (!pos) return 0;
  return Math.floor(pos.count / 3);
}

export function meshTriangleCount(mesh: Mesh): number {
  if (!mesh.visible) return 0;
  const base = geometryTriangleCount(mesh.geometry);
  if ((mesh as InstancedMesh).isInstancedMesh) {
    return base * Math.max(0, (mesh as InstancedMesh).count);
  }
  return base;
}

export function countVisibleTriangles(root: Object3D): number {
  let total = 0;
  root.traverseVisible((obj) => {
    const mesh = obj as Mesh;
    if (mesh.isMesh) total += meshTriangleCount(mesh);
  });
  return total;
}
