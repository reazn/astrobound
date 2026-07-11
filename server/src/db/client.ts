import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

const url = process.env.DATABASE_URL ?? "";
const memoryOnly = process.env.MEMORY_STORE === "1" || !url;

let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function isMemoryStore(): boolean {
  return memoryOnly;
}

export function getDb() {
  if (memoryOnly) {
    throw new Error("memory_store");
  }
  if (!db) {
    client = postgres(url, { max: 5, idle_timeout: 20, connect_timeout: 5 });
    db = drizzle(client, { schema });
  }
  return db;
}

export async function closeDb() {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
    db = null;
  }
}

export { schema };
