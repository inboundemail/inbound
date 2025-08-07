#!/usr/bin/env bun

import 'dotenv/config';
import { Pool } from 'pg';

async function debugConnection() {
  console.log('🔍 Debugging PostgreSQL connection...\n');
  
  const originalUrl = process.env.DATABASE_URL!;
  console.log('Original URL:', originalUrl);
  console.log('Original URL length:', originalUrl.length);
  
  // Clean the connection string
  const cleanedUrl = originalUrl
    .replace(/[&?]sslrootcert=system/g, '')
    .replace(/[&?]sslmode=verify-full/g, '');
  
  console.log('Cleaned URL:', cleanedUrl);
  console.log('Cleaned URL length:', cleanedUrl.length);
  
  // Parse URL manually to see what we get
  try {
    const url = new URL(originalUrl);
    console.log('\n📋 Parsed URL components:');
    console.log('  Protocol:', url.protocol);
    console.log('  Username:', url.username);
    console.log('  Password:', url.password ? '[REDACTED]' : 'NOT SET');
    console.log('  Host:', url.hostname);
    console.log('  Port:', url.port || 'default');
    console.log('  Database:', url.pathname.substring(1));
    console.log('  Search params:', url.searchParams.toString());
  } catch (error) {
    console.error('❌ Failed to parse URL:', error);
  }
  
  // Try creating a pool with different configurations
  console.log('\n🧪 Testing different pool configurations...');
  
  // Test 1: Original URL
  try {
    console.log('Test 1: Original URL...');
    const pool1 = new Pool({ connectionString: originalUrl });
    const client1 = await pool1.connect();
    console.log('✅ Original URL works!');
    client1.release();
    await pool1.end();
  } catch (error) {
    console.log('❌ Original URL failed:', (error as Error).message);
  }
  
  // Test 2: Cleaned URL
  try {
    console.log('Test 2: Cleaned URL...');
    const pool2 = new Pool({ connectionString: cleanedUrl });
    const client2 = await pool2.connect();
    console.log('✅ Cleaned URL works!');
    client2.release();
    await pool2.end();
  } catch (error) {
    console.log('❌ Cleaned URL failed:', (error as Error).message);
  }
  
  // Test 3: Cleaned URL with SSL
  try {
    console.log('Test 3: Cleaned URL with SSL config...');
    const pool3 = new Pool({ 
      connectionString: cleanedUrl,
      ssl: { rejectUnauthorized: true }
    });
    const client3 = await pool3.connect();
    console.log('✅ Cleaned URL with SSL works!');
    client3.release();
    await pool3.end();
  } catch (error) {
    console.log('❌ Cleaned URL with SSL failed:', (error as Error).message);
  }
  
  // Test 4: Manual config
  try {
    console.log('Test 4: Manual configuration...');
    const url = new URL(originalUrl);
    const pool4 = new Pool({
      user: url.username,
      password: url.password,
      host: url.hostname,
      port: parseInt(url.port) || 5432,
      database: url.pathname.substring(1),
      ssl: { rejectUnauthorized: true }
    });
    const client4 = await pool4.connect();
    console.log('✅ Manual configuration works!');
    client4.release();
    await pool4.end();
  } catch (error) {
    console.log('❌ Manual configuration failed:', (error as Error).message);
  }
}

debugConnection().catch(console.error);
