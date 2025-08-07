import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// PSBouncer-optimized connection pool configuration
const pool = new Pool({
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  host: process.env.DATABASE_HOST,
  port: 6432, // PSBouncer port
  database: process.env.DATABASE_NAME,
  ssl: {
    rejectUnauthorized: true,
  },
  // Connection pool settings optimized for PSBouncer
  max: 10, // Maximum number of clients in the pool
  min: 2,  // Minimum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 5000, // Return error after 5 seconds if connection could not be established
  maxUses: 7500, // Close connection after 7500 uses (helps prevent memory leaks)
  allowExitOnIdle: true, // Allow the pool to close connections when idle
});

// Add connection event handlers for debugging
pool.on('connect', (client) => {
  console.log('Database connection established');
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

pool.on('remove', (client) => {
  console.log('Database connection removed from pool');
});

export const db = drizzle(pool);

// Export pool for connection testing and manual connection management
export { pool };

// Helper function to test database connectivity
export async function testConnection() {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('Database connection test successful');
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}