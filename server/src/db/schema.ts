import {
  pgTable, uuid, text, boolean, integer, jsonb, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

export const players = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("user"),
  guest: boolean("guest").notNull().default(false),
  characterId: text("character_id").notNull().default("barbara"),
  shipId: text("ship_id").notNull().default("barbara"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inventories = pgTable("inventories", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerId: uuid("player_id").notNull().references(() => players.id),
  kind: text("kind").notNull().default("bag"),
  isPrimary: boolean("is_primary").notNull().default(false),
  capacity: integer("capacity").notNull().default(50),
  revision: integer("revision").notNull().default(0),
}, (table) => ({
  playersPrimaryInvIdx: uniqueIndex("players_primary_inv").on(table.playerId, table.isPrimary),
}));

export const items = pgTable("items", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  inventoryId: uuid("inventory_id").references(() => inventories.id),
  itemId: text("item_id").notNull(),
  slot: integer("slot"),
  qty: integer("qty").notNull().default(1),
  stackable: boolean("stackable").notNull().default(false),
  traits: jsonb("traits"),
  gems: jsonb("gems"),
  boundTo: uuid("bound_to"),
});

export const friendships = pgTable("friendships", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromPlayerId: uuid("from_player_id").notNull().references(() => players.id),
  toPlayerId: uuid("to_player_id").notNull().references(() => players.id),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatModeration = pgTable("chat_moderation", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerId: uuid("player_id").notNull().references(() => players.id),
  reason: text("reason").notNull(),
  until: timestamp("until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const marketListings = pgTable("market_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  sellerId: uuid("seller_id").notNull().references(() => players.id),
  itemUuid: uuid("item_uuid").notNull().references(() => items.uuid),
  itemId: text("item_id").notNull(),
  qty: integer("qty").notNull(),
  price: integer("price").notNull(),
  stationId: text("station_id").notNull().default("meridian"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tradeSessions = pgTable("trade_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromPlayerId: uuid("from_player_id").notNull().references(() => players.id),
  toPlayerId: uuid("to_player_id").notNull().references(() => players.id),
  offerUuids: jsonb("offer_uuids").notNull(),
  requestUuids: jsonb("request_uuids").notNull(),
  escrowInventoryId: uuid("escrow_inventory_id"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
