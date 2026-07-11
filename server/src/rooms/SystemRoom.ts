import { Room, Client } from "colyseus";
import { Schema, type, MapSchema } from "@colyseus/schema";
import type { PlayerSnapshot, TransformSnapshot, TimeSync } from "../shared/protocol.js";
import type { GameEvent, EventRequest } from "../shared/events.js";
import { verifyJoinToken, signGuestToken, type JoinTokenPayload } from "../auth/jwt.js";
import {
  createEconomyState,
  handleEventRequest,
  validatePlayerTransform,
  type EconomyState,
} from "../services/economyService.js";
import { ensurePlayerInventory, getCachedInventory } from "../services/inventoryService.js";
import {
  getFriends,
  addFriend,
  inviteToGroup,
  leaveGroup,
  getGroupMemberIds,
  buildGroupBeacons,
  setPresence,
  type GroupState,
} from "../services/socialService.js";
import { classifyPeer, DEFAULT_INTEREST } from "../shared/interest.js";
import type { GroupMemberBeacon } from "../shared/events.js";
import { vec3Dist, framesEqual } from "../shared/protocol.js";

interface ClientMeta {
  payload: JoinTokenPayload;
  snapshot: PlayerSnapshot | null;
  prevTransform: TransformSnapshot | null;
}

class PlayerState extends Schema {
  @type("string") playerId = "";
  @type("string") displayName = "";
}

class SystemState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type("number") tick = 0;
  @type("number") time = 0;
  @type("string") seed = "solar-001";
  @type("string") systemId = "solar-001";
}

export class SystemRoom extends Room<SystemState> {
  maxClients = Number(process.env.MAX_CLIENTS_PER_ROOM ?? 32);
  private economy!: EconomyState;
  private metaBySession = new Map<string, ClientMeta>();
  private simTime = 0;
  private tick = 0;
  private systemId = "solar-001";

  onCreate(options: { seed?: string; systemId?: string }) {
    this.setState(new SystemState());
    this.systemId = String(options?.systemId ?? options?.seed ?? "solar-001").slice(0, 64);
    this.state.systemId = this.systemId;
    this.state.seed = String(options?.seed ?? this.systemId).slice(0, 64);
    this.economy = createEconomyState(this.state.seed);
    this.setMetadata({
      systemId: this.systemId,
      seed: this.state.seed,
      maxClients: this.maxClients,
    });
    this.autoDispose = true;

    this.onMessage("transform", (client, data: {
      transform: TransformSnapshot;
      possession: PlayerSnapshot["possession"];
      boardPhase: PlayerSnapshot["boardPhase"];
      movementFlags: number;
      ship?: PlayerSnapshot["ship"];
    }) => {
      const meta = this.metaBySession.get(client.sessionId);
      if (!meta) return;

      const result = validatePlayerTransform(
        meta.payload.role,
        data.transform,
        meta.prevTransform,
        data.possession,
        data.movementFlags,
        data.transform.frame,
        1 / 20,
      );
      if (!result.ok) {
        client.send("transform.rejected", { reason: result.reason });
        return;
      }

      meta.prevTransform = data.transform;
      meta.snapshot = {
        playerId: meta.payload.playerId,
        networkId: client.sessionId,
        displayName: meta.payload.displayName,
        appearance: {
          characterId: meta.payload.characterId,
          shipId: meta.payload.shipId,
        },
        possession: data.possession,
        boardPhase: data.boardPhase,
        movementFlags: data.movementFlags,
        transform: data.transform,
        ship: data.ship,
      };
    });

    this.onMessage("event", async (client, req: EventRequest) => {
      const meta = this.metaBySession.get(client.sessionId);
      if (!meta) return;
      const result = await handleEventRequest(
        this.economy,
        meta.payload.playerId,
        meta.payload.role,
        meta.snapshot?.transform ?? null,
        req,
      );
      client.send("event.result", result);
      if (result.ok) {
        const events = result.events ?? (result.event ? [result.event] : []);
        for (const ev of events) this.broadcastEvent(ev, client);
        if (events.some((e) => e.type === "inventory.changed" && e.playerId === meta.payload.playerId)) {
          const inv = getCachedInventory(meta.payload.playerId);
          if (inv) client.send("inventory", inv);
        }
        if (events.some((e) => e.type.startsWith("drop."))) this.broadcastDrops();
      }
      if (req.type === "friend.add") {
        addFriend(meta.payload.playerId, req.displayName);
        client.send("friends", { friends: getFriends(meta.payload.playerId) });
      }
      if (req.type === "group.invite") {
        inviteToGroup(meta.payload.playerId, req.targetPlayerId);
      }
      if (req.type === "group.leave") leaveGroup(meta.payload.playerId);
      if (req.type === "chat.send") {
        const ev: GameEvent = {
          type: "chat.message",
          channel: req.channel,
          playerId: meta.payload.playerId,
          displayName: meta.payload.displayName,
          text: req.text.slice(0, 280),
          ts: Date.now(),
        };
        this.routeChat(ev, client);
      }
    });

    this.onMessage("inventory.fetch", async (client) => {
      const meta = this.metaBySession.get(client.sessionId);
      if (!meta) return;
      const inv = await ensurePlayerInventory(meta.payload.playerId);
      client.send("inventory", inv);
    });

    this.onMessage("friends.fetch", (client) => {
      const meta = this.metaBySession.get(client.sessionId);
      if (!meta) return;
      client.send("friends", { friends: getFriends(meta.payload.playerId) });
    });

    this.setSimulationInterval(() => this.simStep(), 1000 / 20);
  }

  async onJoin(client: Client, options: { token?: string; displayName?: string }) {
    let payload = options.token ? verifyJoinToken(options.token) : null;
    if (!payload) {
      payload = verifyJoinToken(signGuestToken(options.displayName ?? "Guest"))!;
    }

    const ps = new PlayerState();
    ps.playerId = payload.playerId;
    ps.displayName = payload.displayName;
    this.state.players.set(client.sessionId, ps);

    this.metaBySession.set(client.sessionId, {
      payload,
      snapshot: null,
      prevTransform: null,
    });

    setPresence(payload.playerId, `in_system:${this.systemId}:${this.roomId}`);
    await ensurePlayerInventory(payload.playerId);

    client.send("welcome", {
      player: payload,
      roomId: this.roomId,
      systemId: this.systemId,
      seed: this.state.seed,
      clients: this.clients.length,
      maxClients: this.maxClients,
    });
    client.send("inventory", getCachedInventory(payload.playerId));
    client.send("friends", { friends: getFriends(payload.playerId) });
    client.send("drops", { drops: this.economy.drops });
    client.send("time", this.timeSync());
    this.broadcast("room.info", {
      clients: this.clients.length,
      maxClients: this.maxClients,
      systemId: this.systemId,
    });
  }

  onLeave(client: Client) {
    this.metaBySession.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.broadcast("room.info", {
      clients: Math.max(0, this.clients.length - 1),
      maxClients: this.maxClients,
      systemId: this.systemId,
    });
  }

  private simStep() {
    this.tick += 1;
    this.simTime += 1 / 20;
    this.state.tick = this.tick;
    this.state.time = this.simTime;
    this.broadcast("time", this.timeSync());
    this.broadcastAllPeers();
    this.broadcastGroupBeacons();
  }

  private timeSync(): TimeSync {
    return { tick: this.tick, time: this.simTime, nowMs: Date.now() };
  }

  private collectSnapshots(): PlayerSnapshot[] {
    const out: PlayerSnapshot[] = [];
    for (const meta of this.metaBySession.values()) {
      if (meta.snapshot) out.push(meta.snapshot);
    }
    return out;
  }

  private broadcastAllPeers() {
    const all = this.collectSnapshots();
    for (const client of this.clients) {
      const meta = this.metaBySession.get(client.sessionId);
      if (!meta) continue;
      const peers = this.filterPeersFor(meta, all);
      client.send("peers", { players: peers, clients: this.clients.length });
    }
  }

  private filterPeersFor(viewer: ClientMeta, all: PlayerSnapshot[]): PlayerSnapshot[] {
    if (!viewer.snapshot) {
      return all.filter((p) => p.playerId !== viewer.payload.playerId);
    }

    const groupIds = new Set(getGroupMemberIds(viewer.payload.playerId));
    const ctx = {
      selfId: viewer.payload.playerId,
      selfPos: viewer.snapshot.transform.position,
      selfFrame: viewer.snapshot.transform.frame,
      possession: viewer.snapshot.possession,
      groupMemberIds: groupIds,
    };

    return all.filter((p) => {
      if (p.playerId === viewer.payload.playerId) return false;
      if (groupIds.has(p.playerId)) return true;
      const tier = classifyPeer(ctx, p, DEFAULT_INTEREST);
      return tier !== "blip";
    });
  }

  private broadcastEvent(ev: GameEvent, source: Client) {
    if (ev.type === "chat.message") {
      this.routeChat(ev, source);
      return;
    }
    const meta = this.metaBySession.get(source.sessionId);
    if (!meta?.snapshot) {
      this.broadcast("event", ev);
      return;
    }
    for (const client of this.clients) {
      const other = this.metaBySession.get(client.sessionId);
      if (!other?.snapshot) continue;
      const sameFrame = framesEqual(meta.snapshot.transform.frame, other.snapshot.transform.frame);
      const dist = vec3Dist(meta.snapshot.transform.position, other.snapshot.transform.position);
      if (sameFrame && dist < 120) client.send("event", ev);
    }
  }

  private routeChat(ev: GameEvent & { type: "chat.message" }, source: Client) {
    if (ev.channel === "global" || ev.channel === "system") {
      this.broadcast("event", ev);
      return;
    }
    if (ev.channel === "group") {
      const members = getGroupMemberIds(ev.playerId);
      for (const client of this.clients) {
        const meta = this.metaBySession.get(client.sessionId);
        if (meta && members.includes(meta.payload.playerId)) client.send("event", ev);
      }
      return;
    }
    if (ev.channel === "nearby") {
      const meta = this.metaBySession.get(source.sessionId);
      if (!meta?.snapshot) return;
      for (const client of this.clients) {
        const other = this.metaBySession.get(client.sessionId);
        if (!other?.snapshot) continue;
        const sameFrame = framesEqual(meta.snapshot!.transform.frame, other.snapshot.transform.frame);
        const dist = vec3Dist(meta.snapshot!.transform.position, other.snapshot.transform.position);
        if (sameFrame && dist < 50) client.send("event", ev);
      }
    }
  }

  private broadcastDrops() {
    this.broadcast("drops", { drops: this.economy.drops });
  }

  private broadcastGroupBeacons() {
    const beaconMap = new Map<string, GroupMemberBeacon>();
    for (const meta of this.metaBySession.values()) {
      if (!meta.snapshot) continue;
      beaconMap.set(meta.payload.playerId, {
        playerId: meta.payload.playerId,
        displayName: meta.payload.displayName,
        systemId: this.systemId,
        frame: meta.snapshot.transform.frame,
        position: meta.snapshot.transform.position,
        possession: meta.snapshot.possession,
      });
    }

    for (const client of this.clients) {
      const meta = this.metaBySession.get(client.sessionId);
      if (!meta) continue;
      const groupIds = getGroupMemberIds(meta.payload.playerId);
      if (groupIds.length === 0) continue;
      const group: GroupState = { groupId: "active", leaderId: groupIds[0], memberIds: groupIds };
      const beacons = buildGroupBeacons(group, beaconMap);
      client.send("group.beacons", { members: beacons });
    }
  }
}
