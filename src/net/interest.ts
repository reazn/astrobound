import type { PlayerSnapshot, Vec3, CoordFrame } from "./protocol";
import { vec3Dist, framesEqual } from "./protocol";
import type { GroupMemberBeacon } from "../sim/events";

export type InterestTier = "group" | "near" | "far" | "blip";

export interface InterestConfig {
  onFootNear: number;
  flightNear: number;
  farRate: number;
  nearRate: number;
  groupRate: number;
}

export const DEFAULT_INTEREST: InterestConfig = {
  onFootNear: 50,
  flightNear: 8000,
  farRate: 5,
  nearRate: 20,
  groupRate: 3,
};

export interface InterestContext {
  selfId: string;
  selfPos: Vec3;
  selfFrame: CoordFrame;
  possession: "onFoot" | "ship";
  groupMemberIds: Set<string>;
}

export function classifyPeer(ctx: InterestContext, peer: PlayerSnapshot, cfg = DEFAULT_INTEREST): InterestTier {
  if (ctx.groupMemberIds.has(peer.playerId)) return "group";
  if (!framesEqual(ctx.selfFrame, peer.transform.frame)) {
    if (peer.transform.frame.kind === "system" || ctx.selfFrame.kind === "system") {
      const dist = vec3Dist(ctx.selfPos, peer.transform.position);
      const near = ctx.possession === "ship" ? cfg.flightNear : cfg.onFootNear;
      return dist <= near ? "near" : "far";
    }
    return "blip";
  }
  const dist = vec3Dist(ctx.selfPos, peer.transform.position);
  const near = ctx.possession === "ship" ? cfg.flightNear : cfg.onFootNear;
  if (dist <= near) return "near";
  return "far";
}

export function filterPeersByInterest(
  ctx: InterestContext,
  peers: PlayerSnapshot[],
  cfg = DEFAULT_INTEREST,
): PlayerSnapshot[] {
  return peers.filter((p) => {
    if (p.playerId === ctx.selfId) return false;
    const tier = classifyPeer(ctx, p, cfg);
    return tier !== "blip";
  });
}

export function snapshotRateHz(tier: InterestTier, cfg = DEFAULT_INTEREST): number {
  if (tier === "group") return cfg.groupRate;
  if (tier === "near") return cfg.nearRate;
  if (tier === "far") return cfg.farRate;
  return 0;
}

export function shouldUseImpostor(tier: InterestTier): boolean {
  return tier === "far" || tier === "blip";
}

export function beaconsToCompass(
  selfPos: Vec3,
  beacons: GroupMemberBeacon[],
): { playerId: string; bearingDeg: number; label: string }[] {
  return beacons.map((b) => {
    const dx = b.position[0] - selfPos[0];
    const dz = b.position[2] - selfPos[2];
    const bearing = (Math.atan2(dx, dz) * 180) / Math.PI;
    return {
      playerId: b.playerId,
      bearingDeg: bearing,
      label: b.displayName,
    };
  });
}
