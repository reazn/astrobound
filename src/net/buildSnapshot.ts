import type { Entity } from "../ecs/components";
import type { PlanetInstance } from "../worldgen/planetInstance";
import type { WorldSnapshot, Vec3, ShipSnapshot, PlayerSnapshot } from "./protocol";

const toVec3 = (v: { x: number; y: number; z: number }): Vec3 => [v.x, v.y, v.z];

export function buildWorldSnapshot(
  tick: number,
  time: number,
  seed: string,
  systemId: string,
  ship: Entity,
  player: Entity,
  planets: PlanetInstance[],
  stationPosition: { x: number; y: number; z: number },
  currentPlanetId: string,
  dockBay: number | null,
  players: PlayerSnapshot[] = [],
): WorldSnapshot {
  const s = ship.ship!;
  const shipSnap: ShipSnapshot = {
    entityId: ship.networkId ?? "ship-0",
    mode: dockBay !== null ? "docked" : s.mode,
    transform: {
      frame: s.mode === "flying" ? { kind: "system" } : { kind: "planet", planetId: currentPlanetId },
      position: toVec3(ship.position!),
      velocity: toVec3(s.velocity),
      orientation: [s.orientation.x, s.orientation.y, s.orientation.z, s.orientation.w],
      up: ship.up ? toVec3(ship.up) : undefined,
      faceDir: ship.faceDir ? toVec3(ship.faceDir) : undefined,
    },
    throttle: s.throttle,
    boostFuel: s.boostFuel,
    boosting: s.boosting,
    warpPhase: s.warpPhase,
    warpTargetId: s.warpTargetId,
    warpT: s.warpT,
    dockBay,
    phaseT: s.phaseT,
    boardPhase: "idle",
  };

  const fallbackPlayers: PlayerSnapshot[] = players.length > 0 ? players : [{
    playerId: player.playerId ?? "player-0",
    networkId: player.networkId ?? "player-0",
    displayName: player.displayName ?? "Player",
    appearance: { characterId: "barbara", shipId: "barbara" },
    possession: "onFoot",
    boardPhase: "idle",
    transform: {
      frame: { kind: "planet", planetId: currentPlanetId },
      position: toVec3(player.position!),
      velocity: toVec3(player.movement!.velocity),
      up: toVec3(player.movement!.up),
      faceDir: toVec3(player.movement!.faceDir),
    },
    movementFlags: 0,
    ship: shipSnap,
  }];

  return {
    tick,
    time,
    seed,
    systemId,
    players: fallbackPlayers,
    planets: planets.map((p) => ({
      id: p.def.id,
      systemPosition: toVec3(p.systemPosition),
    })),
    stationPosition: toVec3(stationPosition),
  };
}
