import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";


const pool = new Pool({
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  host: process.env.DATABASE_HOST,
  database: process.env.DATABASE_NAME,
  ssl: {
    rejectUnauthorized: true,
  },
});

export const db = drizzle(pool);

// Export pool for connection testing
export { pool };
