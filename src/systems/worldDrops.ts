import {
  Group, Vector3, Color, AdditiveBlending, Quaternion,
  Points, BufferGeometry, BufferAttribute, PointsMaterial,
  PointLight, Mesh, MeshStandardMaterial,
} from "three";
import { getItem, getItemModelBuilder } from "../content/items";
import { describeEntity } from "../ecs/gameEntity";
import { registerCameraOccluder, unregisterCameraOccluder } from "./cameraOccluders";
import { giveItem, type PlayerInventory } from "../inventory/playerInventory";
import type { PlanetInstance } from "../worldgen/planetInstance";

export interface WorldDrop {
  id: string;
  planetId: string;
  itemId: string;
  qty: number;
  localPos: Vector3;
  root: Group;
  spin: number;
  light: PointLight;
  plume: Points;
  plumePos: Float32Array;
}

const PICKUP_RANGE = 3.4;
const LOOK_DOT = 0.78;
const PLUME_COUNT = 18;

const drops: WorldDrop[] = [];
const toCam = new Vector3();
const dropWorld = new Vector3();
const up = new Vector3();
const yUp = new Vector3(0, 1, 0);
const orientQ = new Quaternion();
let nextId = 1;

export function getWorldDrops(): readonly WorldDrop[] {
  return drops;
}

function boostItemMaterials(root: Group) {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const m = mat as MeshStandardMaterial;
      if (!m.isMeshStandardMaterial) continue;
      m.emissive = m.emissive?.getHex?.() ? m.emissive : new Color("#222018");
      if (m.emissive.getHex() === 0) m.emissive.setHex(0x2a2418);
      m.emissiveIntensity = Math.max(m.emissiveIntensity ?? 0, 0.55);
      m.metalness = Math.min(0.85, (m.metalness ?? 0.5) + 0.1);
      m.roughness = Math.max(0.2, (m.roughness ?? 0.5) - 0.15);
      m.needsUpdate = true;
    }
  });
}

export function spawnWorldDrop(
  planet: PlanetInstance,
  localPos: Vector3,
  itemId: string,
  qty: number,
): WorldDrop | null {
  const make = getItemModelBuilder(itemId);
  if (!make || qty < 1) return null;

  up.copy(localPos).normalize();
  const r = planet.planet.surfaceRadius(up.x, up.y, up.z) + 0.7;
  const seated = up.clone().multiplyScalar(r);

  const built = make();
  const root = new Group();
  const visual = new Group();
  visual.add(built.root);
  built.root.scale.setScalar(1.45);
  built.root.position.set(0, 0.35, 0);
  boostItemMaterials(built.root);
  root.add(visual);

  const light = new PointLight(new Color("#ffe6b0"), 2.4, 8, 2);
  light.position.set(0, 1.1, 0);
  root.add(light);

  const plumePos = new Float32Array(PLUME_COUNT * 3);
  const plumeGeo = new BufferGeometry();
  plumeGeo.setAttribute("position", new BufferAttribute(plumePos, 3));
  const plumeMat = new PointsMaterial({
    color: new Color("#f0d58a"),
    size: 0.09,
    transparent: true,
    opacity: 0.85,
    blending: AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    fog: false,
  });
  const plume = new Points(plumeGeo, plumeMat);
  plume.frustumCulled = false;
  plume.position.set(0, 0.2, 0);
  root.add(plume);

  orientQ.setFromUnitVectors(yUp, up);
  root.quaternion.copy(orientQ);
  root.position.copy(seated);
  planet.lod.add(root);

  const id = `drop-${nextId++}`;
  const drop: WorldDrop = {
    id,
    planetId: planet.def.id,
    itemId,
    qty,
    localPos: seated.clone(),
    root,
    spin: 0,
    light,
    plume,
    plumePos,
  };
  drops.push(drop);

  registerCameraOccluder({
    desc: describeEntity(id, "rock", {
      kind: "prop",
      label: getItem(itemId)?.name ?? itemId,
      cameraRadius: 0.8,
      blocksCamera: true,
    }),
    getCenter: (out) => out.copy(drop.localPos),
    enabled: true,
  });

  return drop;
}

export function removeWorldDrop(drop: WorldDrop) {
  const i = drops.indexOf(drop);
  if (i >= 0) drops.splice(i, 1);
  unregisterCameraOccluder(drop.id);
  drop.root.removeFromParent();
  drop.root.traverse((o) => {
    const mesh = o as {
      geometry?: { dispose: () => void };
      material?: { dispose: () => void } | Array<{ dispose: () => void }>;
    };
    mesh.geometry?.dispose?.();
    if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose?.());
    else mesh.material?.dispose?.();
  });
}

export function updateWorldDrops(dt: number, planetId: string | null) {
  const t = performance.now() * 0.001;
  for (const drop of drops) {
    if (planetId && drop.planetId !== planetId) {
      drop.root.visible = false;
      continue;
    }
    drop.root.visible = true;
    drop.root.position.copy(drop.localPos);
    drop.spin += dt * 0.7;
    const visual = drop.root.children[0];
    if (visual) {
      visual.rotation.y = drop.spin;
      visual.position.y = Math.sin(drop.spin * 2.1) * 0.04;
    }
    drop.light.intensity = 2.1 + Math.sin(t * 3.2 + drop.spin) * 0.35;

    // Single vertical particle column rising above the item.
    for (let i = 0; i < PLUME_COUNT; i++) {
      const u = i / (PLUME_COUNT - 1);
      const rise = (t * 0.55 + u) % 1;
      const o = i * 3;
      drop.plumePos[o] = 0;
      drop.plumePos[o + 1] = 0.4 + rise * 1.8;
      drop.plumePos[o + 2] = 0;
    }
    const attr = drop.plume.geometry.getAttribute("position");
    attr.needsUpdate = true;
    (drop.plume.material as PointsMaterial).opacity = 0.55 + Math.sin(t * 4) * 0.15;
  }
}

export function findFocusedDrop(
  planetId: string,
  playerLocal: Vector3,
  camWorld: Vector3,
  camForward: Vector3,
  planetLodPos: Vector3,
): WorldDrop | null {
  let best: WorldDrop | null = null;
  let bestScore = -Infinity;

  for (const drop of drops) {
    if (drop.planetId !== planetId) continue;
    const dist = drop.localPos.distanceTo(playerLocal);
    if (dist > PICKUP_RANGE) continue;

    dropWorld.copy(planetLodPos).add(drop.localPos);
    toCam.copy(dropWorld).sub(camWorld);
    const len = toCam.length();
    if (len < 1e-4) continue;
    toCam.multiplyScalar(1 / len);
    const dot = toCam.dot(camForward);
    if (dot < LOOK_DOT) continue;

    const score = dot * 2 - dist * 0.15;
    if (score > bestScore) {
      bestScore = score;
      best = drop;
    }
  }
  return best;
}

export function tryPickupDrop(drop: WorldDrop, inv: PlayerInventory): boolean {
  if (!giveItem(inv, drop.itemId, drop.qty)) return false;
  removeWorldDrop(drop);
  return true;
}

export function rebindWorldDropOccluders() {
  for (const drop of drops) {
    registerCameraOccluder({
      desc: describeEntity(drop.id, "rock", {
        kind: "prop",
        label: getItem(drop.itemId)?.name ?? drop.itemId,
        cameraRadius: 0.8,
        blocksCamera: true,
      }),
      getCenter: (out) => out.copy(drop.localPos),
      enabled: true,
    });
  }
}
