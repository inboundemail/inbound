import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle/migrations',
  schema: './lib/db/schema.ts',
  dialect: 'postgresql',
});
