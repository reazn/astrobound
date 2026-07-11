import type { GameEvent, EventRequest } from "./events";
import type { TradeSession } from "./mining";
import { createTradeSession } from "./mining";

export interface TradeEscrowState {
  session: TradeSession;
  lockedUuids: string[];
}

export interface CombatAoiConfig {
  radius: number;
  tickRateHz: number;
}

export const DEFAULT_COMBAT_AOI: CombatAoiConfig = {
  radius: 120,
  tickRateHz: 30,
};

export interface MarketplaceFillRequest {
  listingId: string;
  buyerId: string;
  itemUuid: string;
}

export function tradeOfferEvent(session: TradeSession): GameEvent {
  return {
    type: "trade.offer",
    tradeId: session.tradeId,
    fromPlayerId: session.fromPlayerId,
    toPlayerId: session.toPlayerId,
  };
}

export function tradeAcceptEvent(tradeId: string): GameEvent {
  return { type: "trade.accept", tradeId };
}

export function tradeCancelEvent(tradeId: string, reason?: string): GameEvent {
  return { type: "trade.cancel", tradeId, reason };
}

export function combatHitEvent(attackerId: string, targetId: string, damage: number, weaponId?: string): GameEvent {
  return { type: "combat.hit", attackerId, targetId, damage, weaponId };
}

export function marketListEvent(
  listingId: string,
  sellerId: string,
  itemId: string,
  qty: number,
  price: number,
): GameEvent {
  return { type: "market.list", listingId, sellerId, itemId, qty, price };
}

export function marketFillEvent(listingId: string, buyerId: string): GameEvent {
  return { type: "market.fill", listingId, buyerId };
}

export function parseTradeOfferRequest(
  fromPlayerId: string,
  req: EventRequest,
): TradeSession | null {
  if (req.type !== "trade.offer") return null;
  return createTradeSession(fromPlayerId, req.targetPlayerId, req.offerUuids, req.requestUuids);
}

export function shouldUseCombatAoi(distance: number, cfg = DEFAULT_COMBAT_AOI): boolean {
  return distance <= cfg.radius;
}
