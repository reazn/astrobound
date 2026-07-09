import {
  Group, Mesh, Box3, Vector3, Object3D,
  IcosahedronGeometry, MeshBasicMaterial, Color, AdditiveBlending,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SHIP } from "../config/ship";
import { shipById, type ShipDef } from "../content/ships";
import { makeReadableToon } from "./toonMaterial";

// Loads a selectable ship hull, re-centers it, scales to SHIP.length, and
// corrects orientation to sim forward (local -Z). Procedural emissive glow
// discs at the tail brighten with throttle/boost.

export interface ShipModel {
  group: Group;
  def: ShipDef;
  setEngineGlow(intensity01: number, boosting?: boolean): void;
  setOpacity(o: number): void;
  dispose(): void;
}

const loader = new GLTFLoader();

export async function loadShipModel(shipIdOrDef?: string | ShipDef): Promise<ShipModel> {
  const def = typeof shipIdOrDef === "string" || shipIdOrDef === undefined
    ? shipById(shipIdOrDef ?? "classic")
    : shipIdOrDef;
  const gltf = await loader.loadAsync(def.url);
  const hull = new Group();
  const model = gltf.scene;
  const hullMaterials: import("three").Material[] = [];
  model.traverse((o: Object3D) => {
    const m = o as Mesh;
    if (m.isMesh) {
      m.castShadow = false;
      m.receiveShadow = false;
      m.renderOrder = 10;
      if (Array.isArray(m.material)) {
        m.material = m.material.map((x) => makeReadableToon(x));
      } else {
        m.material = makeReadableToon(m.material);
      }
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) hullMaterials.push(mat);
    }
  });
  hull.add(model);

  const box = new Box3().setFromObject(hull);
  const size = box.getSize(new Vector3());
  const mid = box.getCenter(new Vector3());
  model.position.sub(mid);

  model.rotateY(def.noseYaw);

  const longest = Math.max(size.x, size.y, size.z) || 1;
  hull.scale.setScalar(SHIP.length / longest);

  const group = new Group();
  group.add(hull);

  const glowMat = new MeshBasicMaterial({
    color: new Color("#7fd6ff"), transparent: true, blending: AdditiveBlending, depthWrite: false,
  });
  const boostColor = new Color("#ff9a3a");
  const normalColor = new Color("#7fd6ff");
  const glowGeo = new IcosahedronGeometry(SHIP.length * 0.05, 1);
  const nozzles: Mesh[] = [];
  const tailZ = SHIP.length * 0.42;
  for (const side of [-1, 1]) {
    const gMat = glowMat.clone();
    gMat.fog = false;
    const glow = new Mesh(glowGeo, gMat);
    glow.position.set(side * SHIP.length * 0.14, 0, tailZ);
    glow.renderOrder = 11;
    group.add(glow);
    nozzles.push(glow);
  }

  return {
    group,
    def,
    setEngineGlow(intensity01, boosting = false) {
      const t = Math.max(0.15, Math.min(2.5, intensity01));
      const col = boosting ? boostColor : normalColor;
      for (const n of nozzles) {
        const m = n.material as MeshBasicMaterial;
        m.color.copy(col);
        m.opacity = Math.min(1, 0.35 + t * 0.6);
        const s = 0.8 + t * (boosting ? 0.9 : 0.6);
        n.scale.setScalar(s);
      }
    },
    setOpacity(o) {
      const opaque = o >= 0.999;
      for (const mat of hullMaterials) {
        (mat as { transparent: boolean }).transparent = !opaque;
        (mat as { opacity: number }).opacity = o;
        (mat as { depthWrite: boolean }).depthWrite = opaque;
      }
    },
    dispose() {
      group.removeFromParent();
      group.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) mat?.dispose?.();
        }
      });
    },
  };
}
