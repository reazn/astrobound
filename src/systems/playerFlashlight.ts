import {
  SpotLight, PointLight, Object3D, Vector3,
} from "three";

export interface PlayerFlashlight {
  readonly enabled: boolean;
  toggle(): boolean;
  setEnabled(on: boolean): void;
  update(
    active: boolean,
    origin: Vector3,
    forward: Vector3,
    up: Vector3,
  ): void;
  dispose(): void;
}

export function createPlayerFlashlight(scene: Object3D): PlayerFlashlight {
  const pivot = new Object3D();
  scene.add(pivot);

  const spot = new SpotLight(0xfff0d6, 0, 36, Math.PI / 6.2, 0.48, 1.1);
  spot.castShadow = false;
  const spotTarget = new Object3D();
  pivot.add(spot);
  pivot.add(spotTarget);
  spot.target = spotTarget;

  const glow = new PointLight(0xffe4c0, 0, 8, 1.8);
  glow.castShadow = false;
  pivot.add(glow);

  let enabled = false;

  const applyIntensities = (on: boolean) => {
    spot.intensity = on ? 3.4 : 0;
    glow.intensity = on ? 0.7 : 0;
    pivot.visible = on;
  };
  applyIntensities(false);

  return {
    get enabled() {
      return enabled;
    },
    toggle() {
      enabled = !enabled;
      applyIntensities(enabled);
      return enabled;
    },
    setEnabled(on) {
      enabled = on;
      applyIntensities(enabled);
    },
    update(active, origin, forward, up) {
      const on = enabled && active;
      applyIntensities(on);
      if (!on) return;
      pivot.position.copy(origin).addScaledVector(up, 1.4);
      const dir = forward.lengthSq() > 1e-6 ? forward : up.clone().negate();
      spot.position.set(0, 0, 0);
      spotTarget.position.copy(dir).normalize().multiplyScalar(14);
      glow.position.set(0, -0.15, 0.1);
    },
    dispose() {
      pivot.removeFromParent();
      spot.dispose();
      glow.dispose();
    },
  };
}
