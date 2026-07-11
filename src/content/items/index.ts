import type { ItemDef } from "./types";
import {
  MOUNT_ITEMS, MOUNT_MODELS,
  createHoverboard, hoverboard, skiffPlank, pulseDeck, voidRider, starwake,
} from "./mounts";
import {
  ORE_ITEMS, ORE_MODELS,
  createSilverModel, silver,
} from "./ores";
import type { ItemModelBuilder, ItemModelHandle } from "./mounts";

const ALL: ItemDef[] = [
  ...MOUNT_ITEMS,
  ...ORE_ITEMS,
];

const BY_ID = new Map(ALL.map((item) => [item.id, item]));

export type { ItemModelBuilder, ItemModelHandle };

export const ITEM_MODELS: Record<string, ItemModelBuilder> = {
  ...MOUNT_MODELS,
  ...ORE_MODELS,
};

export function getItem(id: string): ItemDef | undefined {
  return BY_ID.get(id);
}

export function allItems(): readonly ItemDef[] {
  return ALL;
}

export function itemsByCategory(category: ItemDef["category"]): ItemDef[] {
  return ALL.filter((item) => item.category === category);
}

export function getItemModelBuilder(id: string): ItemModelBuilder | undefined {
  return ITEM_MODELS[id];
}

export * from "./types";
export {
  createHoverboard, hoverboard, skiffPlank, pulseDeck, voidRider, starwake,
  MOUNT_ITEMS,
};
export {
  createSilverModel, silver,
  ORE_ITEMS,
};
