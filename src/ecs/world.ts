import { World } from "miniplex";
import type { Entity } from "./components";

// The miniplex ECS world. Systems query this for the entities they care about.
export type GameWorld = World<Entity>;

export function createWorld(): GameWorld {
  return new World<Entity>();
}
