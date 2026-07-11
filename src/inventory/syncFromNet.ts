import type { InventorySnapshot } from "../sim/inventoryOps";
import type { PlayerInventory } from "./playerInventory";

export function syncInventoryFromNet(inv: PlayerInventory, snap: InventorySnapshot) {
  const bagLen = Math.min(inv.bag.length, snap.bag.length);
  for (let i = 0; i < inv.bag.length; i++) {
    if (i >= bagLen) {
      inv.bag[i] = null;
      continue;
    }
    const slot = snap.bag[i];
    inv.bag[i] = slot
      ? { itemId: slot.itemId, qty: slot.qty, uuid: slot.uuid }
      : null;
  }
  for (const key of Object.keys(inv.equipment) as (keyof typeof inv.equipment)[]) {
    const eq = snap.equipment[key];
    inv.equipment[key] = eq
      ? { itemId: eq.itemId, qty: eq.qty, uuid: eq.uuid }
      : null;
  }
}
