import { db } from "../lib/db";
import { user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function lookupUser(email: string) {
  console.log(`Looking up user: ${email}\n`);

  const result = await db.select().from(user).where(eq(user.email, email));

  if (result.length === 0) {
    console.log("User not found");
    return;
  }

  console.log("User found:");
  console.log(JSON.stringify(result[0], null, 2));
}

const email = process.argv[2] || "amin@cncmarketer.com";
lookupUser(email);
