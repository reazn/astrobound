import type { Group } from "three";
import type { ItemDef } from "../types";
import { silver, createSilverModel } from "./silver";

export type ItemModelHandle = {
  root: Group;
  dispose: () => void;
};

export type ItemModelBuilder = () => ItemModelHandle;

export const ORE_ITEMS: ItemDef[] = [silver];

export const ORE_MODELS: Record<string, ItemModelBuilder> = {
  silver: () => {
    const model = createSilverModel();
    return { root: model.group, dispose: () => model.dispose() };
  },
};

export { silver, createSilverModel };
export type { SilverModel } from "./silver";
