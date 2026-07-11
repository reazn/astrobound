import type { NetAdapter, NetAdapterOptions } from "./adapterTypes";
import { createLocalNetAdapter } from "./localAdapter";
import { createRemoteNetAdapter } from "./remoteAdapter";

export interface CreateNetAdapterOptions extends NetAdapterOptions {
  mode?: "local" | "remote";
  serverUrl?: string;
  joinToken?: string;
}

export function createNetAdapter(opts: CreateNetAdapterOptions): NetAdapter {
  if (opts.mode === "remote" && opts.serverUrl) {
    return createRemoteNetAdapter({
      ...opts,
      serverUrl: opts.serverUrl,
      joinToken: opts.joinToken ?? "",
    });
  }
  return createLocalNetAdapter(opts);
}

export async function createConnectedNetAdapter(
  opts: CreateNetAdapterOptions,
): Promise<{ adapter: NetAdapter; fallbackReason?: string }> {
  if (opts.mode !== "remote" || !opts.serverUrl) {
    const adapter = createLocalNetAdapter(opts);
    await adapter.connect();
    return { adapter };
  }

  try {
    const remote = createRemoteNetAdapter({
      ...opts,
      serverUrl: opts.serverUrl,
      joinToken: opts.joinToken ?? "",
    });
    await remote.connect();
    return { adapter: remote };
  } catch (err) {
    console.warn("[net] remote connect failed, falling back to local", err);
    const local = createLocalNetAdapter(opts);
    await local.connect();
    return { adapter: local, fallbackReason: String(err) };
  }
}

export function netModeFromUrl(): "local" | "remote" {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mp") === "1" || params.get("server")) return "remote";
  return "local";
}

export function serverUrlFromParams(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("server") ?? "ws://localhost:2567";
}

export function joinTokenFromParams(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("token") ?? "";
}

export function createGuestSession(displayName = "Guest"): import("./adapterTypes").NetSession {
  const id = `guest-${Math.random().toString(36).slice(2, 10)}`;
  return {
    playerId: id,
    displayName,
    role: "user",
    guest: true,
    characterId: "barbara",
    shipId: "barbara",
  };
}

export function httpBaseFromWs(wsUrl: string): string {
  return wsUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
}

export async function fetchGuestToken(
  serverUrl: string,
  displayName: string,
): Promise<{ token: string; player: import("./adapterTypes").NetSession } | null> {
  try {
    const res = await fetch(`${httpBaseFromWs(serverUrl)}/auth/guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName }),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      token: string;
      player: {
        playerId: string;
        displayName: string;
        role: "user" | "admin";
        guest: boolean;
        characterId: string;
        shipId: string;
      };
    };
    return {
      token: data.token,
      player: {
        playerId: data.player.playerId,
        displayName: data.player.displayName,
        role: data.player.role,
        guest: data.player.guest,
        characterId: data.player.characterId,
        shipId: data.player.shipId,
      },
    };
  } catch {
    return null;
  }
}
