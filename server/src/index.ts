import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server, matchMaker } from "colyseus";
import { SystemRoom } from "./rooms/SystemRoom.js";
import { signGuestToken, signAdminDevToken, verifyJoinToken } from "./auth/jwt.js";
import { getFriends, addFriend } from "./services/socialService.js";
import { isMemoryStore } from "./db/client.js";

const PORT = Number(process.env.PORT ?? 2567);
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";
const MAX_CLIENTS_PER_ROOM = Number(process.env.MAX_CLIENTS_PER_ROOM ?? 32);
const INSTANCE_NAME = process.env.INSTANCE_NAME ?? "astrobound-1";

if (process.env.NODE_ENV === "production" && JWT_SECRET === "dev-secret-change-me") {
  console.warn("[warn] JWT_SECRET is the default value — set a strong secret before public deploy");
}

const app = express();
app.use(cors({
  origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN.split(",").map((s) => s.trim()),
}));
app.use(express.json({ limit: "32kb" }));

app.get("/health", async (_req, res) => {
  let rooms: Array<{ roomId: string; systemId: string; clients: number; maxClients: number }> = [];
  try {
    const listed = await matchMaker.query({ name: "system" });
    rooms = listed.map((r) => ({
      roomId: r.roomId,
      systemId: String((r.metadata as { systemId?: string } | undefined)?.systemId ?? "unknown"),
      clients: r.clients,
      maxClients: r.maxClients,
    }));
  } catch {
    rooms = [];
  }
  res.json({
    ok: true,
    instance: INSTANCE_NAME,
    memoryStore: isMemoryStore(),
    uptime: process.uptime(),
    maxClientsPerRoom: MAX_CLIENTS_PER_ROOM,
    roomCount: rooms.length,
    rooms,
  });
});

app.get("/match/rooms", async (req, res) => {
  const systemId = typeof req.query.systemId === "string" ? req.query.systemId : null;
  try {
    const listed = await matchMaker.query({ name: "system" });
    const rooms = listed
      .map((r) => ({
        roomId: r.roomId,
        systemId: String((r.metadata as { systemId?: string } | undefined)?.systemId ?? "unknown"),
        clients: r.clients,
        maxClients: r.maxClients,
        locked: r.locked,
      }))
      .filter((r) => !systemId || r.systemId === systemId);
    res.json({ instance: INSTANCE_NAME, rooms });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/auth/guest", (req, res) => {
  const displayName = String(req.body?.displayName ?? "Guest").slice(0, 24);
  const token = signGuestToken(displayName);
  const payload = verifyJoinToken(token);
  if (!payload) {
    res.status(500).json({ error: "token_failed" });
    return;
  }
  res.json({ token, player: payload });
});

app.post("/auth/admin-dev", (_req, res) => {
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "disabled" });
    return;
  }
  const token = signAdminDevToken();
  res.json({ token, player: verifyJoinToken(token) });
});

app.get("/social/friends/:playerId", (req, res) => {
  res.json({ friends: getFriends(req.params.playerId) });
});

app.post("/social/friends/add", (req, res) => {
  const { playerId, displayName } = req.body ?? {};
  if (!playerId || !displayName) {
    res.status(400).json({ error: "missing_fields" });
    return;
  }
  const friend = addFriend(String(playerId), String(displayName).slice(0, 24));
  res.json({ friend, friends: getFriends(String(playerId)) });
});

const httpServer = createServer(app);
const gameServer = new Server({
  server: httpServer,
});

gameServer
  .define("system", SystemRoom)
  .filterBy(["systemId"]);

httpServer.listen(PORT, () => {
  console.log(
    `Astrobound server ${INSTANCE_NAME} on :${PORT}` +
    ` (memoryStore=${isMemoryStore()}, maxClients=${MAX_CLIENTS_PER_ROOM}, filterBy=systemId)`,
  );
});
