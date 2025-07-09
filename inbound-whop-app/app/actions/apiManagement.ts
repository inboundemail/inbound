'use server'

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

// Types
export type ApiKeyData = {
  id: number;
  lookup_id: string;
  api_key: string;
  created_at: string;
  updated_at: string;
};

export type SaveApiKeyData = {
  lookupId: string;
  apiKey: string;
};

export type ApiKeyResult = {
  success: boolean;
  data?: ApiKeyData;
  error?: string;
};

// Initialize the table if it doesn't exist
async function initTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS api_keys (
      id SERIAL PRIMARY KEY,
      lookup_id VARCHAR(255) UNIQUE NOT NULL,
      api_key TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

export async function saveApiKey(data: SaveApiKeyData): Promise<ApiKeyResult> {
  try {
    await initTable();
    
    const { lookupId, apiKey } = data;

    if (!lookupId || !apiKey) {
      return {
        success: false,
        error: 'lookupId and apiKey are required'
      };
    }

    // Insert or update the API key
    const result = await sql`
      INSERT INTO api_keys (lookup_id, api_key)
      VALUES (${lookupId}, ${apiKey})
      ON CONFLICT (lookup_id)
      DO UPDATE SET 
        api_key = EXCLUDED.api_key,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    return {
      success: true,
      data: result[0] as ApiKeyData
    };

  } catch (error) {
    console.error('Error saving API key:', error);
    return {
      success: false,
      error: 'Failed to save API key'
    };
  }
}

export async function getApiKey(lookupId: string): Promise<ApiKeyResult> {
  try {
    if (!lookupId) {
      return {
        success: false,
        error: 'lookupId parameter is required'
      };
    }

    const result = await sql`
      SELECT lookup_id, api_key, created_at, updated_at
      FROM api_keys
      WHERE lookup_id = ${lookupId}
    `;

    if (result.length === 0) {
      return {
        success: false,
        error: 'API key not found'
      };
    }

    return {
      success: true,
      data: result[0] as ApiKeyData
    };

  } catch (error) {
    console.error('Error retrieving API key:', error);
    return {
      success: false,
      error: 'Failed to retrieve API key'
    };
  }
}
