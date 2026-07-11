import {
  Group, Mesh, BufferGeometry, Float32BufferAttribute,
  MeshStandardMaterial, MeshBasicMaterial, Color, AdditiveBlending,
  TorusGeometry, CylinderGeometry, BufferAttribute, Line, LineBasicMaterial,
  DoubleSide, Vector3,
} from "three";

const TRAIL_POINTS = 80;

export interface Hoverboard {
  group: Group;
  riderAnchor: Group;
  trail: Line;
  setActive(on: boolean): void;
  update(
    dt: number,
    speed01: number,
    grounded: boolean,
    planetPos: Vector3,
    renderLocal: Vector3,
  ): void;
  dispose(): void;
}

function createPlankGeometry(): BufferGeometry {
  const halfL = 0.7;
  const halfW = 0.155;
  const thick = 0.038;
  const segsL = 36;
  const segsW = 6;
  const positions: number[] = [];
  const indices: number[] = [];

  const rocker = (z: number) => {
    const t = Math.abs(z) / halfL;
    const flat = 0.68;
    if (t <= flat) return 0;
    const u = (t - flat) / (1 - flat);
    return u * u * 0.1;
  };

  const widthAt = (z: number) => {
    const t = Math.abs(z) / halfL;
    if (t < 0.82) return halfW;
    const u = (t - 0.82) / 0.18;
    return halfW * (1 - u * u * 0.45);
  };

  const vert = (x: number, y: number, z: number) => {
    positions.push(x, y, z);
  };

  for (let iz = 0; iz <= segsL; iz++) {
    const z = -halfL + (iz / segsL) * halfL * 2;
    const w = widthAt(z);
    const y0 = rocker(z);
    for (let ix = 0; ix <= segsW; ix++) {
      const x = -w + (ix / segsW) * w * 2;
      vert(x, y0 + thick * 0.5, z);
    }
  }
  const topCount = (segsL + 1) * (segsW + 1);
  for (let iz = 0; iz <= segsL; iz++) {
    const z = -halfL + (iz / segsL) * halfL * 2;
    const w = widthAt(z);
    const y0 = rocker(z);
    for (let ix = 0; ix <= segsW; ix++) {
      const x = -w + (ix / segsW) * w * 2;
      vert(x, y0 - thick * 0.5, z);
    }
  }

  const row = segsW + 1;
  for (let iz = 0; iz < segsL; iz++) {
    for (let ix = 0; ix < segsW; ix++) {
      const a = iz * row + ix;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
      const a2 = topCount + a;
      const b2 = topCount + b;
      const c2 = topCount + c;
      const d2 = topCount + d;
      indices.push(a2, b2, c2, b2, d2, c2);
    }
  }

  for (let iz = 0; iz < segsL; iz++) {
    const z0 = -halfL + (iz / segsL) * halfL * 2;
    const z1 = -halfL + ((iz + 1) / segsL) * halfL * 2;
    for (const side of [-1, 1] as const) {
      const w0 = widthAt(z0) * side;
      const w1 = widthAt(z1) * side;
      const y0t = rocker(z0) + thick * 0.5;
      const y0b = rocker(z0) - thick * 0.5;
      const y1t = rocker(z1) + thick * 0.5;
      const y1b = rocker(z1) - thick * 0.5;
      const base = positions.length / 3;
      vert(w0, y0t, z0);
      vert(w0, y0b, z0);
      vert(w1, y1t, z1);
      vert(w1, y1b, z1);
      if (side > 0) indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      else indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  for (const end of [-1, 1] as const) {
    const z = halfL * end;
    const w = widthAt(z);
    const y0 = rocker(z);
    for (let ix = 0; ix < segsW; ix++) {
      const x0 = -w + (ix / segsW) * w * 2;
      const x1 = -w + ((ix + 1) / segsW) * w * 2;
      const base = positions.length / 3;
      vert(x0, y0 + thick * 0.5, z);
      vert(x1, y0 + thick * 0.5, z);
      vert(x0, y0 - thick * 0.5, z);
      vert(x1, y0 - thick * 0.5, z);
      if (end > 0) indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      else indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createHoverboard(): Hoverboard {
  const group = new Group();
  group.visible = false;
  group.renderOrder = 12;

  const visual = new Group();
  group.add(visual);

  const riderAnchor = new Group();
  riderAnchor.position.set(0, 0.02, 0);
  riderAnchor.rotation.y = Math.PI / 2;
  group.add(riderAnchor);

  const deckMat = new MeshStandardMaterial({
    color: new Color("#222a38"),
    metalness: 0.7,
    roughness: 0.35,
    emissive: new Color("#051820"),
    emissiveIntensity: 0.35,
  });
  const stripeMat = new MeshStandardMaterial({
    color: new Color("#3de0ff"),
    metalness: 0.5,
    roughness: 0.28,
    emissive: new Color("#18b0d8"),
    emissiveIntensity: 0.8,
  });
  const glowMat = new MeshBasicMaterial({
    color: new Color("#5ef0ff"),
    transparent: true,
    opacity: 0.55,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
  });
  const ringMat = glowMat.clone();
  ringMat.color = new Color("#7af7ff");

  const deck = new Mesh(createPlankGeometry(), deckMat);
  deck.castShadow = true;
  deck.receiveShadow = true;
  visual.add(deck);

  const stripe = new Mesh(new CylinderGeometry(0.02, 0.02, 1.15, 8), stripeMat);
  stripe.castShadow = true;
  stripe.rotation.x = Math.PI / 2;
  stripe.position.y = 0.022;
  visual.add(stripe);

  const ring = new Mesh(new TorusGeometry(0.32, 0.02, 10, 40), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.12;
  visual.add(ring);

  const ringInner = new Mesh(new TorusGeometry(0.18, 0.01, 8, 32), glowMat);
  ringInner.rotation.x = Math.PI / 2;
  ringInner.position.y = -0.15;
  visual.add(ringInner);

  const disc = new Mesh(
    new CylinderGeometry(0.24, 0.24, 0.008, 32),
    new MeshBasicMaterial({
      color: new Color("#3de8ff"),
      transparent: true,
      opacity: 0.2,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  disc.position.y = -0.135;
  visual.add(disc);

  const trailPositions = new Float32Array(TRAIL_POINTS * 3);
  const trailGeo = new BufferGeometry();
  trailGeo.setAttribute("position", new BufferAttribute(trailPositions, 3));
  trailGeo.setDrawRange(0, 0);
  const trailMat = new LineBasicMaterial({
    color: new Color("#6ef5ff"),
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const trail = new Line(trailGeo, trailMat);
  trail.frustumCulled = false;
  trail.renderOrder = 13;

  const history: Vector3[] = [];
  for (let i = 0; i < TRAIL_POINTS; i++) history.push(new Vector3());
  let histLen = 0;
  let sampleAcc = 0;

  let active = false;
  let bobT = 0;
  let deploy = 0;

  const boardTip = new Vector3();

  return {
    group,
    riderAnchor,
    trail,
    setActive(on) {
      active = on;
      if (!on) {
        group.visible = false;
        histLen = 0;
        trailGeo.setDrawRange(0, 0);
      }
    },
    update(dt, speed01, grounded, planetPos, renderLocal) {
      const want = active ? 1 : 0;
      deploy += (want - deploy) * Math.min(1, dt * 8);
      if (deploy < 0.02 && !active) {
        group.visible = false;
        trailMat.opacity = Math.max(0, trailMat.opacity - dt * 4);
        trail.visible = trailMat.opacity > 0.02;
        return;
      }
      group.visible = true;
      bobT += dt;

      const bob = Math.sin(bobT * 4.2) * 0.035 + Math.sin(bobT * 7.1) * 0.01;
      const lift = grounded ? bob : 0.05 + bob * 0.4;
      visual.position.y = lift;
      visual.scale.setScalar(0.55 + deploy * 0.45);

      const pulse = 0.85 + Math.sin(bobT * 5.5) * 0.15;
      const speedBoost = 0.5 + Math.min(1.2, speed01) * 0.75;
      ring.scale.setScalar(pulse * (0.9 + speedBoost * 0.12));
      ring.rotation.z += dt * (1.8 + speed01 * 3.2);
      ringMat.opacity = (0.35 + speedBoost * 0.4) * deploy * pulse;

      ringInner.scale.setScalar(1.05 + Math.sin(bobT * 6.2) * 0.08);
      ringInner.rotation.z -= dt * (2.6 + speed01 * 2);
      glowMat.opacity = (0.25 + speedBoost * 0.35) * deploy;

      disc.scale.setScalar(0.85 + speedBoost * 0.25);
      (disc.material as MeshBasicMaterial).opacity = (0.12 + speedBoost * 0.18) * deploy;

      boardTip.copy(planetPos);
      const minSpd = 0.12;
      sampleAcc += dt;
      const sampleEvery = speed01 > 0.4 ? 0.016 : 0.028;
      if (active && speed01 > minSpd && sampleAcc >= sampleEvery) {
        sampleAcc = 0;
        if (histLen < TRAIL_POINTS) {
          history[histLen++].copy(boardTip);
        } else {
          for (let i = 0; i < TRAIL_POINTS - 1; i++) history[i].copy(history[i + 1]);
          history[TRAIL_POINTS - 1].copy(boardTip);
        }
      }

      const strength = Math.max(0, (speed01 - 0.08) / 1.1) * deploy;
      trailMat.opacity = strength * 0.9;
      trail.visible = histLen >= 2 && trailMat.opacity > 0.02;
      if (trail.visible) {
        for (let i = 0; i < histLen; i++) {
          const p = history[i];
          const o = i * 3;
          trailPositions[o] = p.x - renderLocal.x;
          trailPositions[o + 1] = p.y - renderLocal.y;
          trailPositions[o + 2] = p.z - renderLocal.z;
        }
        trailGeo.setDrawRange(0, histLen);
        trailGeo.attributes.position.needsUpdate = true;
        trailGeo.computeBoundingSphere();
      }
    },
    dispose() {
      group.removeFromParent();
      trail.removeFromParent();
      deck.geometry.dispose();
      stripe.geometry.dispose();
      ring.geometry.dispose();
      ringInner.geometry.dispose();
      disc.geometry.dispose();
      trailGeo.dispose();
      deckMat.dispose();
      stripeMat.dispose();
      glowMat.dispose();
      ringMat.dispose();
      (disc.material as MeshBasicMaterial).dispose();
      trailMat.dispose();
    },
  };
}
