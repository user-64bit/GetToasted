import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const __dirname = dirname(fileURLToPath(import.meta.url));
const client = postgres(DATABASE_URL, { max: 1, prepare: false });
const db = drizzle(client);

await migrate(db, { migrationsFolder: join(__dirname, "../drizzle") });
await client.end();
console.log("Migrations complete");
