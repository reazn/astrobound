import type { WorldDropRecord } from "./inventoryOps.js";
import type { GameEvent } from "./events.js";
import type { Vec3 } from "./protocol.js";
import { newItemUuid } from "./inventoryOps.js";

export type OreKind = "iron" | "copper" | "crystal" | "carbon";

export interface OreNodeState {
  nodeId: string;
  planetId: string;
  kind: OreKind;
  hp: number;
  maxHp: number;
  position: Vec3;
  depleted: boolean;
}

const ORE_HP = 5;
const ORE_ITEM: Record<OreKind, string> = {
  iron: "silver",
  copper: "silver",
  crystal: "silver",
  carbon: "silver",
};

export function oreNodeId(planetId: string, index: number): string {
  return `${planetId}:ore:${index}`;
}

export function createOreNodes(planetId: string, count: number, seed: string): OreNodeState[] {
  const nodes: OreNodeState[] = [];
  let h = hashSeed(`${seed}-${planetId}-ore`);
  const kinds: OreKind[] = ["iron", "copper", "crystal", "carbon"];
  for (let i = 0; i < count; i++) {
    h = nextHash(h);
    const kind = kinds[h % kinds.length];
    h = nextHash(h);
    const theta = (h % 6283) / 1000;
    h = nextHash(h);
    const phi = (h % 3141) / 1000;
    const r = 800 + (h % 400);
    nodes.push({
      nodeId: oreNodeId(planetId, i),
      planetId,
      kind,
      hp: ORE_HP,
      maxHp: ORE_HP,
      position: [
        r * Math.sin(theta) * Math.cos(phi),
        r * Math.cos(theta),
        r * Math.sin(theta) * Math.sin(phi),
      ],
      depleted: false,
    });
  }
  return nodes;
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function nextHash(h: number): number {
  h ^= h << 13;
  h ^= h >>> 17;
  h ^= h << 5;
  return h >>> 0;
}

export function lootRoll(seed: string, nodeId: string, hitIndex: number): { itemId: string; qty: number } {
  const h = hashSeed(`${seed}:${nodeId}:${hitIndex}`);
  const qty = 1 + (h % 3);
  const kind = nodeId.includes("iron") ? "iron" : "copper";
  return { itemId: ORE_ITEM[kind as OreKind] ?? "silver", qty };
}

export interface MineHitResult {
  events: GameEvent[];
  drop: WorldDropRecord | null;
  depleted: boolean;
}

export function applyMineHit(
  node: OreNodeState,
  playerId: string,
  seed: string,
  hitIndex: number,
): MineHitResult {
  const events: GameEvent[] = [];
  if (node.depleted) return { events, drop: null, depleted: true };

  node.hp -= 1;
  events.push({ type: "mine.hit", playerId, nodeId: node.nodeId, damage: 1 });

  if (node.hp > 0) {
    return { events, drop: null, depleted: false };
  }

  node.depleted = true;
  events.push({ type: "mine.depleted", nodeId: node.nodeId, planetId: node.planetId });

  const loot = lootRoll(seed, node.nodeId, hitIndex);
  const drop: WorldDropRecord = {
    dropId: `drop-${node.nodeId}`,
    planetId: node.planetId,
    itemId: loot.itemId,
    qty: loot.qty,
    position: [...node.position],
    itemUuid: newItemUuid(),
  };
  events.push({
    type: "drop.spawn",
    dropId: drop.dropId,
    planetId: drop.planetId,
    itemId: drop.itemId,
    qty: drop.qty,
    position: drop.position,
  });

  return { events, drop, depleted: true };
}

export interface TradeSession {
  tradeId: string;
  fromPlayerId: string;
  toPlayerId: string;
  offerUuids: string[];
  requestUuids: string[];
  escrowInventoryId: string;
  status: "pending" | "accepted" | "cancelled";
}

export function createTradeSession(
  fromPlayerId: string,
  toPlayerId: string,
  offerUuids: string[],
  requestUuids: string[],
): TradeSession {
  return {
    tradeId: `trade-${Date.now().toString(36)}`,
    fromPlayerId,
    toPlayerId,
    offerUuids,
    requestUuids,
    escrowInventoryId: `escrow-${fromPlayerId}-${toPlayerId}`,
    status: "pending",
  };
}

export interface CombatHitRequest {
  attackerId: string;
  targetId: string;
  weaponId?: string;
  attackerPos: Vec3;
  targetPos: Vec3;
  aimDir: Vec3;
}

export function validateCombatHit(req: CombatHitRequest, maxRange = 80): boolean {
  const dx = req.targetPos[0] - req.attackerPos[0];
  const dy = req.targetPos[1] - req.attackerPos[1];
  const dz = req.targetPos[2] - req.attackerPos[2];
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist > maxRange) return false;
  const len = Math.sqrt(req.aimDir[0] ** 2 + req.aimDir[1] ** 2 + req.aimDir[2] ** 2) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  const nz = dz / dist;
  const dot = (req.aimDir[0] / len) * nx + (req.aimDir[1] / len) * ny + (req.aimDir[2] / len) * nz;
  return dot > 0.65;
}

export interface MarketListing {
  listingId: string;
  sellerId: string;
  itemId: string;
  itemUuid: string;
  qty: number;
  price: number;
  stationId: string;
}

export function createMarketListing(
  sellerId: string,
  itemId: string,
  itemUuid: string,
  qty: number,
  price: number,
  stationId = "meridian",
): MarketListing {
  return {
    listingId: `list-${Date.now().toString(36)}`,
    sellerId,
    itemId,
    itemUuid,
    qty,
    price,
    stationId,
  };
}
