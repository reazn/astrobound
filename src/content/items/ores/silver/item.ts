import type { ItemDef } from "../../types";
import { DEFAULT_MAX_STACK } from "../../types";

export const silver: ItemDef = {
  id: "silver",
  name: "Silver",
  description: "Refined silver ingots. Stackable trade currency for testing inventory stacks and splits.",
  rarity: "uncommon",
  category: "ore",
  typeLabel: "Ore",
  equipSlot: null,
  stackable: true,
  maxStack: DEFAULT_MAX_STACK,
};
