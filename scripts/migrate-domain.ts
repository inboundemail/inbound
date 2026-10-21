import { db } from "../lib/db";
import {
  user,
  emailDomains,
  emailAddresses,
  sentEmails,
  emailThreads,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function lookupUser(email: string) {
  const result = await db.select().from(user).where(eq(user.email, email));
  return result[0] || null;
}

async function getUserDomains(userId: string) {
  return db.select().from(emailDomains).where(eq(emailDomains.userId, userId));
}

async function getDomainEmailAddresses(domainId: string) {
  return db
    .select()
    .from(emailAddresses)
    .where(eq(emailAddresses.domainId, domainId));
}

async function countRelatedData(domainName: string, userId: string) {
  // Use raw SQL for structuredEmails since 'recipient' column exists in DB but not in TypeScript schema
  const receivedResult = await db.execute(
    sql`SELECT COUNT(*) as count FROM structured_emails WHERE recipient LIKE ${"%@" + domainName}`
  );
  const receivedCount = Number(receivedResult.rows[0]?.count || 0);

  const [sentCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(sentEmails)
    .where(eq(sentEmails.fromDomain, domainName));

  const [threadCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(emailThreads)
    .where(eq(emailThreads.userId, userId));

  return {
    received: receivedCount,
    sent: Number(sentCount?.count || 0),
    threads: Number(threadCount?.count || 0),
  };
}

async function migrateDomain(
  domainId: string,
  domainName: string,
  fromUserId: string,
  toUserId: string,
  includeEmailHistory: boolean
) {
  console.log("\n🚀 Starting migration...\n");

  // 1. Update domain owner
  console.log("  → Updating domain owner...");
  await db
    .update(emailDomains)
    .set({ userId: toUserId })
    .where(eq(emailDomains.id, domainId));
  console.log("    ✅ Domain updated");

  // 2. Update email addresses
  console.log("  → Updating email addresses...");
  await db
    .update(emailAddresses)
    .set({ userId: toUserId })
    .where(eq(emailAddresses.domainId, domainId));
  console.log("    ✅ Email addresses updated");

  if (includeEmailHistory) {
    // 3. Update received emails (using raw SQL since 'recipient' column not in TypeScript schema)
    console.log("  → Migrating received emails...");
    await db.execute(
      sql`UPDATE structured_emails SET user_id = ${toUserId} WHERE recipient LIKE ${"%@" + domainName}`
    );
    console.log("    ✅ Received emails migrated");

    // 4. Update sent emails
    console.log("  → Migrating sent emails...");
    await db
      .update(sentEmails)
      .set({ userId: toUserId })
      .where(eq(sentEmails.fromDomain, domainName));
    console.log("    ✅ Sent emails migrated");

    // 5. Update email threads
    console.log("  → Migrating email threads...");
    await db
      .update(emailThreads)
      .set({ userId: toUserId })
      .where(eq(emailThreads.userId, fromUserId));
    console.log("    ✅ Email threads migrated");
  }

  console.log("\n✅ Migration complete!\n");
}

async function main() {
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║     Domain Migration Tool              ║");
  console.log("╚════════════════════════════════════════╝\n");

  // Step 1: Get source user
  const fromEmail = await prompt("Enter SOURCE user email (current owner): ");
  const fromUser = await lookupUser(fromEmail);

  if (!fromUser) {
    console.log(`\n❌ User not found: ${fromEmail}`);
    rl.close();
    process.exit(1);
  }

  console.log(`\n✅ Found user: ${fromUser.name} (${fromUser.email})`);
  console.log(`   ID: ${fromUser.id}\n`);

  // Step 2: List domains
  const domains = await getUserDomains(fromUser.id);

  if (domains.length === 0) {
    console.log("❌ This user has no domains.");
    rl.close();
    process.exit(1);
  }

  console.log("📋 Domains owned by this user:\n");
  domains.forEach((domain, index) => {
    console.log(
      `   ${index + 1}. ${domain.domain} (${domain.status}) - ID: ${domain.id}`
    );
  });

  // Step 3: Select domain
  const domainChoice = await prompt("\nEnter domain number to migrate: ");
  const domainIndex = parseInt(domainChoice) - 1;

  if (isNaN(domainIndex) || domainIndex < 0 || domainIndex >= domains.length) {
    console.log("\n❌ Invalid selection.");
    rl.close();
    process.exit(1);
  }

  const selectedDomain = domains[domainIndex];
  console.log(`\n✅ Selected domain: ${selectedDomain.domain}`);

  // Step 4: Show related data
  const emailAddrs = await getDomainEmailAddresses(selectedDomain.id);
  const counts = await countRelatedData(selectedDomain.domain, fromUser.id);

  console.log("\n📊 Related data for this domain:");
  console.log(`   • Email addresses: ${emailAddrs.length}`);
  emailAddrs.forEach((addr) => {
    console.log(`     - ${addr.address}`);
  });
  console.log(`   • Received emails: ${counts.received}`);
  console.log(`   • Sent emails: ${counts.sent}`);
  console.log(`   • Email threads: ${counts.threads}`);

  // Step 5: Get destination user
  const toEmail = await prompt("\nEnter DESTINATION user email (new owner): ");
  const toUser = await lookupUser(toEmail);

  if (!toUser) {
    console.log(`\n❌ User not found: ${toEmail}`);
    rl.close();
    process.exit(1);
  }

  console.log(`\n✅ Found user: ${toUser.name} (${toUser.email})`);
  console.log(`   ID: ${toUser.id}`);

  // Step 6: Ask about email history
  const includeHistory = await prompt(
    "\nInclude email history in migration? (y/n): "
  );
  const migrateHistory =
    includeHistory.toLowerCase() === "y" ||
    includeHistory.toLowerCase() === "yes";

  // Step 7: Confirm
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║          MIGRATION SUMMARY             ║");
  console.log("╚════════════════════════════════════════╝");
  console.log(`\n  Domain: ${selectedDomain.domain}`);
  console.log(`  From:   ${fromUser.name} (${fromUser.email})`);
  console.log(`  To:     ${toUser.name} (${toUser.email})`);
  console.log(`  Include email history: ${migrateHistory ? "Yes" : "No"}`);

  if (migrateHistory) {
    console.log(`\n  Will migrate:`);
    console.log(`    • ${emailAddrs.length} email address(es)`);
    console.log(`    • ${counts.received} received email(s)`);
    console.log(`    • ${counts.sent} sent email(s)`);
    console.log(`    • ${counts.threads} email thread(s)`);
  } else {
    console.log(`\n  Will migrate:`);
    console.log(`    • ${emailAddrs.length} email address(es)`);
    console.log(`    • Email history will stay with original user`);
  }

  const confirm = await prompt("\n⚠️  Proceed with migration? (yes/no): ");

  if (confirm.toLowerCase() !== "yes") {
    console.log("\n❌ Migration cancelled.");
    rl.close();
    process.exit(0);
  }

  // Step 8: Execute migration
  await migrateDomain(
    selectedDomain.id,
    selectedDomain.domain,
    fromUser.id,
    toUser.id,
    migrateHistory
  );

  rl.close();
  process.exit(0);
}

main().catch((error) => {
  console.error("\n❌ Error:", error.message);
  rl.close();
  process.exit(1);
});
