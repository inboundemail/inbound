import { drizzle } from "drizzle-orm/neon-http";
import { neon, neonConfig } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const LOCAL_DB_HOST = "db.localtest.me";
const databaseHost = new URL(process.env.DATABASE_URL).hostname;
const isLocalDatabase = databaseHost === LOCAL_DB_HOST;

if (
  process.env.NEXT_RUNTIME &&
  process.env.NODE_ENV === "development" &&
  !isLocalDatabase &&
  process.env.ALLOW_REMOTE_DB !== "true"
) {
  throw new Error(
    `next dev is pointed at a remote database (${databaseHost}). Run \`bun run dev:local\` for the local database, or set ALLOW_REMOTE_DB=true to connect anyway.`,
  );
}

if (isLocalDatabase) {
  neonConfig.fetchEndpoint = () => `http://${LOCAL_DB_HOST}:4444/sql`;
}

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql);
