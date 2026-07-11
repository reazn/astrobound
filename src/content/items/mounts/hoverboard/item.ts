import type { ItemDef } from "../../types";

export const hoverboard: ItemDef = {
  id: "hoverboard",
  name: "Hoverboard",
  description:
    "A compact anti-grav deck. Hold H while equipped to ride — carve hills, skate water, and roll in the air with A/D.",
  rarity: "rare",
  category: "mounts",
  typeLabel: "Mount",
  equipSlot: "mount",
  stackable: false,
  maxStack: 1,
  mountKind: "hoverboard",
  gearScore: 426,
  stats: { moveSpeedMult: 1 },
  traitSlots: 3,
  gemSlots: 2,
};
