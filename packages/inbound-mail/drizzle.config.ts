import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config();

const databaseUrl = process.env.INBOUND_MAIL_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "INBOUND_MAIL_DATABASE_URL is required. Add it to packages/inbound-mail/.env.local.",
  );
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
