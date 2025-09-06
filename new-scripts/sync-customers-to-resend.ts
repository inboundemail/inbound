import { config } from 'dotenv';
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { user } from '../lib/db/auth-schema';
import { Resend } from 'resend';

// Load environment variables from parent directory
config({ path: '../.env' });

const AUDIENCE_ID = '515e5071-4d0e-4117-9c12-e8ddd29b807e';

if (!process.env.PROD_DATABASE_URL) {
  throw new Error("PROD_DATABASE_URL is not set");
}

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY is not set");
}

const sql = neon(process.env.PROD_DATABASE_URL);
const db = drizzle(sql);
const resend = new Resend(process.env.RESEND_API_KEY);

interface User {
  name: string;
  email: string;
}

async function getAllUsers(): Promise<User[]> {
  console.log('📝 Fetching all users from database...');
  
  const users = await db
    .select({
      name: user.name,
      email: user.email,
    })
    .from(user);
  
  console.log(`Found ${users.length} users in database`);
  return users;
}

async function getAllExistingContacts(): Promise<Set<string>> {
  console.log('📋 Fetching existing contacts from Resend audience...');
  
  try {
    const response = await resend.contacts.list({
      audienceId: AUDIENCE_ID,
    });
    
    const existingEmails = new Set<string>();
    
    if (response.data && Array.isArray(response.data)) {
      response.data.forEach((contact: any) => {
        if (contact.email) {
          existingEmails.add(contact.email.toLowerCase());
        }
      });
    }
    
    console.log(`Found ${existingEmails.size} existing contacts in Resend audience`);
    return existingEmails;
  } catch (error: any) {
    console.error('❌ Failed to fetch existing contacts:', error.message);
    throw error;
  }
}

async function addContactToAudience(userData: User): Promise<boolean> {
  try {
    const result = await resend.contacts.create({
      email: userData.email,
      firstName: userData.name.split(' ')[0] || userData.name, // Use first part of name as firstName
      lastName: userData.name.split(' ').slice(1).join(' ') || undefined, // Use rest as lastName
      unsubscribed: false,
      audienceId: AUDIENCE_ID,
    });
    
    console.log(`✅ Added ${userData.name} (${userData.email}) to audience`);
    return true;
  } catch (error: any) {
    console.error(`❌ Failed to add ${userData.email}:`, error.message);
    return false;
  }
}

async function main() {
  try {
    console.log('🚀 Starting sync process...\n');
    
    // Get all users from database and existing contacts from Resend
    const [users, existingContacts] = await Promise.all([
      getAllUsers(),
      getAllExistingContacts()
    ]);
    
    if (users.length === 0) {
      console.log('No users found in database');
      return;
    }
    
    // Filter users to only those not already in Resend
    const usersToAdd = users.filter(user => 
      !existingContacts.has(user.email.toLowerCase())
    );
    
    const existingCount = users.length - usersToAdd.length;
    
    console.log(`\n📊 Analysis:`);
    console.log(`👥 Total users in database: ${users.length}`);
    console.log(`📧 Already in Resend audience: ${existingCount}`);
    console.log(`➕ Users to add: ${usersToAdd.length}\n`);
    
    if (usersToAdd.length === 0) {
      console.log('✨ All users are already in the Resend audience!');
      return;
    }
    
    let addedCount = 0;
    let errorCount = 0;
    
    // Process users in batches to avoid rate limiting
    const batchSize = 5;
    console.log(`🔄 Adding ${usersToAdd.length} users in batches of ${batchSize}...\n`);
    
    for (let i = 0; i < usersToAdd.length; i += batchSize) {
      const batch = usersToAdd.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(usersToAdd.length / batchSize)}...`);
      
      await Promise.all(batch.map(async (userData) => {
        try {
          const added = await addContactToAudience(userData);
          if (added) {
            addedCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          console.error(`❌ Error processing ${userData.email}:`, error);
          errorCount++;
        }
      }));
      
      // Add a small delay between batches to be nice to the API
      if (i + batchSize < usersToAdd.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('\n🎉 Sync completed!');
    console.log(`✅ Successfully added: ${addedCount}`);
    console.log(`⏭️  Already existed: ${existingCount}`);
    console.log(`❌ Failed to add: ${errorCount}`);
    console.log(`📈 Total processed: ${users.length}`);
    
  } catch (error) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  }
}

// Run the script
main();
