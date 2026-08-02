import { Elysia, t } from "elysia";
import { nanoid } from "nanoid";
import { validateAndRateLimit } from "@/app/api/e2/lib/auth";
import { db } from "@/lib/db";
import { onboardingDemoEmails } from "@/lib/db/schema";

const SendDemoEmailBody = t.Object({
	to: t.String({ description: "Recipient email address" }),
});

const SendDemoSuccessResponse = t.Object({
	id: t.String(),
	messageId: t.Optional(t.String()),
});

const SendDemoErrorResponse = t.Object({
	error: t.String(),
	message: t.Optional(t.String()),
	statusCode: t.Optional(t.Number()),
});

export const sendOnboardingDemo = new Elysia().post(
	"/onboarding/demo",
	async ({ request, body, set }) => {
		const userId = await validateAndRateLimit(request, set);
		const { to } = body;

		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(to)) {
			set.status = 400;
			return { error: "Invalid email address format" };
		}

		try {
			const demoEmailId = nanoid();
			const messageId = `onboarding-${demoEmailId}@inbnd.dev`;
			const sendHeaders = new Headers({
				"Content-Type": "application/json",
				"Idempotency-Key": demoEmailId,
			});
			for (const header of [
				"cookie",
				"authorization",
				"x-forwarded-for",
				"x-real-ip",
				"cf-connecting-ip",
			]) {
				const value = request.headers.get(header);
				if (value) sendHeaders.set(header, value);
			}

			const sendResponse = await fetch(new URL("/api/e2/emails", request.url), {
				method: "POST",
				headers: sendHeaders,
				body: JSON.stringify({
					from: "Inbound Demo <agent@inbnd.dev>",
					to,
					subject: "Welcome to Inbound! Reply to complete setup",
					html: `
          <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 16px;">Welcome to Inbound!</h1>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
              This is a test email from your Inbound setup. Reply to this email to complete your onboarding.
            </p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
              Once you reply, we'll detect it automatically and you'll be ready to start receiving emails!
            </p>
            <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
            <p style="color: #888; font-size: 14px;">
              This email was sent from <a href="https://inbound.new" style="color: #0066cc;">Inbound</a>
            </p>
          </div>
        `,
					text: `Welcome to Inbound!\n\nThis is a test email from your Inbound setup. Reply to this email to complete your onboarding.\n\nOnce you reply, we'll detect it automatically and you'll be ready to start receiving emails!`,
					headers: {
						"Message-ID": `<${messageId}>`,
					},
				}),
			});

			const payload: unknown = await sendResponse.json();
			const sendResult =
				payload && typeof payload === "object"
					? (payload as { id?: unknown; error?: unknown })
					: null;
			if (!sendResponse.ok || typeof sendResult?.id !== "string") {
				set.status =
					sendResponse.status === 429
						? 429
						: sendResponse.status < 500
							? 400
							: 500;
				return {
					error:
						typeof sendResult?.error === "string"
							? sendResult.error
							: "Failed to send demo email",
				};
			}

			await db.insert(onboardingDemoEmails).values({
				id: demoEmailId,
				userId,
				emailId: sendResult.id,
				messageId,
				recipientEmail: to,
				sentAt: new Date(),
				replyReceived: false,
			});

			set.status = 201;
			return {
				id: sendResult.id,
				messageId,
			};
		} catch (error) {
			console.error("❌ Failed to send demo email:", error);
			set.status = 500;
			return {
				error:
					error instanceof Error ? error.message : "Failed to send demo email",
			};
		}
	},
	{
		body: SendDemoEmailBody,
		response: {
			201: SendDemoSuccessResponse,
			400: SendDemoErrorResponse,
			401: SendDemoErrorResponse,
			403: SendDemoErrorResponse,
			429: SendDemoErrorResponse,
			500: SendDemoErrorResponse,
		},
		detail: {
			tags: ["Onboarding"],
			summary: "Send onboarding demo email",
			description:
				"Send a demo email during onboarding to verify email setup. User must reply to complete onboarding.",
		},
	},
);
