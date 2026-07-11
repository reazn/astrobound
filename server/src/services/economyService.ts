import type { WorldDropRecord } from "../shared/inventoryOps.js";
import type { GameEvent, EventRequest, EventResult, PlayerRole } from "../shared/events.js";
import type { TransformSnapshot } from "../shared/protocol.js";
import { validateTransform, validateInteractionRange } from "../shared/validate.js";
import { applyMineHit, createOreNodes, type OreNodeState, createTradeSession, createMarketListing } from "../shared/mining.js";
import { grantItem, moveItem, getCachedInventory, ensurePlayerInventory, equipFromBag, unequipToBag, splitItem } from "./inventoryService.js";

export interface EconomyState {
  drops: WorldDropRecord[];
  oreByPlanet: Map<string, OreNodeState[]>;
  seed: string;
  trades: Map<string, ReturnType<typeof createTradeSession>>;
  listings: ReturnType<typeof createMarketListing>[];
}

export function createEconomyState(seed: string): EconomyState {
  return {
    drops: [],
    oreByPlanet: new Map(),
    seed,
    trades: new Map(),
    listings: [],
  };
}

export function getOreNodes(state: EconomyState, planetId: string): OreNodeState[] {
  if (!state.oreByPlanet.has(planetId)) {
    state.oreByPlanet.set(planetId, createOreNodes(planetId, 24, state.seed));
  }
  return state.oreByPlanet.get(planetId)!;
}

export async function handleEventRequest(
  state: EconomyState,
  playerId: string,
  role: PlayerRole,
  transform: TransformSnapshot | null,
  req: EventRequest,
): Promise<EventResult> {
  if (req.type === "drop.pickup") {
    const drop = state.drops.find((d) => d.dropId === req.dropId);
    if (!drop || !transform) return { ok: false, error: "no_drop" };
    const range = validateInteractionRange(transform.position, drop.position, 4);
    if (!range.ok) return { ok: false, error: range.reason };
    await ensurePlayerInventory(playerId);
    if (!grantItem(playerId, drop.itemId, drop.qty, drop.itemUuid ?? undefined)) {
      return { ok: false, error: "bag_full" };
    }
    state.drops = state.drops.filter((d) => d.dropId !== req.dropId);
    const ev: GameEvent = { type: "drop.pickup", dropId: drop.dropId, playerId };
    return { ok: true, event: ev };
  }

  if (req.type === "drop.spawn") {
    const drop: WorldDropRecord = {
      dropId: `drop-${Date.now()}`,
      planetId: req.planetId,
      itemId: req.itemId,
      qty: req.qty,
      position: [...req.position] as TransformSnapshot["position"],
      itemUuid: null,
    };
    state.drops.push(drop);
    return {
      ok: true,
      event: {
        type: "drop.spawn",
        dropId: drop.dropId,
        planetId: drop.planetId,
        itemId: drop.itemId,
        qty: drop.qty,
        position: drop.position,
      },
    };
  }

  if (req.type === "mine.hit") {
    const planetId = transform?.frame.kind === "planet" ? transform.frame.planetId : null;
    if (!planetId || !transform) return { ok: false, error: "no_planet" };
    const nodes = getOreNodes(state, planetId);
    let node = nodes.find((n) => n.nodeId === req.nodeId);
    if (!node) {
      node = {
        nodeId: req.nodeId,
        planetId,
        kind: "iron",
        hp: 5,
        maxHp: 5,
        position: [...req.position],
        depleted: false,
      };
      nodes.push(node);
    } else {
      node.position = [...req.position];
    }
    const range = validateInteractionRange(transform.position, node.position, 6);
    if (!range.ok) return { ok: false, error: range.reason };
    const result = applyMineHit(node, playerId, state.seed, node.maxHp - node.hp);
    await ensurePlayerInventory(playerId);
    if (result.drop) grantItem(playerId, result.drop.itemId, result.drop.qty, result.drop.itemUuid ?? undefined);
    const events = result.events.filter((e) => e.type !== "drop.spawn");
    if (result.drop) {
      events.push({ type: "inventory.changed", playerId, revision: getCachedInventory(playerId)?.revision ?? 0 });
    }
    return { ok: true, event: events[events.length - 1], events };
  }

  if (req.type === "inventory.move") {
    const ok = moveItem(playerId, req.from, req.to);
    if (!ok) return { ok: false, error: "move_failed" };
    const inv = getCachedInventory(playerId);
    return {
      ok: true,
      event: { type: "inventory.changed", playerId, revision: inv?.revision ?? 0 },
    };
  }

  if (req.type === "inventory.equip") {
    if (req.from.kind !== "bag") return { ok: false, error: "bad_from" };
    const ok = equipFromBag(playerId, req.from.index);
    if (!ok) return { ok: false, error: "equip_failed" };
    const inv = getCachedInventory(playerId);
    return { ok: true, event: { type: "inventory.changed", playerId, revision: inv?.revision ?? 0 } };
  }

  if (req.type === "inventory.unequip") {
    const ok = unequipToBag(playerId, req.slot);
    if (!ok) return { ok: false, error: "unequip_failed" };
    const inv = getCachedInventory(playerId);
    return { ok: true, event: { type: "inventory.changed", playerId, revision: inv?.revision ?? 0 } };
  }

  if (req.type === "inventory.split") {
    const ok = splitItem(playerId, req.from, req.amount);
    if (!ok) return { ok: false, error: "split_failed" };
    const inv = getCachedInventory(playerId);
    return { ok: true, event: { type: "inventory.changed", playerId, revision: inv?.revision ?? 0 } };
  }

  if (req.type === "trade.offer") {
    const session = createTradeSession(playerId, req.targetPlayerId, req.offerUuids, req.requestUuids);
    state.trades.set(session.tradeId, session);
    return {
      ok: true,
      event: { type: "trade.offer", tradeId: session.tradeId, fromPlayerId: playerId, toPlayerId: req.targetPlayerId },
    };
  }

  if (req.type === "trade.cancel") {
    state.trades.delete(req.tradeId);
    return { ok: true, event: { type: "trade.cancel", tradeId: req.tradeId } };
  }

  if (req.type === "combat.hit") {
    return { ok: false, error: "combat_not_enabled" };
  }

  return { ok: false, error: "unsupported" };
}

export function validatePlayerTransform(
  role: PlayerRole,
  next: TransformSnapshot,
  prev: TransformSnapshot | null,
  possession: "onFoot" | "ship",
  movementFlags: number,
  expectedFrame: TransformSnapshot["frame"],
  dt: number,
) {
  return validateTransform(next, {
    role,
    possession,
    movementFlags,
    expectedFrame,
    prev,
    dt,
  });
}

export function createMarketListingEntry(
  state: EconomyState,
  sellerId: string,
  itemId: string,
  itemUuid: string,
  qty: number,
  price: number,
) {
  const listing = createMarketListing(sellerId, itemId, itemUuid, qty, price);
  state.listings.push(listing);
  return listing;
}
