import {
  Group, Mesh, SphereGeometry, MeshBasicMaterial, PointLight, Color,
  AdditiveBlending,
} from "three";
import { STAR } from "../config/star";

// The star: an emissive sphere (always rendered at floating-origin-relative
// position, so it stays huge-but-correct-looking from any distance) plus a
// soft additive corona shell and a point light that lights the whole system.

export interface StarVisual {
  group: Group;
  light: PointLight;
}

export function createStar(): StarVisual {
  const group = new Group();

  const core = new Mesh(
    new SphereGeometry(STAR.radius, 32, 24),
    new MeshBasicMaterial({ color: new Color(STAR.color), fog: false }),
  );
  group.add(core);

  const corona = new Mesh(
    new SphereGeometry(STAR.radius * 1.35, 32, 24),
    new MeshBasicMaterial({
      color: new Color(STAR.coronaColor), transparent: true, opacity: 0.35,
      blending: AdditiveBlending, depthWrite: false, fog: false,
    }),
  );
  group.add(corona);

  const light = new PointLight(new Color(STAR.color), STAR.lightIntensity, 0, 0.15);
  light.castShadow = false; // planets use their own directional-ish local light
  group.add(light);

  return { group, light };
}
