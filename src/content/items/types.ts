export type ItemRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type ItemCategory = "mounts" | "ore" | "tools" | "armor" | "gear" | "misc";

export type EquipSlot = "mount" | "helmet" | "backpack" | "boots";

export interface ItemStats {
  moveSpeedMult?: number;
  jumpHeightMult?: number;
  extraJumps?: number;
}

export const DEFAULT_MAX_STACK = 99;

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  rarity: ItemRarity;
  category: ItemCategory;
  typeLabel: string;
  equipSlot: EquipSlot | null;
  stackable: boolean;
  maxStack: number;
  stats?: ItemStats;
  mountKind?: "hoverboard";
  gearScore?: number;
  traitSlots?: number;
  gemSlots?: number;
}

export const RARITY_LABEL: Record<ItemRarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

export const CATEGORY_ORDER: ItemCategory[] = [
  "mounts", "ore", "tools", "armor", "gear", "misc",
];

export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  mounts: "Mounts",
  ore: "Ore",
  tools: "Tools",
  armor: "Armor",
  gear: "Gear",
  misc: "Misc",
};

export const EQUIP_SLOT_LABEL: Record<EquipSlot, string> = {
  mount: "Mount",
  helmet: "Helmet",
  backpack: "Backpack",
  boots: "Boots",
};

export const EQUIP_SLOTS: EquipSlot[] = [
  "mount", "helmet", "backpack", "boots",
];

export function itemMaxStack(item: ItemDef): number {
  if (!item.stackable) return 1;
  return item.maxStack > 0 ? item.maxStack : DEFAULT_MAX_STACK;
}

export function itemHasGearDetails(item: ItemDef): boolean {
  return item.equipSlot != null || item.gearScore != null
    || (item.traitSlots ?? 0) > 0 || (item.gemSlots ?? 0) > 0;
}
