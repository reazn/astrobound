import {
  Group, Mesh, BoxGeometry, MeshStandardMaterial, Color,
} from "three";

export interface SilverModel {
  group: Group;
  dispose: () => void;
}

export function createSilverModel(): SilverModel {
  const group = new Group();

  const mat = new MeshStandardMaterial({
    color: new Color("#d5e0e8"),
    metalness: 0.88,
    roughness: 0.22,
    emissive: new Color("#3a4550"),
    emissiveIntensity: 0.25,
    envMapIntensity: 1.2,
  });
  const stampMat = new MeshStandardMaterial({
    color: new Color("#a8b8c6"),
    metalness: 0.8,
    roughness: 0.3,
    emissive: new Color("#2a3238"),
    emissiveIntensity: 0.18,
  });

  const bar = new Mesh(new BoxGeometry(0.55, 0.18, 0.28), mat);
  bar.castShadow = true;
  bar.receiveShadow = true;
  group.add(bar);

  const ridge = new Mesh(new BoxGeometry(0.42, 0.04, 0.2), stampMat);
  ridge.position.y = 0.1;
  ridge.castShadow = true;
  group.add(ridge);

  const mark = new Mesh(new BoxGeometry(0.12, 0.02, 0.12), stampMat);
  mark.position.set(0, 0.12, 0);
  group.add(mark);

  group.rotation.y = 0.4;
  group.rotation.x = 0.15;

  return {
    group,
    dispose() {
      bar.geometry.dispose();
      ridge.geometry.dispose();
      mark.geometry.dispose();
      mat.dispose();
      stampMat.dispose();
    },
  };
}
