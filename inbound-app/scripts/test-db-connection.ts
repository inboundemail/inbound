#!/usr/bin/env bun

import { testConnection } from '@/lib/db';

async function main() {
  console.log('Testing database connection...');
  
  const isConnected = await testConnection();
  
  if (isConnected) {
    console.log('✅ Database connection successful!');
    process.exit(0);
  } else {
    console.log('❌ Database connection failed!');
    process.exit(1);
  }
}

main().catch(console.error);
