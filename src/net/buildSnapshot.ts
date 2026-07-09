import type { Entity } from "../ecs/components";
import type { PlanetInstance } from "../worldgen/planetInstance";
import type { WorldSnapshot, Vec3, ShipSnapshot } from "./snapshot";

const toVec3 = (v: { x: number; y: number; z: number }): Vec3 => [v.x, v.y, v.z];

export function buildWorldSnapshot(
  tick: number,
  time: number,
  seed: string,
  ship: Entity,
  player: Entity,
  planets: PlanetInstance[],
  stationPosition: { x: number; y: number; z: number },
  currentPlanetId: string,
  dockBay: number | null,
): WorldSnapshot {
  const s = ship.ship!;
  const shipSnap: ShipSnapshot = {
    entityId: "ship-0",
    mode: dockBay !== null ? "docked" : s.mode,
    position: toVec3(ship.position!),
    velocity: toVec3(s.velocity),
    orientation: [s.orientation.x, s.orientation.y, s.orientation.z, s.orientation.w],
    throttle: s.throttle,
    boostFuel: s.boostFuel,
    boosting: s.boosting,
    warpPhase: s.warpPhase,
    warpTargetId: s.warpTargetId,
    warpT: s.warpT,
    dockBay,
    planetId: s.mode === "landed" && dockBay === null ? currentPlanetId : null,
  };

  return {
    tick,
    time,
    seed,
    ships: [shipSnap],
    players: [{
      entityId: "player-0",
      position: toVec3(player.position!),
      planetId: currentPlanetId,
      velocity: toVec3(player.movement!.velocity),
    }],
    planets: planets.map((p) => ({
      id: p.def.id,
      systemPosition: toVec3(p.systemPosition),
    })),
    stationPosition: toVec3(stationPosition),
  };
}
