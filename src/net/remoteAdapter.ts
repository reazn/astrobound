import { Client, Room } from "colyseus.js";
import type { NetAdapter, NetAdapterOptions, FriendEntry, ChatLogEntry, NetConnectionDebug } from "./adapterTypes";
import type {
  PlayerSnapshot,
  TransformSnapshot,
  TimeSync,
  PossessionMode,
  BoardPhase,
} from "./protocol";
import type { GameEvent, EventRequest, EventResult } from "../sim/events";
import type { InventorySnapshot, WorldDropRecord } from "../sim/inventoryOps";
import { createDefaultInventory } from "../sim/inventoryOps";
import type { OreNodeState } from "../sim/mining";
import type { GroupMemberBeacon } from "../sim/events";

interface RemoteAdapterOptions extends NetAdapterOptions {
  serverUrl: string;
  joinToken: string;
  fallbackReason?: string;
}

function colyseusHttpUrl(url: string): string {
  return url.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
}

export class RemoteNetAdapter implements NetAdapter {
  readonly mode = "remote" as const;
  readonly session;
  private client: Client;
  private room: Room | null = null;
  private peers: PlayerSnapshot[] = [];
  private inventory: InventorySnapshot;
  private drops: WorldDropRecord[] = [];
  private oreCache = new Map<string, OreNodeState[]>();
  private peerCbs = new Set<(peers: PlayerSnapshot[]) => void>();
  private eventCbs = new Set<(e: GameEvent) => void>();
  private invCbs = new Set<(inv: InventorySnapshot) => void>();
  private chatLog: ChatLogEntry[] = [];
  private friends: FriendEntry[] = [];
  private groupBeacons: GroupMemberBeacon[] = [];
  private timeSyncState: TimeSync = { tick: 0, time: 0, nowMs: Date.now() };
  private joinToken: string;
  private serverUrl: string;
  private systemId: string;
  private seed: string;
  private sendAccum = 0;
  private pending: Array<{
    req: EventRequest;
    resolve: (result: EventResult) => void;
  }> = [];
  private inflight = false;
  private connected = false;
  private roomId = "";
  private roomClients = 0;
  private roomMaxClients = 32;
  private lastRejectReason = "";
  private lastWelcomeMs = 0;
  private transformsSent = 0;
  private peersRecv = 0;
  private eventsRecv = 0;
  private rttEstimateMs = 0;
  private fallbackReason = "";

  constructor(opts: RemoteAdapterOptions) {
    this.session = opts.session;
    this.joinToken = opts.joinToken;
    this.serverUrl = opts.serverUrl;
    this.systemId = opts.systemId;
    this.seed = opts.seed;
    this.fallbackReason = opts.fallbackReason ?? "";
    this.client = new Client(colyseusHttpUrl(opts.serverUrl));
    this.inventory = createDefaultInventory(opts.session.playerId);
  }

  async connect() {
    this.room = await this.client.joinOrCreate("system", {
      token: this.joinToken,
      displayName: this.session.displayName,
      characterId: this.session.characterId,
      shipId: this.session.shipId,
      guest: this.session.guest,
      systemId: this.systemId,
      seed: this.seed,
    });
    this.connected = true;
    this.roomId = this.room.roomId;
    this.bindRoomHandlers();

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 2000);
      this.room!.onMessage("welcome", (data: {
        player: {
          playerId: string;
          displayName: string;
          role: "user" | "admin";
          guest: boolean;
          characterId: string;
          shipId: string;
        };
        roomId?: string;
        systemId?: string;
        seed?: string;
        clients?: number;
        maxClients?: number;
      }) => {
        this.session.playerId = data.player.playerId;
        this.session.displayName = data.player.displayName;
        this.session.role = data.player.role;
        this.session.guest = data.player.guest;
        if (data.player.characterId) this.session.characterId = data.player.characterId;
        if (data.player.shipId) this.session.shipId = data.player.shipId;
        if (data.roomId) this.roomId = data.roomId;
        if (data.systemId) this.systemId = data.systemId;
        if (data.seed) this.seed = data.seed;
        if (typeof data.clients === "number") this.roomClients = data.clients;
        if (typeof data.maxClients === "number") this.roomMaxClients = data.maxClients;
        this.lastWelcomeMs = performance.now();
        clearTimeout(timeout);
        resolve();
      });
    });

    this.room.send("inventory.fetch");
    this.room.send("friends.fetch");
  }

  private bindRoomHandlers() {
    if (!this.room) return;

    this.room.onMessage("peers", (data: { players: PlayerSnapshot[]; clients?: number }) => {
      this.peers = data.players ?? [];
      this.peersRecv += 1;
      if (typeof data.clients === "number") this.roomClients = data.clients;
      for (const cb of this.peerCbs) cb(this.peers);
    });

    this.room.onMessage("event", (ev: GameEvent) => {
      this.eventsRecv += 1;
      if (ev.type === "chat.message") {
        this.chatLog.push({
          channel: ev.channel,
          playerId: ev.playerId,
          displayName: ev.displayName,
          text: ev.text,
          ts: ev.ts,
        });
      }
      if (ev.type === "inventory.changed" && ev.playerId === this.session.playerId) {
        this.room?.send("inventory.fetch");
      }
      for (const cb of this.eventCbs) cb(ev);
    });

    this.room.onMessage("inventory", (inv: InventorySnapshot) => {
      this.inventory = inv;
      for (const cb of this.invCbs) cb(inv);
    });

    this.room.onMessage("drops", (data: { drops: WorldDropRecord[] }) => {
      const next = data.drops ?? [];
      const prevIds = new Set(this.drops.map((d) => d.dropId));
      const nextIds = new Set(next.map((d) => d.dropId));

      for (const drop of next) {
        if (!prevIds.has(drop.dropId)) {
          const ev: GameEvent = {
            type: "drop.spawn",
            dropId: drop.dropId,
            planetId: drop.planetId,
            itemId: drop.itemId,
            qty: drop.qty,
            position: drop.position,
          };
          for (const cb of this.eventCbs) cb(ev);
        }
      }
      for (const drop of this.drops) {
        if (!nextIds.has(drop.dropId)) {
          const ev: GameEvent = { type: "drop.despawn", dropId: drop.dropId };
          for (const cb of this.eventCbs) cb(ev);
        }
      }
      this.drops = next;
    });

    this.room.onMessage("friends", (data: { friends: FriendEntry[] }) => {
      this.friends = data.friends ?? [];
    });

    this.room.onMessage("group.beacons", (data: { members: GroupMemberBeacon[] }) => {
      this.groupBeacons = data.members ?? [];
    });

    this.room.onMessage("time", (data: TimeSync) => {
      const now = Date.now();
      if (data.nowMs) {
        const skew = Math.abs(now - data.nowMs);
        this.rttEstimateMs = this.rttEstimateMs === 0 ? skew : this.rttEstimateMs * 0.8 + skew * 0.2;
      }
      this.timeSyncState = data;
    });

    this.room.onMessage("room.info", (data: { clients?: number; maxClients?: number; systemId?: string }) => {
      if (typeof data.clients === "number") this.roomClients = data.clients;
      if (typeof data.maxClients === "number") this.roomMaxClients = data.maxClients;
      if (data.systemId) this.systemId = data.systemId;
    });

    this.room.onMessage("event.result", (result: EventResult) => {
      const current = this.pending.shift();
      this.inflight = false;
      if (current) current.resolve(result);
      this.flushQueue();
    });

    this.room.onMessage("transform.rejected", (data: { reason?: string }) => {
      this.lastRejectReason = data.reason ?? "rejected";
      console.warn("[net] transform rejected", data.reason);
    });

    this.room.onLeave(() => {
      this.connected = false;
      this.room = null;
    });
  }

  async switchSystem(systemId: string, seed?: string) {
    this.systemId = systemId;
    this.seed = seed ?? systemId;
    this.disconnect();
    this.peers = [];
    this.drops = [];
    this.groupBeacons = [];
    for (const cb of this.peerCbs) cb(this.peers);
    await this.connect();
  }

  disconnect() {
    this.room?.leave();
    this.room = null;
    this.connected = false;
    while (this.pending.length) {
      this.pending.shift()!.resolve({ ok: false, error: "offline" });
    }
    this.inflight = false;
  }

  sendTransform(
    transform: TransformSnapshot,
    possession: PossessionMode,
    boardPhase: BoardPhase,
    movementFlags: number,
    ship?: PlayerSnapshot["ship"],
  ) {
    if (!this.room || !this.connected) return;
    this.sendAccum += 1;
    if (this.sendAccum % 2 !== 0 && possession === "onFoot") return;
    this.transformsSent += 1;
    this.room.send("transform", { transform, possession, boardPhase, movementFlags, ship });
  }

  async requestEvent(req: EventRequest): Promise<EventResult> {
    if (!this.room || !this.connected) return { ok: false, error: "offline" };
    return new Promise((resolve) => {
      this.pending.push({ req, resolve });
      this.flushQueue();
      setTimeout(() => {
        const idx = this.pending.findIndex((p) => p.resolve === resolve);
        if (idx >= 0) {
          this.pending.splice(idx, 1);
          resolve({ ok: false, error: "timeout" });
        }
      }, 8000);
    });
  }

  private flushQueue() {
    if (this.inflight || !this.room || this.pending.length === 0) return;
    this.inflight = true;
    this.room.send("event", this.pending[0].req);
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
    return this.oreCache.get(planetId) ?? [];
  }

  getGroupBeacons() {
    return this.groupBeacons;
  }

  getFriends() {
    return this.friends;
  }

  getChatLog(channel?: string) {
    if (!channel) return this.chatLog;
    return this.chatLog.filter((c) => c.channel === channel);
  }

  timeSync(): TimeSync {
    return this.timeSyncState;
  }

  getDebugInfo(localGameTime = 0): NetConnectionDebug {
    return {
      mode: this.mode,
      connected: this.connected,
      serverUrl: this.serverUrl,
      httpBase: colyseusHttpUrl(this.serverUrl),
      systemId: this.systemId,
      roomId: this.roomId || this.room?.roomId || "",
      roomClients: this.roomClients,
      roomMaxClients: this.roomMaxClients,
      seed: this.seed,
      sessionId: this.room?.sessionId ?? "",
      playerId: this.session.playerId,
      displayName: this.session.displayName,
      role: this.session.role,
      guest: this.session.guest,
      peerCount: this.peers.length,
      remoteVisible: this.peers.filter((p) => p.playerId !== this.session.playerId).length,
      groupBeaconCount: this.groupBeacons.length,
      dropCount: this.drops.length,
      inventoryRevision: this.inventory.revision,
      pendingEvents: this.pending.length,
      lastRejectReason: this.lastRejectReason,
      lastWelcomeMs: this.lastWelcomeMs,
      serverTick: this.timeSyncState.tick,
      serverTime: this.timeSyncState.time,
      timeDriftSec: localGameTime - this.timeSyncState.time,
      rttEstimateMs: this.rttEstimateMs,
      transformsSent: this.transformsSent,
      peersRecv: this.peersRecv,
      eventsRecv: this.eventsRecv,
      fallbackReason: this.fallbackReason,
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
    this.timeSyncState.tick += 1;
    this.timeSyncState.time += dt;
  }
}

export function createRemoteNetAdapter(opts: RemoteAdapterOptions): NetAdapter {
  return new RemoteNetAdapter(opts);
}
