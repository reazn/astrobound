import {
  Group, Mesh, CylinderGeometry, TorusGeometry, SphereGeometry, BoxGeometry,
  MeshStandardMaterial, MeshBasicMaterial, PointLight, Color, AdditiveBlending,
} from "three";
import { DOCK_BAY_COUNT } from "../content/station";

export interface StationModel {
  group: Group;
  ringAngle: number;
  update(dt: number): void;
}

export function createStation(): StationModel {
  const group = new Group();
  const hullMat = new MeshStandardMaterial({ color: "#8a93a3", roughness: 0.6, metalness: 0.4 });
  const accentMat = new MeshStandardMaterial({ color: "#3a4a6a", roughness: 0.4, metalness: 0.5 });
  const lightMat = new MeshStandardMaterial({
    color: "#ffe9b0", emissive: new Color("#ffe9b0"), emissiveIntensity: 1.8,
  });
  const bayMat = new MeshStandardMaterial({
    color: "#4a8aff", emissive: new Color("#2a5acc"), emissiveIntensity: 0.6,
  });

  const beacon = new Mesh(
    new SphereGeometry(28, 16, 12),
    new MeshBasicMaterial({ color: "#7ab0ff", transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false }),
  );
  group.add(beacon);

  const hub = new Mesh(new SphereGeometry(18, 20, 16), hullMat);
  hub.castShadow = true;
  group.add(hub);

  const spokeGeo = new CylinderGeometry(2.8, 2.8, 36, 8);
  for (let i = 0; i < 4; i++) {
    const spoke = new Mesh(spokeGeo, accentMat);
    const angle = (i / 4) * Math.PI * 2;
    spoke.position.set(Math.cos(angle) * 24, 0, Math.sin(angle) * 24);
    spoke.rotation.z = Math.PI / 2;
    spoke.rotation.y = -angle;
    spoke.castShadow = true;
    group.add(spoke);

    const light = new Mesh(new BoxGeometry(1.4, 1.4, 1.4), lightMat);
    light.position.copy(spoke.position).multiplyScalar(1.25);
    group.add(light);
  }

  const ring = new Group();
  const ringMesh = new Mesh(new TorusGeometry(48, 4, 12, 48), hullMat);
  ringMesh.rotation.x = Math.PI / 2;
  ringMesh.castShadow = true;
  ring.add(ringMesh);

  for (let i = 0; i < DOCK_BAY_COUNT; i++) {
    const angle = (i / DOCK_BAY_COUNT) * Math.PI * 2;
    const bay = new Mesh(new BoxGeometry(10, 6, 12), bayMat);
    bay.position.set(Math.cos(angle) * 48, 0, Math.sin(angle) * 48);
    bay.lookAt(0, 0, 0);
    ring.add(bay);

    const beaconLight = new Mesh(new SphereGeometry(2, 8, 8), lightMat);
    beaconLight.position.copy(bay.position).addScaledVector(bay.position.clone().normalize(), 8);
    ring.add(beaconLight);
  }

  group.add(ring);

  const glow = new PointLight(new Color("#7ab0ff"), 2.2, 12000, 1);
  glow.position.set(0, 0, 0);
  group.add(glow);

  const state = { ringAngle: 0 };

  return {
    group,
    get ringAngle() { return state.ringAngle; },
    update(dt) {
      state.ringAngle += dt * 0.08;
      ring.rotation.y = state.ringAngle;
      beacon.scale.setScalar(1 + Math.sin(state.ringAngle * 3) * 0.08);
    },
  };
}
