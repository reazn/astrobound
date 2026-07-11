import type { Group } from "three";
import type { ItemDef } from "../types";
import { skiffPlank } from "./skiff_plank";
import { pulseDeck } from "./pulse_deck";
import { hoverboard, createHoverboard } from "./hoverboard";
import { voidRider } from "./void_rider";
import { starwake } from "./starwake";

export type ItemModelHandle = {
  root: Group;
  dispose: () => void;
};

export type ItemModelBuilder = () => ItemModelHandle;

export const MOUNT_ITEMS: ItemDef[] = [
  skiffPlank,
  pulseDeck,
  hoverboard,
  voidRider,
  starwake,
];

const makeHoverboardPreview: ItemModelBuilder = () => {
  const board = createHoverboard();
  board.setActive(true);
  board.group.visible = true;
  board.group.scale.setScalar(1);
  board.trail.visible = false;
  board.update(0.016, 0.35, true, board.group.position, board.group.position);
  board.group.rotation.x = 0.35;
  return { root: board.group, dispose: () => board.dispose() };
};

export const MOUNT_MODELS: Record<string, ItemModelBuilder> = {};
for (const item of MOUNT_ITEMS) {
  if (item.mountKind === "hoverboard") {
    MOUNT_MODELS[item.id] = makeHoverboardPreview;
  }
}

export {
  skiffPlank,
  pulseDeck,
  hoverboard,
  voidRider,
  starwake,
  createHoverboard,
};
export type { Hoverboard } from "./hoverboard";
