export type EquipSlotKind = "mount" | "helmet" | "backpack" | "boots";

export interface ItemInstance {
  uuid: string;
  itemId: string;
  qty: number;
  stackable: boolean;
  traits?: Record<string, unknown>;
  gems?: unknown[];
}

export interface InventorySnapshot {
  inventoryId: string;
  playerId: string;
  kind: string;
  isPrimary: boolean;
  revision: number;
  capacity: number;
  bag: (ItemInstance | null)[];
  equipment: Record<EquipSlotKind, ItemInstance | null>;
}

export type InvLoc =
  | { kind: "bag"; index: number }
  | { kind: "equip"; slot: EquipSlotKind };

export interface ItemCatalogEntry {
  id: string;
  stackable: boolean;
  maxStack: number;
  equipSlot: EquipSlotKind | null;
  mountKind?: string;
}

export interface WorldDropRecord {
  dropId: string;
  planetId: string;
  itemId: string;
  qty: number;
  position: [number, number, number];
  itemUuid: string | null;
}

let uuidCounter = 0;

export function newItemUuid(): string {
  uuidCounter += 1;
  return `item-${Date.now().toString(36)}-${uuidCounter.toString(36)}`;
}

export function stackAt(inv: InventorySnapshot, loc: InvLoc): ItemInstance | null {
  if (loc.kind === "bag") return inv.bag[loc.index] ?? null;
  return inv.equipment[loc.slot];
}

export function setStackAt(inv: InventorySnapshot, loc: InvLoc, item: ItemInstance | null) {
  if (loc.kind === "bag") inv.bag[loc.index] = item;
  else inv.equipment[loc.slot] = item;
}

export function findEmptyBagSlot(inv: InventorySnapshot): number {
  for (let i = 0; i < inv.bag.length; i++) {
    if (!inv.bag[i]) return i;
  }
  return -1;
}

export function tryMoveInventory(
  inv: InventorySnapshot,
  catalog: (id: string) => ItemCatalogEntry | null,
  from: InvLoc,
  to: InvLoc,
): boolean {
  if (from.kind === to.kind) {
    if (from.kind === "bag" && to.kind === "bag" && from.index === to.index) return false;
    if (from.kind === "equip" && to.kind === "equip" && from.slot === to.slot) return false;
  }

  const a = stackAt(inv, from);
  if (!a) return false;
  const aDef = catalog(a.itemId);
  if (!aDef) return false;

  const b = stackAt(inv, to);

  if (to.kind === "equip") {
    if (aDef.equipSlot !== to.slot) return false;
  }
  if (from.kind === "equip" && b) {
    const bDef = catalog(b.itemId);
    if (!bDef || bDef.equipSlot !== from.slot) return false;
  }

  if (b && b.itemId === a.itemId && aDef.stackable) {
    const max = aDef.maxStack;
    if (b.qty < max) {
      const space = max - b.qty;
      const moved = Math.min(space, a.qty);
      b.qty += moved;
      a.qty -= moved;
      if (a.qty <= 0) setStackAt(inv, from, null);
      inv.revision += 1;
      return true;
    }
  }

  setStackAt(inv, from, b);
  setStackAt(inv, to, a);
  inv.revision += 1;
  return true;
}

export function giveItemToInventory(
  inv: InventorySnapshot,
  catalog: (id: string) => ItemCatalogEntry | null,
  itemId: string,
  qty = 1,
  uuid?: string,
): boolean {
  const def = catalog(itemId);
  if (!def) return false;
  let left = qty;

  if (def.stackable) {
    for (const slot of inv.bag) {
      if (!slot || slot.itemId !== itemId) continue;
      const space = def.maxStack - slot.qty;
      if (space <= 0) continue;
      const add = Math.min(space, left);
      slot.qty += add;
      left -= add;
      if (left <= 0) {
        inv.revision += 1;
        return true;
      }
    }
  }

  while (left > 0) {
    const i = findEmptyBagSlot(inv);
    if (i < 0) return false;
    const put = def.stackable ? Math.min(left, def.maxStack) : 1;
    inv.bag[i] = {
      uuid: uuid ?? newItemUuid(),
      itemId,
      qty: put,
      stackable: def.stackable,
    };
    left -= put;
    if (!def.stackable) break;
  }

  inv.revision += 1;
  return left <= 0;
}

export function trySplitInventory(
  inv: InventorySnapshot,
  catalog: (id: string) => ItemCatalogEntry | null,
  from: InvLoc,
  amount: number,
): boolean {
  const stack = stackAt(inv, from);
  if (!stack) return false;
  const def = catalog(stack.itemId);
  if (!def?.stackable || stack.qty < 2) return false;
  const move = Math.floor(amount);
  if (move < 1 || move >= stack.qty) return false;
  const empty = findEmptyBagSlot(inv);
  if (empty < 0) return false;
  stack.qty -= move;
  inv.bag[empty] = {
    uuid: newItemUuid(),
    itemId: stack.itemId,
    qty: move,
    stackable: true,
    traits: stack.traits,
    gems: stack.gems,
  };
  inv.revision += 1;
  return true;
}

export function removeItemByUuid(inv: InventorySnapshot, itemUuid: string): ItemInstance | null {
  for (let i = 0; i < inv.bag.length; i++) {
    const slot = inv.bag[i];
    if (slot?.uuid === itemUuid) {
      inv.bag[i] = null;
      inv.revision += 1;
      return slot;
    }
  }
  for (const slot of Object.keys(inv.equipment) as EquipSlotKind[]) {
    const eq = inv.equipment[slot];
    if (eq?.uuid === itemUuid) {
      inv.equipment[slot] = null;
      inv.revision += 1;
      return eq;
    }
  }
  return null;
}

export function createDefaultInventory(playerId: string, capacity = 50): InventorySnapshot {
  const bag: (ItemInstance | null)[] = Array.from({ length: capacity }, () => null);
  bag[0] = { uuid: newItemUuid(), itemId: "silver", qty: 48, stackable: true };
  bag[1] = { uuid: newItemUuid(), itemId: "silver", qty: 12, stackable: true };
  bag[2] = { uuid: newItemUuid(), itemId: "pulse_deck", qty: 1, stackable: false };
  bag[3] = { uuid: newItemUuid(), itemId: "hoverboard", qty: 1, stackable: false };
  return {
    inventoryId: `inv-${playerId}`,
    playerId,
    kind: "bag",
    isPrimary: true,
    revision: 1,
    capacity,
    bag,
    equipment: {
      mount: { uuid: newItemUuid(), itemId: "skiff_plank", qty: 1, stackable: false },
      helmet: null,
      backpack: null,
      boots: null,
    },
  };
}

export function inventoryFromLegacy(
  playerId: string,
  bag: { itemId: string; qty: number }[],
  equipment: Record<EquipSlotKind, { itemId: string; qty: number } | null>,
): InventorySnapshot {
  const snap = createDefaultInventory(playerId);
  for (let i = 0; i < snap.bag.length; i++) snap.bag[i] = null;
  for (let i = 0; i < bag.length && i < snap.bag.length; i++) {
    const s = bag[i];
    if (!s) continue;
    snap.bag[i] = { uuid: newItemUuid(), itemId: s.itemId, qty: s.qty, stackable: s.qty > 1 };
  }
  for (const slot of Object.keys(equipment) as EquipSlotKind[]) {
    const eq = equipment[slot];
    snap.equipment[slot] = eq
      ? { uuid: newItemUuid(), itemId: eq.itemId, qty: eq.qty, stackable: false }
      : null;
  }
  return snap;
}
