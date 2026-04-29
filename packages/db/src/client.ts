import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export function createDb(connectionString: string) {
  const queryClient = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // PgBouncer / Neon pooler compatibility
  });
  return drizzle(queryClient, { schema });
}

export type Db = ReturnType<typeof createDb>;
export * from "./schema.js";
