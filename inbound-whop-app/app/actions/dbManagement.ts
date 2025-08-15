import { neon } from "@neondatabase/serverless"

// Table Structure:

// CREATE TABLE IF NOT EXISTS inbound_emails (
//     id SERIAL PRIMARY KEY,
//     whop_user_id VARCHAR(255) UNIQUE NOT NULL,
//     inbound_email_id VARCHAR(255) NOT NULL,
//     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//   )

export async function saveInboundEmail(whopUserId: string, inboundEmailId: string) {
	const sql = neon(process.env.DATABASE_URL!)

	await sql`
		INSERT INTO inbound_emails (whop_user_id, inbound_email_id) VALUES (${whopUserId}, ${inboundEmailId})
	`
}

export async function getInboundEmail(whopUserId: string) {
	const sql = neon(process.env.DATABASE_URL!)

	const result = await sql`
		SELECT * FROM inbound_emails WHERE whop_user_id = ${whopUserId}
	`

	return result[0]
}