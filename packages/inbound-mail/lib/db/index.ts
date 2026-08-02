import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

function createMailDatabase(databaseUrl: string) {
  return drizzle({ client: neon(databaseUrl), schema });
}

export type MailDatabase = ReturnType<typeof createMailDatabase>;

let database: MailDatabase | undefined;

export function getMailDatabase(): MailDatabase {
  const databaseUrl = process.env.INBOUND_MAIL_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("INBOUND_MAIL_DATABASE_URL is not configured");
  }

  database ??= createMailDatabase(databaseUrl);
  return database;
}
