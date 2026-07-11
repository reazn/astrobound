import { Vector3 } from "three";
import type { PlanetOre } from "../visuals/planetOre";
import type { PlanetInstance } from "../worldgen/planetInstance";

const MINE_RANGE = 4.2;
const LOOK_DOT = 0.72;

const toCam = new Vector3();
const oreWorld = new Vector3();

export interface FocusedOre {
  nodeId: string;
  index: number;
  kind: string;
  localPos: Vector3;
  planetId: string;
}

const depleted = new Set<string>();

export function markOreDepleted(nodeId: string, ore: PlanetOre | null | undefined) {
  depleted.add(nodeId);
  if (!ore) return;
  const i = ore.nodeIds.indexOf(nodeId);
  if (i < 0) return;
  const mesh = ore.group.children[i];
  if (mesh) mesh.visible = false;
}

export function pulseOreHit(nodeId: string, ore: PlanetOre | null | undefined) {
  if (!ore) return;
  const i = ore.nodeIds.indexOf(nodeId);
  if (i < 0) return;
  const mesh = ore.group.children[i];
  if (!mesh) return;
  const base = mesh.scale.x || 1;
  mesh.scale.setScalar(base * 1.12);
  window.setTimeout(() => {
    if (mesh.visible) mesh.scale.setScalar(base);
  }, 90);
}

export function isOreDepleted(nodeId: string): boolean {
  return depleted.has(nodeId);
}

export function findFocusedOre(
  planet: PlanetInstance,
  playerLocal: Vector3,
  camWorld: Vector3,
  camForward: Vector3,
  planetLodPos: Vector3,
): FocusedOre | null {
  const ore = planet.ore;
  let best: FocusedOre | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i < ore.centers.length; i++) {
    const nodeId = ore.nodeIds[i];
    if (depleted.has(nodeId)) continue;
    const center = ore.centers[i];
    const dist = center.distanceTo(playerLocal);
    if (dist > MINE_RANGE + ore.radii[i]) continue;

    oreWorld.copy(planetLodPos).add(center);
    toCam.copy(oreWorld).sub(camWorld);
    const len = toCam.length();
    if (len < 1e-4) continue;
    toCam.multiplyScalar(1 / len);
    const dot = toCam.dot(camForward);
    if (dot < LOOK_DOT) continue;

    const score = dot * 2 - dist * 0.12;
    if (score > bestScore) {
      bestScore = score;
      best = {
        nodeId,
        index: i,
        kind: ore.kinds[i],
        localPos: center,
        planetId: planet.def.id,
      };
    }
  }
  return best;
}

export function applyDepletedToPlanet(planet: PlanetInstance) {
  for (const nodeId of depleted) {
    if (!nodeId.startsWith(`${planet.def.id}:`)) continue;
    markOreDepleted(nodeId, planet.ore);
  }
}
