import type { NetAdapter } from "./adapterTypes";
import type { Entity } from "../ecs/components";
import type { PossessionState } from "../systems/possession";
import type { PlanetInstance } from "../worldgen/planetInstance";
import { Vector3 } from "three";
import {
  buildLocalPlayerSnapshot,
  buildCoordFrame,
} from "./buildPlayerSnapshot";
import type { InterestContext } from "./interest";
import { createRemotePlayersSystem, type RemotePlayersSystem } from "../systems/remotePlayers";

export interface NetBridge {
  adapter: NetAdapter;
  remotes: RemotePlayersSystem;
  tick(dt: number): void;
  syncTransform(player: Entity, ship: Entity, state: PossessionState, boardPhase: "idle" | "boarding" | "exiting"): void;
  syncRemotes(state: PossessionState, player: Entity, planets: PlanetInstance[], ship: Entity): void;
  updateRemotes(
    dt: number,
    planets: PlanetInstance[],
    stationSystemPos: Vector3,
    renderOrigin: Vector3,
  ): void;
  dispose(): void;
}

export function createNetBridge(
  adapter: NetAdapter,
  world: import("../ecs/world").GameWorld,
  scene: import("three").Object3D,
): NetBridge {
  const remotes = createRemotePlayersSystem(world, scene);

  const tick = (dt: number) => {
    adapter.tick(dt);
  };

  const syncTransform = (
    player: Entity,
    ship: Entity,
    state: PossessionState,
    boardPhase: "idle" | "boarding" | "exiting",
  ) => {
    const snap = buildLocalPlayerSnapshot(
      player,
      ship,
      state,
      adapter.session,
      boardPhase,
    );
    adapter.sendTransform(
      snap.transform,
      snap.possession,
      snap.boardPhase,
      snap.movementFlags,
      snap.ship,
    );
  };

  const syncRemotes = (state: PossessionState, player: Entity, planets: PlanetInstance[], ship: Entity) => {
    const shipMode = ship.ship?.mode ?? "landed";
    const frame = buildCoordFrame(state, shipMode, state.dockBay);
    const transformEntity = state.mode === "ship" ? ship : player;
    const pos = transformEntity.position!;
    const ctx: InterestContext = {
      selfId: adapter.session.playerId,
      selfPos: [pos.x, pos.y, pos.z],
      selfFrame: frame,
      possession: state.mode,
      groupMemberIds: new Set(adapter.getGroupBeacons().map((b) => b.playerId)),
    };
    remotes.sync(adapter.getPeers(), ctx, planets);
  };

  const updateRemotes = (
    dt: number,
    planets: PlanetInstance[],
    stationSystemPos: Vector3,
    renderOrigin: Vector3,
  ) => {
    remotes.update(dt, planets, stationSystemPos, renderOrigin);
  };

  return {
    adapter,
    remotes,
    tick,
    syncTransform,
    syncRemotes,
    updateRemotes,
    dispose: () => remotes.dispose(),
  };
}
