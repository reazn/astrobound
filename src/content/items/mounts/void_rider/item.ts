import type { ItemDef } from "../../types";

export const voidRider: ItemDef = {
  id: "void_rider",
  name: "Void Rider",
  description: "Void-etched deck with a hungry coil. Clings to steep rock and punches harder out of air tricks.",
  rarity: "epic",
  category: "mounts",
  typeLabel: "Mount",
  equipSlot: "mount",
  stackable: false,
  maxStack: 1,
  mountKind: "hoverboard",
  gearScore: 682,
  stats: { moveSpeedMult: 1.08 },
  traitSlots: 3,
  gemSlots: 2,
};
