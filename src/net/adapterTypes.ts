import type {
  PlayerSnapshot,
  TransformSnapshot,
  TimeSync,
  PossessionMode,
  BoardPhase,
} from "./protocol";
import type { GameEvent, EventRequest, EventResult, PlayerRole } from "../sim/events";
import type { InventorySnapshot, WorldDropRecord } from "../sim/inventoryOps";
import type { OreNodeState } from "../sim/mining";

export type NetMode = "local" | "remote";

export interface NetSession {
  playerId: string;
  displayName: string;
  role: PlayerRole;
  guest: boolean;
  characterId: string;
  shipId: string;
}

export interface NetAdapterOptions {
  session: NetSession;
  seed: string;
  systemId: string;
}

export interface NetConnectionDebug {
  mode: NetMode;
  connected: boolean;
  serverUrl: string;
  httpBase: string;
  systemId: string;
  roomId: string;
  roomClients: number;
  roomMaxClients: number;
  seed: string;
  sessionId: string;
  playerId: string;
  displayName: string;
  role: PlayerRole;
  guest: boolean;
  peerCount: number;
  remoteVisible: number;
  groupBeaconCount: number;
  dropCount: number;
  inventoryRevision: number;
  pendingEvents: number;
  lastRejectReason: string;
  lastWelcomeMs: number;
  serverTick: number;
  serverTime: number;
  timeDriftSec: number;
  rttEstimateMs: number;
  transformsSent: number;
  peersRecv: number;
  eventsRecv: number;
  fallbackReason: string;
}

export interface NetAdapter {
  readonly mode: NetMode;
  readonly session: NetSession;
  connect(): Promise<void>;
  disconnect(): void;
  switchSystem?(systemId: string, seed?: string): Promise<void>;
  sendTransform(
    transform: TransformSnapshot,
    possession: PossessionMode,
    boardPhase: BoardPhase,
    movementFlags: number,
    ship?: PlayerSnapshot["ship"],
  ): void;
  requestEvent(req: EventRequest): Promise<EventResult>;
  getPeers(): PlayerSnapshot[];
  getInventory(): InventorySnapshot;
  getDrops(): WorldDropRecord[];
  getOreNodes(planetId: string): OreNodeState[];
  getGroupBeacons(): import("../sim/events").GroupMemberBeacon[];
  getFriends(): FriendEntry[];
  getChatLog(channel?: string): ChatLogEntry[];
  timeSync(): TimeSync;
  getDebugInfo(localGameTime?: number): NetConnectionDebug;
  onPeers(cb: (peers: PlayerSnapshot[]) => void): () => void;
  onEvent(cb: (event: GameEvent) => void): () => void;
  onInventory(cb: (inv: InventorySnapshot) => void): () => void;
  tick(dt: number): void;
}

export interface FriendEntry {
  playerId: string;
  displayName: string;
  online: boolean;
  presence: string;
  color: string;
}

export interface ChatLogEntry {
  channel: string;
  playerId: string;
  displayName: string;
  text: string;
  ts: number;
}

export type Unsubscribe = () => void;
