import type { ItemDef } from "../../types";

export const skiffPlank: ItemDef = {
  id: "skiff_plank",
  name: "Skiff Plank",
  description: "A scrap-yard deck with a weak anti-grav coil. Barely clears the dirt — good for learning the carve.",
  rarity: "common",
  category: "mounts",
  typeLabel: "Mount",
  equipSlot: "mount",
  stackable: false,
  maxStack: 1,
  mountKind: "hoverboard",
  gearScore: 92,
  stats: { moveSpeedMult: 0.9 },
  traitSlots: 1,
  gemSlots: 0,
};
