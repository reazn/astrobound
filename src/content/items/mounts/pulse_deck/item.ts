import type { ItemDef } from "../../types";

export const pulseDeck: ItemDef = {
  id: "pulse_deck",
  name: "Pulse Deck",
  description: "Workshop anti-grav with a tuned pulse coil. Holds a clean line on moderate grades.",
  rarity: "uncommon",
  category: "mounts",
  typeLabel: "Mount",
  equipSlot: "mount",
  stackable: false,
  maxStack: 1,
  mountKind: "hoverboard",
  gearScore: 218,
  stats: { moveSpeedMult: 0.96 },
  traitSlots: 2,
  gemSlots: 1,
};
