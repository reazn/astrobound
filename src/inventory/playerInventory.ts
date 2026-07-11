import type { EquipSlot } from "../content/items/types";
import { getItem, itemMaxStack, type ItemDef } from "../content/items";

export const BAG_COLS = 5;
export const BAG_ROWS = 10;
export const BAG_SIZE = BAG_COLS * BAG_ROWS;

export interface ItemStack {
  itemId: string;
  qty: number;
}

export type Equipment = Record<EquipSlot, ItemStack | null>;

export interface PlayerInventory {
  bag: (ItemStack | null)[];
  equipment: Equipment;
}

export type InvLoc =
  | { kind: "bag"; index: number }
  | { kind: "equip"; slot: EquipSlot };

export function createPlayerInventory(): PlayerInventory {
  const bag: (ItemStack | null)[] = Array.from({ length: BAG_SIZE }, () => null);
  bag[0] = { itemId: "silver", qty: 48 };
  bag[1] = { itemId: "silver", qty: 12 };
  bag[2] = { itemId: "pulse_deck", qty: 1 };
  bag[3] = { itemId: "hoverboard", qty: 1 };
  bag[4] = { itemId: "void_rider", qty: 1 };
  bag[5] = { itemId: "starwake", qty: 1 };
  return {
    bag,
    equipment: {
      mount: { itemId: "skiff_plank", qty: 1 },
      helmet: null,
      backpack: null,
      boots: null,
    },
  };
}

export function stackAt(inv: PlayerInventory, loc: InvLoc): ItemStack | null {
  if (loc.kind === "bag") return inv.bag[loc.index] ?? null;
  return inv.equipment[loc.slot];
}

export function setStackAt(inv: PlayerInventory, loc: InvLoc, stack: ItemStack | null) {
  if (loc.kind === "bag") inv.bag[loc.index] = stack;
  else inv.equipment[loc.slot] = stack;
}

export function resolveItem(stack: ItemStack | null): ItemDef | null {
  if (!stack) return null;
  return getItem(stack.itemId) ?? null;
}

export function hasEquippedMount(inv: PlayerInventory, mountKind: string): boolean {
  const stack = inv.equipment.mount;
  if (!stack) return false;
  const item = getItem(stack.itemId);
  return !!item && item.mountKind === mountKind;
}

export function canPlaceInEquip(item: ItemDef, slot: EquipSlot): boolean {
  return item.equipSlot === slot;
}

export function tryMove(
  inv: PlayerInventory,
  from: InvLoc,
  to: InvLoc,
): boolean {
  if (from.kind === to.kind) {
    if (from.kind === "bag" && to.kind === "bag" && from.index === to.index) return false;
    if (from.kind === "equip" && to.kind === "equip" && from.slot === to.slot) return false;
  }

  const a = stackAt(inv, from);
  if (!a) return false;
  const aItem = getItem(a.itemId);
  if (!aItem) return false;

  const b = stackAt(inv, to);

  if (to.kind === "equip") {
    if (!canPlaceInEquip(aItem, to.slot)) return false;
  }
  if (from.kind === "equip" && b) {
    const bItem = getItem(b.itemId);
    if (!bItem || !canPlaceInEquip(bItem, from.slot)) return false;
  }

  if (b && b.itemId === a.itemId && aItem.stackable) {
    const max = itemMaxStack(aItem);
    if (b.qty < max) {
      const space = max - b.qty;
      const moved = Math.min(space, a.qty);
      b.qty += moved;
      a.qty -= moved;
      if (a.qty <= 0) setStackAt(inv, from, null);
      return true;
    }
  }

  setStackAt(inv, from, b);
  setStackAt(inv, to, a);
  return true;
}

export function findEmptyBagSlot(inv: PlayerInventory): number {
  for (let i = 0; i < inv.bag.length; i++) {
    if (!inv.bag[i]) return i;
  }
  return -1;
}

export function giveItem(inv: PlayerInventory, itemId: string, qty = 1): boolean {
  const def = getItem(itemId);
  if (!def) return false;
  let left = qty;
  if (def.stackable) {
    const max = itemMaxStack(def);
    for (const slot of inv.bag) {
      if (!slot || slot.itemId !== itemId) continue;
      const space = max - slot.qty;
      if (space <= 0) continue;
      const add = Math.min(space, left);
      slot.qty += add;
      left -= add;
      if (left <= 0) return true;
    }
  }
  while (left > 0) {
    const i = findEmptyBagSlot(inv);
    if (i < 0) return false;
    const put = def.stackable ? Math.min(left, itemMaxStack(def)) : 1;
    inv.bag[i] = { itemId, qty: put };
    left -= put;
    if (!def.stackable) break;
  }
  return left <= 0;
}

export function tryEquip(inv: PlayerInventory, from: InvLoc): boolean {
  if (from.kind !== "bag") return false;
  const stack = stackAt(inv, from);
  const item = resolveItem(stack);
  if (!stack || !item?.equipSlot) return false;
  return tryMove(inv, from, { kind: "equip", slot: item.equipSlot });
}

export function tryUnequip(inv: PlayerInventory, from: InvLoc): boolean {
  if (from.kind !== "equip") return false;
  const stack = stackAt(inv, from);
  if (!stack) return false;
  const empty = findEmptyBagSlot(inv);
  if (empty < 0) return false;
  setStackAt(inv, from, null);
  setStackAt(inv, { kind: "bag", index: empty }, { itemId: stack.itemId, qty: stack.qty });
  return true;
}

export function splitStack(inv: PlayerInventory, from: InvLoc, amount: number): boolean {
  const stack = stackAt(inv, from);
  const item = resolveItem(stack);
  if (!stack || !item?.stackable || stack.qty < 2) return false;
  const move = Math.floor(amount);
  if (move < 1 || move >= stack.qty) return false;
  const empty = findEmptyBagSlot(inv);
  if (empty < 0) return false;
  stack.qty -= move;
  inv.bag[empty] = { itemId: stack.itemId, qty: move };
  return true;
}

export function takeStack(inv: PlayerInventory, from: InvLoc): ItemStack | null {
  const stack = stackAt(inv, from);
  if (!stack) return null;
  setStackAt(inv, from, null);
  return { itemId: stack.itemId, qty: stack.qty };
}

export function sortBag(inv: PlayerInventory): void {
  const filled: ItemStack[] = [];
  for (const slot of inv.bag) {
    if (slot) filled.push({ itemId: slot.itemId, qty: slot.qty });
  }
  filled.sort((a, b) => {
    const ia = getItem(a.itemId);
    const ib = getItem(b.itemId);
    const ca = ia?.category ?? "";
    const cb = ib?.category ?? "";
    if (ca !== cb) return ca.localeCompare(cb);
    const na = ia?.name ?? a.itemId;
    const nb = ib?.name ?? b.itemId;
    if (na !== nb) return na.localeCompare(nb);
    return b.qty - a.qty;
  });
  for (let i = 0; i < inv.bag.length; i++) inv.bag[i] = null;
  for (let i = 0; i < filled.length; i++) inv.bag[i] = filled[i];
}

/** Merge identical stackable stacks into as few slots as possible. */
export function consolidateStacks(inv: PlayerInventory): void {
  const byId = new Map<string, number>();
  for (const slot of inv.bag) {
    if (!slot) continue;
    byId.set(slot.itemId, (byId.get(slot.itemId) ?? 0) + slot.qty);
  }
  for (let i = 0; i < inv.bag.length; i++) inv.bag[i] = null;
  let cursor = 0;
  for (const [itemId, total] of byId) {
    const def = getItem(itemId);
    if (!def) continue;
    let left = total;
    const max = def.stackable ? itemMaxStack(def) : 1;
    while (left > 0 && cursor < inv.bag.length) {
      const put = Math.min(left, max);
      inv.bag[cursor++] = { itemId, qty: put };
      left -= put;
      if (!def.stackable) break;
    }
  }
}
