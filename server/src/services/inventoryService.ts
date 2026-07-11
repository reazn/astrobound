import { eq, and } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import type { InventorySnapshot, ItemInstance } from "../shared/inventoryOps.js";
import {
  createDefaultInventory,
  giveItemToInventory,
  tryMoveInventory,
  trySplitInventory,
  newItemUuid,
} from "../shared/inventoryOps.js";

const ITEM_CATALOG: Record<string, { stackable: boolean; maxStack: number; equipSlot: null | "mount" | "helmet" | "backpack" | "boots" }> = {
  silver: { stackable: true, maxStack: 99, equipSlot: null },
  skiff_plank: { stackable: false, maxStack: 1, equipSlot: "mount" },
  pulse_deck: { stackable: false, maxStack: 1, equipSlot: "mount" },
  hoverboard: { stackable: false, maxStack: 1, equipSlot: "mount" },
  void_rider: { stackable: false, maxStack: 1, equipSlot: "mount" },
  starwake: { stackable: false, maxStack: 1, equipSlot: "mount" },
};

function catalog(id: string) {
  const e = ITEM_CATALOG[id];
  return e ? { id, ...e } : null;
}

const memInventories = new Map<string, InventorySnapshot>();

export async function loadInventory(playerId: string): Promise<InventorySnapshot> {
  if (memInventories.has(playerId)) return memInventories.get(playerId)!;

  try {
    const db = getDb();
    const [invRow] = await db.select().from(schema.inventories)
      .where(and(eq(schema.inventories.playerId, playerId), eq(schema.inventories.isPrimary, true)))
      .limit(1);

    if (!invRow) {
      const snap = createDefaultInventory(playerId);
      memInventories.set(playerId, snap);
      return snap;
    }

    const itemRows = await db.select().from(schema.items).where(eq(schema.items.inventoryId, invRow.id));
    const snap = createDefaultInventory(playerId);
    snap.inventoryId = invRow.id;
    snap.revision = invRow.revision;
    for (let i = 0; i < snap.bag.length; i++) snap.bag[i] = null;
    for (const slot of Object.keys(snap.equipment) as (keyof typeof snap.equipment)[]) {
      snap.equipment[slot] = null;
    }

    for (const row of itemRows) {
      const inst: ItemInstance = {
        uuid: row.uuid,
        itemId: row.itemId,
        qty: row.qty,
        stackable: row.stackable,
        traits: row.traits as Record<string, unknown> | undefined,
        gems: row.gems as unknown[] | undefined,
      };
      if (row.slot !== null && row.slot >= 0 && row.slot < snap.bag.length) {
        snap.bag[row.slot] = inst;
      }
    }

    memInventories.set(playerId, snap);
    return snap;
  } catch {
    const snap = createDefaultInventory(playerId);
    memInventories.set(playerId, snap);
    return snap;
  }
}

export async function saveInventory(snap: InventorySnapshot): Promise<void> {
  memInventories.set(snap.playerId, snap);
  try {
    const db = getDb();
    let invId = snap.inventoryId;
    if (!invId.startsWith("inv-")) {
      await db.update(schema.inventories)
        .set({ revision: snap.revision })
        .where(eq(schema.inventories.id, invId));
    }
  } catch {
    /* db optional in dev */
  }
}

export function moveItem(
  playerId: string,
  from: { kind: string; index?: number; slot?: string },
  to: { kind: string; index?: number; slot?: string },
): boolean {
  const inv = memInventories.get(playerId);
  if (!inv) return false;
  const ok = tryMoveInventory(
    inv,
    catalog,
    from.kind === "equip" ? { kind: "equip", slot: from.slot as "mount" } : { kind: "bag", index: from.index ?? 0 },
    to.kind === "equip" ? { kind: "equip", slot: to.slot as "mount" } : { kind: "bag", index: to.index ?? 0 },
  );
  if (ok) void saveInventory(inv);
  return ok;
}

export function equipFromBag(playerId: string, bagIndex: number): boolean {
  const inv = memInventories.get(playerId);
  if (!inv) return false;
  const stack = inv.bag[bagIndex];
  if (!stack) return false;
  const def = catalog(stack.itemId);
  if (!def?.equipSlot) return false;
  return moveItem(playerId, { kind: "bag", index: bagIndex }, { kind: "equip", slot: def.equipSlot });
}

export function unequipToBag(playerId: string, slot: "mount" | "helmet" | "backpack" | "boots"): boolean {
  const inv = memInventories.get(playerId);
  if (!inv) return false;
  const empty = inv.bag.findIndex((s) => !s);
  if (empty < 0) return false;
  return moveItem(playerId, { kind: "equip", slot }, { kind: "bag", index: empty });
}

export function splitItem(
  playerId: string,
  from: { kind: string; index?: number; slot?: string },
  amount: number,
): boolean {
  const inv = memInventories.get(playerId);
  if (!inv) return false;
  const ok = trySplitInventory(
    inv,
    catalog,
    from.kind === "equip"
      ? { kind: "equip", slot: from.slot as "mount" }
      : { kind: "bag", index: from.index ?? 0 },
    amount,
  );
  if (ok) void saveInventory(inv);
  return ok;
}

export function grantItem(playerId: string, itemId: string, qty: number, uuid?: string): boolean {
  const inv = memInventories.get(playerId);
  if (!inv) return false;
  const ok = giveItemToInventory(inv, catalog, itemId, qty, uuid ?? newItemUuid());
  if (ok) void saveInventory(inv);
  return ok;
}

export function getCachedInventory(playerId: string): InventorySnapshot | undefined {
  return memInventories.get(playerId);
}

export async function ensurePlayerInventory(playerId: string): Promise<InventorySnapshot> {
  return loadInventory(playerId);
}
