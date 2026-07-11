import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group,
  Points, PointsMaterial, Vector3,
} from "three";
import type { AnimatedCharacter } from "../visuals/animatedCharacter";

const COUNT = 96;
const DURATION = 1.0;

export type BoardFxMode = "idle" | "boarding" | "exiting";

export interface ShipBoardFx {
  group: Group;
  readonly mode: BoardFxMode;
  readonly t: number;
  startBoarding(from: Vector3, to: Vector3): void;
  startExiting(from: Vector3, to: Vector3): void;
  update(dt: number, character: AnimatedCharacter): boolean;
  dispose(): void;
}

export function createShipBoardFx(): ShipBoardFx {
  const group = new Group();
  group.visible = false;

  const positions = new Float32Array(COUNT * 3);
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  const mat = new PointsMaterial({
    color: new Color("#7ef0ff"),
    size: 0.18,
    transparent: true,
    opacity: 0.9,
    blending: AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    fog: false,
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  group.add(points);

  const from = new Vector3();
  const to = new Vector3();
  const seeds = Array.from({ length: COUNT }, () => ({
    ox: (Math.random() - 0.5) * 0.9,
    oy: Math.random() * 1.6,
    oz: (Math.random() - 0.5) * 0.9,
    lag: Math.random() * 0.35,
  }));

  let mode: BoardFxMode = "idle";
  let t = 0;

  return {
    group,
    get mode() { return mode; },
    get t() { return t; },
    startBoarding(a, b) {
      from.copy(a);
      to.copy(b);
      mode = "boarding";
      t = 0;
      group.visible = true;
      mat.opacity = 1;
    },
    startExiting(a, b) {
      from.copy(a);
      to.copy(b);
      mode = "exiting";
      t = 0;
      group.visible = true;
      mat.opacity = 1;
    },
    update(dt, character) {
      if (mode === "idle") return true;
      t = Math.min(1, t + dt / DURATION);
      const ease = t * t * (3 - 2 * t);

      // Boarding: dissolve toward ship. Exiting: materialize from ship.
      const vanish = mode === "boarding" ? ease : 1 - ease;
      character.setOpacity(Math.max(0.02, 1 - vanish));
      character.object.visible = vanish < 0.98;

      const src = mode === "boarding" ? from : to;
      const dst = mode === "boarding" ? to : from;

      for (let i = 0; i < COUNT; i++) {
        const s = seeds[i];
        const u = Math.min(1, Math.max(0, (ease - s.lag) / (1 - s.lag * 0.5)));
        const px = src.x + (dst.x - src.x) * u + s.ox * (1 - u);
        const py = src.y + (dst.y - src.y) * u + s.oy * (1 - u) * 0.6;
        const pz = src.z + (dst.z - src.z) * u + s.oz * (1 - u);
        const o = i * 3;
        positions[o] = px;
        positions[o + 1] = py;
        positions[o + 2] = pz;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 0.25 + (1 - Math.abs(ease - 0.5) * 2) * 0.75;
      mat.size = 0.12 + (1 - vanish) * 0.14;

      if (t >= 1) {
        mode = "idle";
        group.visible = false;
        if (vanish >= 0.98) {
          character.setOpacity(0);
          character.object.visible = false;
        } else {
          character.setOpacity(1);
          character.object.visible = true;
        }
        return true;
      }
      return false;
    },
    dispose() {
      group.removeFromParent();
      geo.dispose();
      mat.dispose();
    },
  };
}
