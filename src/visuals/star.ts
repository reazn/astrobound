import {
  Group, Mesh, SphereGeometry, MeshBasicMaterial, PointLight, Color,
  AdditiveBlending,
} from "three";
import type { StarDef } from "../config/star";
import { STAR } from "../config/star";

export interface StarVisual {
  group: Group;
  light: PointLight;
  applyDef(def: StarDef): void;
}

export function createStar(def?: StarDef): StarVisual {
  const d: StarDef = def ?? {
    type: "yellow",
    name: "Solara",
    radius: STAR.radius,
    color: STAR.color,
    coronaColor: STAR.coronaColor,
    lightIntensity: STAR.lightIntensity,
    luminosity: 1,
  };

  const group = new Group();
  const coreMat = new MeshBasicMaterial({ color: new Color(d.color), fog: false });
  const core = new Mesh(new SphereGeometry(1, 32, 24), coreMat);
  core.scale.setScalar(d.radius);
  group.add(core);

  const coronaMat = new MeshBasicMaterial({
    color: new Color(d.coronaColor), transparent: true, opacity: 0.35,
    blending: AdditiveBlending, depthWrite: false, fog: false,
  });
  const corona = new Mesh(new SphereGeometry(1, 32, 24), coronaMat);
  corona.scale.setScalar(d.radius * 1.35);
  group.add(corona);

  const light = new PointLight(new Color(d.color), d.lightIntensity, 0, 0.15);
  light.castShadow = false;
  group.add(light);

  return {
    group,
    light,
    applyDef(next) {
      core.scale.setScalar(next.radius);
      corona.scale.setScalar(next.radius * 1.35);
      coreMat.color.set(next.color);
      coronaMat.color.set(next.coronaColor);
      light.color.set(next.color);
      light.intensity = next.lightIntensity;
    },
  };
}
