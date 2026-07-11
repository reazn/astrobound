import type { CoordFrame, Vec3 } from "../net/protocol";

export type ChatChannel = "group" | "system" | "nearby" | "global" | "whisper";

export type PlayerRole = "user" | "admin";

export interface GroupMemberBeacon {
  playerId: string;
  displayName: string;
  systemId: string;
  frame: CoordFrame;
  position: Vec3;
  possession: "onFoot" | "ship";
}

export type GameEvent =
  | { type: "player.possess"; playerId: string; mode: "onFoot" | "ship" }
  | { type: "interact.start"; playerId: string; targetId: string; interact: string }
  | { type: "mine.hit"; playerId: string; nodeId: string; damage: number }
  | { type: "mine.depleted"; nodeId: string; planetId: string }
  | { type: "drop.spawn"; dropId: string; planetId: string; itemId: string; qty: number; position: Vec3 }
  | { type: "drop.pickup"; dropId: string; playerId: string }
  | { type: "drop.despawn"; dropId: string }
  | { type: "inventory.changed"; playerId: string; revision: number }
  | { type: "chat.message"; channel: ChatChannel; playerId: string; displayName: string; text: string; ts: number }
  | { type: "emote"; playerId: string; emoteId: string }
  | { type: "group.update"; groupId: string; members: GroupMemberBeacon[] }
  | { type: "group.invite"; groupId: string; fromPlayerId: string; toPlayerId: string }
  | { type: "group.join"; groupId: string; playerId: string }
  | { type: "group.leave"; groupId: string; playerId: string }
  | { type: "trade.offer"; tradeId: string; fromPlayerId: string; toPlayerId: string }
  | { type: "trade.accept"; tradeId: string }
  | { type: "trade.cancel"; tradeId: string; reason?: string }
  | { type: "combat.hit"; attackerId: string; targetId: string; damage: number; weaponId?: string }
  | { type: "market.list"; listingId: string; sellerId: string; itemId: string; qty: number; price: number }
  | { type: "market.fill"; listingId: string; buyerId: string };

export type EventRequest =
  | { type: "mine.hit"; nodeId: string; position: Vec3 }
  | { type: "drop.pickup"; dropId: string }
  | { type: "drop.spawn"; itemId: string; qty: number; position: Vec3; planetId: string }
  | { type: "inventory.move"; from: InventoryLocWire; to: InventoryLocWire }
  | { type: "inventory.equip"; from: InventoryLocWire }
  | { type: "inventory.unequip"; slot: EquipSlotWire }
  | { type: "inventory.split"; from: InventoryLocWire; amount: number }
  | { type: "chat.send"; channel: ChatChannel; text: string; targetPlayerId?: string }
  | { type: "group.invite"; targetPlayerId: string }
  | { type: "group.accept"; groupId: string }
  | { type: "group.leave" }
  | { type: "friend.add"; displayName: string }
  | { type: "friend.accept"; friendshipId: string }
  | { type: "trade.offer"; targetPlayerId: string; offerUuids: string[]; requestUuids: string[] }
  | { type: "trade.accept"; tradeId: string }
  | { type: "trade.cancel"; tradeId: string }
  | { type: "combat.hit"; targetId: string; weaponId?: string };

export type EquipSlotWire = "mount" | "helmet" | "backpack" | "boots";

export type InventoryLocWire =
  | { kind: "bag"; index: number }
  | { kind: "equip"; slot: EquipSlotWire };

export interface EventResult {
  ok: boolean;
  error?: string;
  event?: GameEvent;
  events?: GameEvent[];
}
