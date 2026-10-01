import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { getManagedDomain } from "@/lib/domains-and-dns/managed-domain";
import { redis } from "@/lib/redis";

const ses = new SESv2Client({ region: process.env.AWS_REGION || "us-east-2" });

/**
 * Sends one sample email from agent@inbnd.dev to hello@<slug>.inbnd.dev, so
 * someone on /welcome can watch it arrive without leaving the page. Limited to
 * one every 30 seconds and five per day per user.
 */
export async function POST() {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

	const domain = await getManagedDomain(session.user.id);
	if (!domain) return Response.json({ error: "No inbox yet" }, { status: 404 });

	const cooldown = await redis.set(`welcome:test-email:${session.user.id}`, "1", { nx: true, ex: 30 });
	if (cooldown !== "OK") {
		return Response.json({ error: "One test email every 30 seconds" }, { status: 429 });
	}
	const dayKey = `welcome:test-email-day:${session.user.id}`;
	const sentToday = await redis.incr(dayKey);
	if (sentToday === 1) await redis.expire(dayKey, 86_400);
	if (sentToday > 5) {
		return Response.json({ error: "Daily test email limit reached" }, { status: 429 });
	}

	const firstName = session.user.name?.trim().split(/\s+/)[0] || "there";
	const to = `hello@${domain.domain}`;

	try {
		await ses.send(
			new SendEmailCommand({
				FromEmailAddress: "inbound <agent@inbnd.dev>",
				Destination: { ToAddresses: [to] },
				Content: {
					Simple: {
						Subject: { Data: `Hi ${firstName}, your inbox works`, Charset: "UTF-8" },
						Body: {
							Text: {
								Data: `This email was sent to ${to} and parsed by inbound.\n\nAny address @${domain.domain} works. Point your agent at it with the API key on the welcome page.`,
								Charset: "UTF-8",
							},
						},
					},
				},
			}),
		);
	} catch (error) {
		console.error("welcome test email failed", error);
		return Response.json({ error: "Couldn't send the test email" }, { status: 502 });
	}

	return Response.json({ sent: true, to });
}
