import {
  BufferGeometry, BufferAttribute, LineSegments, LineBasicMaterial, AdditiveBlending,
  Color, Vector3, type Quaternion,
} from "three";

// No Man's Sky-style hyperdrive whoosh: streak lines rushing past the camera
// along the ship's forward axis while charging / cruising.

const COUNT = 520;
const TUNNEL_R = 120;
const TUNNEL_LEN = 560;
const STREAK = 28;

export interface WarpFx {
  mesh: LineSegments;
  update(
    active: boolean,
    charging: boolean,
    chargeT: number,
    shipRenderPos: Vector3,
    orientation: Quaternion,
    dt: number,
  ): void;
  dispose(): void;
}

export function createWarpFx(): WarpFx {
  // Each streak = 2 vertices (head + tail along local +Z / travel).
  const positions = new Float32Array(COUNT * 2 * 3);
  const centers = new Float32Array(COUNT * 3);
  const speeds = new Float32Array(COUNT);

  const seed = (i: number) => {
    const a = Math.random() * Math.PI * 2;
    const r = 10 + Math.sqrt(Math.random()) * TUNNEL_R;
    centers[i * 3] = Math.cos(a) * r;
    centers[i * 3 + 1] = Math.sin(a) * r;
    centers[i * 3 + 2] = (Math.random() - 0.25) * TUNNEL_LEN;
    speeds[i] = 260 + Math.random() * 740;
  };
  for (let i = 0; i < COUNT; i++) seed(i);

  const writeStreak = (i: number, len: number) => {
    const x = centers[i * 3];
    const y = centers[i * 3 + 1];
    const z = centers[i * 3 + 2];
    const o = i * 6;
    positions[o] = x;
    positions[o + 1] = y;
    positions[o + 2] = z - len * 0.5;
    positions[o + 3] = x;
    positions[o + 4] = y;
    positions[o + 5] = z + len * 0.5;
  };
  for (let i = 0; i < COUNT; i++) writeStreak(i, STREAK);

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(positions, 3));

  const mat = new LineBasicMaterial({
    color: new Color("#efe6ff"),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
  });

  const mesh = new LineSegments(geo, mat);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 8;

  const forward = new Vector3();
  const world = new Vector3();

  return {
    mesh,
    update(active, charging, chargeT, shipRenderPos, orientation, dt) {
      if (!active) {
        mat.opacity = Math.max(0, mat.opacity - dt * 2.8);
        if (mat.opacity <= 0.01) mesh.visible = false;
        return;
      }

      mesh.visible = true;
      const intensity = charging ? 0.25 + chargeT * 0.85 : 1;
      mat.opacity = Math.min(0.95, mat.opacity + dt * 2.4) * intensity;
      mat.color.set(charging ? "#b49aff" : "#f2ecff");

      forward.set(0, 0, -1).applyQuaternion(orientation);
      const rush = charging ? 0.45 + chargeT * 1.8 : 3.6;
      const len = charging ? STREAK * (0.5 + chargeT * 0.9) : STREAK * 2.2;

      for (let i = 0; i < COUNT; i++) {
        let z = centers[i * 3 + 2] + speeds[i] * rush * dt;
        if (z > TUNNEL_LEN * 0.5) {
          const a = Math.random() * Math.PI * 2;
          const r = 10 + Math.sqrt(Math.random()) * TUNNEL_R;
          centers[i * 3] = Math.cos(a) * r;
          centers[i * 3 + 1] = Math.sin(a) * r;
          z = -TUNNEL_LEN * (0.3 + Math.random() * 0.6);
          speeds[i] = 260 + Math.random() * 740;
        }
        if (charging) {
          const x = centers[i * 3];
          const y = centers[i * 3 + 1];
          const ang = dt * (1.1 + chargeT * 3.0);
          const ca = Math.cos(ang), sa = Math.sin(ang);
          centers[i * 3] = x * ca - y * sa;
          centers[i * 3 + 1] = x * sa + y * ca;
          const pull = 1 - dt * chargeT * 0.45;
          centers[i * 3] *= pull;
          centers[i * 3 + 1] *= pull;
        }
        centers[i * 3 + 2] = z;
        writeStreak(i, len);
      }
      geo.attributes.position.needsUpdate = true;

      world.copy(shipRenderPos).addScaledVector(forward, 25);
      mesh.position.copy(world);
      mesh.quaternion.copy(orientation);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
