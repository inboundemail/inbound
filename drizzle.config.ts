// import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config(
  {
    path: '.env.local',
  }
);

// Ensure we have a DATABASE_URL from either .env or .env.local
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required. Please add it to your .env or .env.local file.');
}

export default defineConfig({
  out: './drizzle',
  schema: './lib/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
});
