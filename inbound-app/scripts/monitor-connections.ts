#!/usr/bin/env bun

import { pool } from '@/lib/db';

function logPoolStats() {
  console.log('=== Database Pool Statistics ===');
  console.log(`Total connections: ${pool.totalCount}`);
  console.log(`Idle connections: ${pool.idleCount}`);
  console.log(`Waiting clients: ${pool.waitingCount}`);
  console.log('================================');
}

// Log stats every 10 seconds
setInterval(logPoolStats, 10000);

// Log stats immediately
logPoolStats();

// Keep the script running
process.on('SIGINT', () => {
  console.log('Shutting down connection monitor...');
  pool.end();
  process.exit(0);
});
