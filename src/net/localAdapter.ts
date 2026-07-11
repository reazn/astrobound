import type { NetAdapter, NetAdapterOptions, FriendEntry, ChatLogEntry } from "./adapterTypes";
import type {
  PlayerSnapshot,
  TransformSnapshot,
  TimeSync,
  PossessionMode,
  BoardPhase,
} from "./protocol";
import type { GameEvent, EventRequest, EventResult } from "../sim/events";
import {
  createDefaultInventory,
  giveItemToInventory,
  tryMoveInventory,
  trySplitInventory,
  type InventorySnapshot,
  type WorldDropRecord,
  type InvLoc,
} from "../sim/inventoryOps";
import { applyMineHit, createOreNodes, type OreNodeState } from "../sim/mining";
import { validateInteractionRange } from "../sim/validate";

const ITEM_CATALOG: Record<string, { stackable: boolean; maxStack: number; equipSlot: null | "mount" | "helmet" | "backpack" | "boots" }> = {
  silver: { stackable: true, maxStack: 99, equipSlot: null },
  skiff_plank: { stackable: false, maxStack: 1, equipSlot: "mount" },
  pulse_deck: { stackable: false, maxStack: 1, equipSlot: "mount" },
  hoverboard: { stackable: false, maxStack: 1, equipSlot: "mount" },
  void_rider: { stackable: false, maxStack: 1, equipSlot: "mount" },
  starwake: { stackable: false, maxStack: 1, equipSlot: "mount" },
};

function catalog(id: string) {
  const e = ITEM_CATALOG[id];
  if (!e) return null;
  return { id, ...e };
}

export class LocalNetAdapter implements NetAdapter {
  readonly mode = "local" as const;
  readonly session;
  private inventory: InventorySnapshot;
  private drops: WorldDropRecord[] = [];
  private oreByPlanet = new Map<string, OreNodeState[]>();
  private peers: PlayerSnapshot[] = [];
  private peerCbs = new Set<(peers: PlayerSnapshot[]) => void>();
  private eventCbs = new Set<(e: GameEvent) => void>();
  private invCbs = new Set<(inv: InventorySnapshot) => void>();
  private chatLog: ChatLogEntry[] = [];
  private friends: FriendEntry[] = [];
  private tickN = 0;
  private time = 0;
  private seed: string;
  private systemId: string;
  private lastTransform: TransformSnapshot | null = null;
  private transformsSent = 0;

  constructor(opts: NetAdapterOptions) {
    this.session = opts.session;
    this.seed = opts.seed;
    this.systemId = opts.systemId;
    this.inventory = createDefaultInventory(opts.session.playerId);
    this.friends = [
      { playerId: "demo-1", displayName: "Nova", online: true, presence: "In Cragfall", color: "#7fd6ff" },
    ];
  }

  async connect() {}

  disconnect() {}

  async switchSystem(systemId: string, seed?: string) {
    this.systemId = systemId;
    this.seed = seed ?? systemId;
  }

  sendTransform(
    transform: TransformSnapshot,
    possession: PossessionMode,
    boardPhase: BoardPhase,
    movementFlags: number,
    ship?: PlayerSnapshot["ship"],
  ) {
    this.lastTransform = transform;
    this.transformsSent += 1;
    const self: PlayerSnapshot = {
      playerId: this.session.playerId,
      networkId: this.session.playerId,
      displayName: this.session.displayName,
      appearance: { characterId: this.session.characterId, shipId: this.session.shipId },
      possession,
      boardPhase,
      transform,
      movementFlags,
      ship,
    };
    this.peers = [self];
    for (const cb of this.peerCbs) cb(this.peers);
  }

  async requestEvent(req: EventRequest): Promise<EventResult> {
    if (req.type === "drop.pickup") {
      const drop = this.drops.find((d) => d.dropId === req.dropId);
      if (!drop) return { ok: false, error: "no_drop" };
      if (!this.lastTransform) return { ok: false, error: "no_pos" };
      const range = validateInteractionRange(this.lastTransform.position, drop.position, 4);
      if (!range.ok) return { ok: false, error: range.reason };
      if (!giveItemToInventory(this.inventory, catalog, drop.itemId, drop.qty, drop.itemUuid ?? undefined)) {
        return { ok: false, error: "bag_full" };
      }
      this.drops = this.drops.filter((d) => d.dropId !== drop.dropId);
      const ev: GameEvent = { type: "drop.pickup", dropId: drop.dropId, playerId: this.session.playerId };
      this.emit(ev);
      this.emitInv();
      return { ok: true, event: ev };
    }

    if (req.type === "drop.spawn") {
      const drop: WorldDropRecord = {
        dropId: `drop-local-${Date.now()}`,
        planetId: req.planetId,
        itemId: req.itemId,
        qty: req.qty,
        position: [...req.position],
        itemUuid: null,
      };
      this.drops.push(drop);
      const ev: GameEvent = {
        type: "drop.spawn",
        dropId: drop.dropId,
        planetId: drop.planetId,
        itemId: drop.itemId,
        qty: drop.qty,
        position: drop.position,
      };
      this.emit(ev);
      return { ok: true, event: ev };
    }

    if (req.type === "mine.hit") {
      const planetId = this.lastTransform?.frame.kind === "planet" ? this.lastTransform.frame.planetId : null;
      if (!planetId || !this.lastTransform) return { ok: false, error: "no_planet" };
      const nodes = this.getOreNodes(planetId);
      let node = nodes.find((n) => n.nodeId === req.nodeId);
      if (!node) {
        node = {
          nodeId: req.nodeId,
          planetId,
          kind: "iron",
          hp: 5,
          maxHp: 5,
          position: [...req.position],
          depleted: false,
        };
        nodes.push(node);
      } else {
        node.position = [...req.position];
      }
      const range = validateInteractionRange(this.lastTransform.position, node.position, 6);
      if (!range.ok) return { ok: false, error: range.reason };
      const result = applyMineHit(node, this.session.playerId, this.seed, node.maxHp - node.hp);
      if (result.drop) {
        giveItemToInventory(this.inventory, catalog, result.drop.itemId, result.drop.qty, result.drop.itemUuid ?? undefined);
        this.emitInv();
      }
      const events = result.events.filter((e) => e.type !== "drop.spawn");
      for (const ev of events) this.emit(ev);
      return { ok: true, event: events[events.length - 1], events };
    }

    if (req.type === "inventory.move") {
      const ok = tryMoveInventory(this.inventory, catalog, wireToInvLoc(req.from), wireToInvLoc(req.to));
      if (!ok) return { ok: false, error: "move_failed" };
      this.emitInv();
      return { ok: true, event: { type: "inventory.changed", playerId: this.session.playerId, revision: this.inventory.revision } };
    }

    if (req.type === "inventory.equip") {
      const from = wireToInvLoc(req.from);
      const stack = this.inventory.bag[from.kind === "bag" ? from.index : -1];
      if (!stack) return { ok: false, error: "empty" };
      const def = catalog(stack.itemId);
      if (!def?.equipSlot) return { ok: false, error: "not_equip" };
      const ok = tryMoveInventory(this.inventory, catalog, from, { kind: "equip", slot: def.equipSlot });
      if (!ok) return { ok: false, error: "equip_failed" };
      this.emitInv();
      return { ok: true, event: { type: "inventory.changed", playerId: this.session.playerId, revision: this.inventory.revision } };
    }

    if (req.type === "inventory.unequip") {
      const empty = this.inventory.bag.findIndex((s) => !s);
      if (empty < 0) return { ok: false, error: "bag_full" };
      const ok = tryMoveInventory(
        this.inventory,
        catalog,
        { kind: "equip", slot: req.slot },
        { kind: "bag", index: empty },
      );
      if (!ok) return { ok: false, error: "unequip_failed" };
      this.emitInv();
      return { ok: true, event: { type: "inventory.changed", playerId: this.session.playerId, revision: this.inventory.revision } };
    }

    if (req.type === "inventory.split") {
      const ok = trySplitInventory(this.inventory, catalog, wireToInvLoc(req.from), req.amount);
      if (!ok) return { ok: false, error: "split_failed" };
      this.emitInv();
      return { ok: true, event: { type: "inventory.changed", playerId: this.session.playerId, revision: this.inventory.revision } };
    }

    if (req.type === "group.invite") {
      return { ok: true, event: { type: "group.invite", groupId: "local", fromPlayerId: this.session.playerId, toPlayerId: req.targetPlayerId } };
    }

    if (req.type === "group.leave") {
      return { ok: true, event: { type: "group.leave", groupId: "local", playerId: this.session.playerId } };
    }

    if (req.type === "chat.send") {
      const ev: GameEvent = {
        type: "chat.message",
        channel: req.channel,
        playerId: this.session.playerId,
        displayName: this.session.displayName,
        text: req.text.slice(0, 280),
        ts: Date.now(),
      };
      this.chatLog.push({ channel: req.channel, playerId: ev.playerId, displayName: ev.displayName, text: ev.text, ts: ev.ts });
      this.emit(ev);
      return { ok: true, event: ev };
    }

    if (req.type === "friend.add") {
      this.friends.push({
        playerId: `friend-${Date.now()}`,
        displayName: req.displayName,
        online: false,
        presence: "Pending",
        color: "#b56bff",
      });
      return { ok: true };
    }

    return { ok: false, error: "unsupported" };
  }

  getPeers() {
    return this.peers;
  }

  getInventory() {
    return this.inventory;
  }

  getDrops() {
    return this.drops;
  }

  getOreNodes(planetId: string) {
    if (!this.oreByPlanet.has(planetId)) {
      this.oreByPlanet.set(planetId, createOreNodes(planetId, 24, this.seed));
    }
    return this.oreByPlanet.get(planetId)!;
  }

  getGroupBeacons() {
    return [];
  }

  getFriends() {
    return this.friends;
  }

  getChatLog(channel?: string) {
    if (!channel) return this.chatLog;
    return this.chatLog.filter((c) => c.channel === channel);
  }

  timeSync(): TimeSync {
    return { tick: this.tickN, time: this.time, nowMs: Date.now() };
  }

  getDebugInfo(localGameTime = 0) {
    return {
      mode: this.mode,
      connected: true,
      serverUrl: "local://loopback",
      httpBase: "local://loopback",
      systemId: this.systemId,
      roomId: "local",
      roomClients: 1,
      roomMaxClients: 1,
      seed: this.seed,
      sessionId: this.session.playerId,
      playerId: this.session.playerId,
      displayName: this.session.displayName,
      role: this.session.role,
      guest: this.session.guest,
      peerCount: this.peers.length,
      remoteVisible: Math.max(0, this.peers.length - 1),
      groupBeaconCount: 0,
      dropCount: this.drops.length,
      inventoryRevision: this.inventory.revision,
      pendingEvents: 0,
      lastRejectReason: "",
      lastWelcomeMs: 0,
      serverTick: this.tickN,
      serverTime: this.time,
      timeDriftSec: localGameTime - this.time,
      rttEstimateMs: 0,
      transformsSent: this.transformsSent,
      peersRecv: 0,
      eventsRecv: 0,
      fallbackReason: "",
    };
  }

  onPeers(cb: (peers: PlayerSnapshot[]) => void) {
    this.peerCbs.add(cb);
    cb(this.peers);
    return () => this.peerCbs.delete(cb);
  }

  onEvent(cb: (e: GameEvent) => void) {
    this.eventCbs.add(cb);
    return () => this.eventCbs.delete(cb);
  }

  onInventory(cb: (inv: InventorySnapshot) => void) {
    this.invCbs.add(cb);
    cb(this.inventory);
    return () => this.invCbs.delete(cb);
  }

  tick(dt: number) {
    this.tickN += 1;
    this.time += dt;
  }

  private emit(ev: GameEvent) {
    for (const cb of this.eventCbs) cb(ev);
  }

  private emitInv() {
    for (const cb of this.invCbs) cb(this.inventory);
  }
}

function wireToInvLoc(loc: { kind: string; index?: number; slot?: string }): InvLoc {
  if (loc.kind === "equip") return { kind: "equip", slot: loc.slot as "mount" };
  return { kind: "bag", index: loc.index ?? 0 };
}

export function createLocalNetAdapter(opts: NetAdapterOptions): NetAdapter {
  return new LocalNetAdapter(opts);
}
