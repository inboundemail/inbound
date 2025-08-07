import { db, pool } from './index';
import { sql } from 'drizzle-orm';

export interface DatabaseConnectionResult {
  success: boolean;
  message: string;
  error?: string;
  details?: {
    responseTime: number;
    serverVersion?: string;
    poolInfo?: {
      totalCount: number;
      idleCount: number;
      waitingCount: number;
    };
  };
}

/**
 * Test database connection using Drizzle ORM with a simple query
 */
export async function testDatabaseConnection(): Promise<DatabaseConnectionResult> {
  const startTime = Date.now();
  
  try {
    console.log('🔍 Testing database connection...');
    
    // Test with a simple SELECT query
    const result = await db.execute(sql`SELECT 1 as test, version() as version, now() as current_time`);
    
    const responseTime = Date.now() - startTime;
    
    const row = result.rows[0] as any;
    const serverVersion = row.version;
    
    console.log('✅ Database connection successful!');
    console.log(`📊 Response time: ${responseTime}ms`);
    console.log(`🗄️ Server version: ${serverVersion}`);
    
    return {
      success: true,
      message: 'Database connection successful',
      details: {
        responseTime,
        serverVersion,
        poolInfo: {
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount,
        },
      },
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('❌ Database connection failed:', errorMessage);
    
    return {
      success: false,
      message: 'Database connection failed',
      error: errorMessage,
      details: {
        responseTime,
        poolInfo: {
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount,
        },
      },
    };
  }
}

/**
 * Test database connection using raw Pool connection
 */
export async function testRawConnection(): Promise<DatabaseConnectionResult> {
  const startTime = Date.now();
  let client;
  
  try {
    console.log('🔍 Testing raw database connection...');
    
    // Get a client from the pool
    client = await pool.connect();
    
    // Test with a simple query
    const result = await client.query('SELECT 1 as test, version() as version, now() as current_time');
    
    const responseTime = Date.now() - startTime;
    const serverVersion = result.rows[0].version;
    
    console.log('✅ Raw database connection successful!');
    console.log(`📊 Response time: ${responseTime}ms`);
    console.log(`🗄️ Server version: ${serverVersion}`);
    
    return {
      success: true,
      message: 'Raw database connection successful',
      details: {
        responseTime,
        serverVersion,
        poolInfo: {
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount,
        },
      },
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('❌ Raw database connection failed:', errorMessage);
    
    return {
      success: false,
      message: 'Raw database connection failed',
      error: errorMessage,
      details: {
        responseTime,
        poolInfo: {
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount,
        },
      },
    };
  } finally {
    // Always release the client back to the pool
    if (client) {
      client.release();
    }
  }
}

/**
 * Test database connection by querying a specific table from your schema
 */
export async function testSchemaConnection(): Promise<DatabaseConnectionResult> {
  const startTime = Date.now();
  
  try {
    console.log('🔍 Testing database connection with schema query...');
    
    // Test by querying one of your tables (user table should exist)
    const result = await db.execute(sql`
      SELECT COUNT(*) as user_count 
      FROM "user" 
      LIMIT 1
    `);
    
    const responseTime = Date.now() - startTime;
    const userCount = (result.rows[0] as any).user_count;
    
    console.log('✅ Schema connection successful!');
    console.log(`📊 Response time: ${responseTime}ms`);
    console.log(`👥 User count: ${userCount}`);
    
    return {
      success: true,
      message: `Schema connection successful. Found ${userCount} users.`,
      details: {
        responseTime,
        poolInfo: {
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount,
        },
      },
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('❌ Schema connection failed:', errorMessage);
    
    return {
      success: false,
      message: 'Schema connection failed',
      error: errorMessage,
      details: {
        responseTime,
        poolInfo: {
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount,
        },
      },
    };
  }
}

/**
 * Comprehensive database health check
 */
export async function healthCheck(): Promise<DatabaseConnectionResult> {
  console.log('🏥 Running comprehensive database health check...');
  
  // Test basic connection first
  const basicTest = await testDatabaseConnection();
  if (!basicTest.success) {
    return basicTest;
  }
  
  // Test schema connection
  const schemaTest = await testSchemaConnection();
  if (!schemaTest.success) {
    return {
      ...schemaTest,
      message: 'Basic connection works, but schema access failed. Check if tables exist.',
    };
  }
  
  return {
    success: true,
    message: 'All database health checks passed',
    details: {
      responseTime: (basicTest.details?.responseTime || 0) + (schemaTest.details?.responseTime || 0),
      serverVersion: basicTest.details?.serverVersion,
      poolInfo: basicTest.details?.poolInfo,
    },
  };
}
