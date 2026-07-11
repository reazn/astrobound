# Astrobound multiplayer server

## Local (no Docker)

```bash
cd server
npm install
MEMORY_STORE=1 JWT_SECRET=dev-secret npm run dev
```

Health: `GET http://localhost:2567/health`  
Rooms: `GET http://localhost:2567/match/rooms` (optional `?systemId=…`)

## Docker (co-presence, in-memory economy)

From repo root:

```bash
# set a real JWT_SECRET in production
export JWT_SECRET=change-me-long-random
docker compose up -d --build
```

Default is `MEMORY_STORE=1` — inventories/friends live in process memory (fine for testing). Data is lost on restart.

Env knobs:

| Var | Default | Meaning |
|-----|---------|---------|
| `JWT_SECRET` | weak default | **Required** in public deploys |
| `MAX_CLIENTS_PER_ROOM` | `32` | Cap per solar-system shard |
| `INSTANCE_NAME` | `astrobound-1` | Label in `/health` |
| `CORS_ORIGIN` | `*` | Comma-separated origins in prod |
| `MEMORY_STORE` | `1` | `1` = no Postgres |

## System instances / shards

Rooms are Colyseus `system` rooms filtered by **`systemId`**:

- Different solar systems → different rooms (automatic).
- Same system hits `MAX_CLIENTS_PER_ROOM` → Colyseus `joinOrCreate` opens another room with the same `systemId` (a shard). You will not see players in the other shard.
- Empty rooms auto-dispose.

Client join options include `systemId` + `seed`. Map teleport leaves and rejoins the matching room.

## Client join

```
https://your-static-host/?mp=1&server=wss://play.example.com
```

Guest token is fetched from `POST /auth/guest`. If the server is down, the client falls back to offline single-player.

Press **L** for the debug overlay — right panel shows net/room/peer/drift counters.

Admin V-fly (dev only):

```bash
curl -X POST http://localhost:2567/auth/admin-dev
# then open ?mp=1&server=ws://localhost:2567&token=<token>
```

## Ubuntu VPS (recommended path)

**One process on one VPS is enough** to host many solar-system rooms (shards create themselves). You do not need a separate container per system.

### Simple: Docker Compose + Caddy

1. Install Docker + Compose on Ubuntu.
2. Clone repo, set `JWT_SECRET` in a `.env` next to `docker-compose.yml`.
3. `docker compose up -d --build`
4. Put **Caddy** (or nginx) in front for TLS → `wss://`:

```caddyfile
play.example.com {
  reverse_proxy localhost:2567
}

game.example.com {
  root * /var/www/astrobound-dist
  file_server
  try_files {path} /index.html
}
```

5. Build client elsewhere or on the box: `npx vite build` → copy `dist/` to the static site root.
6. Open `https://game.example.com/?mp=1&server=wss://play.example.com`

### Tools that make life easier

| Tool | Use |
|------|-----|
| **Docker Compose** (this repo) | Best default for one VPS |
| **Caddy** | Automatic HTTPS + WebSocket proxy |
| **Coolify** / **CapRover** | Panel UI to deploy Compose apps, env, TLS |
| **systemd** | If you skip Docker: `node dist/index.js` as a service |

You do **not** need Kubernetes or Redis yet. Add Redis + multiple Node processes only when one box saturates and you want rooms across machines.

### Sizing (test VPS)

- **2 vCPU / 2–4 GB RAM** — fine for friends + several system rooms  
- **4 vCPU / 4–8 GB** — comfortable public co-presence testing  

### Spinning “new shards”

You usually don’t. Fill a system to 32 → next joiner gets a new room automatically. To force isolation for testing, join with different `systemId`s (map jump does this). Multiple VPS copies need a shared matchmaker/Redis later — not in this build.

## Optional Postgres

```bash
docker compose --profile db up -d
# MEMORY_STORE=0 and DATABASE_URL=… (migrations not automated yet)
```

## What works today

- `filterBy(systemId)` rooms + auto shard when full
- Map jump rejoins the target system room (MP)
- Two+ browsers co-presence, chat, drops, mining, inventory events
- L-debug net panel (url, room, peers, drift, rejects)

## Not production-complete yet

- No durable DB migrations / real accounts
- No Redis multi-process cluster
- Social/friends are in-memory
- TLS terminator not bundled — use Caddy/nginx
