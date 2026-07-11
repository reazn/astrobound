import type { ItemDef } from "../../types";

export const starwake: ItemDef = {
  id: "starwake",
  name: "Starwake",
  description: "A legendary deck forged in starlight. Near-silent coil, razor response, and room for two live gems.",
  rarity: "legendary",
  category: "mounts",
  typeLabel: "Mount",
  equipSlot: "mount",
  stackable: false,
  maxStack: 1,
  mountKind: "hoverboard",
  gearScore: 914,
  stats: { moveSpeedMult: 1.14 },
  traitSlots: 3,
  gemSlots: 2,
};
