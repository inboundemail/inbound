import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { db } from "@/lib/db";
import { sentEmails } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { validateRequest } from "../lib/helper";

const router = new Hono().basePath("/emails");

router.get(
  "/",
  describeRoute({
    summary: "List emails",
    description:
      "Returns a paginated list of sent emails for the authenticated user",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      subject: { type: "string" },
                      sentAt: {
                        anyOf: [{ type: "string" }, { type: "null" }],
                      },
                    },
                    required: ["id", "subject"],
                  },
                },
                nextCursor: {
                  anyOf: [{ type: "string" }, { type: "null" }],
                },
              },
              required: ["items"],
            },
          },
        },
      },
      401: { description: "Unauthorized" },
      429: { description: "Rate limit exceeded" },
    },
  }),
  async (c) => {
    const auth = await validateRequest(c.req.raw);

    if (!("userId" in auth)) {
      return c.json({ error: auth.error || "Unauthorized" }, 401);
    }

    // Check for rate limit error
    if (auth.error === "Rate limit exceeded") {
      c.header("X-RateLimit-Limit", String(auth.rateLimit?.limit || 0));
      c.header("X-RateLimit-Remaining", String(auth.rateLimit?.remaining || 0));
      c.header("X-RateLimit-Reset", auth.rateLimit?.reset || "");
      return c.json(
        {
          error: "Rate limit exceeded",
          rateLimit: auth.rateLimit,
        },
        429
      );
    }

    // Add rate limit headers to successful response
    if (auth.rateLimit) {
      c.header("X-RateLimit-Limit", String(auth.rateLimit.limit));
      c.header("X-RateLimit-Remaining", String(auth.rateLimit.remaining));
      c.header("X-RateLimit-Reset", auth.rateLimit.reset);
    }

    // Minimal port of v2 emails GET: list recent sent emails for user
    const limit = Number(c.req.query("limit") ?? "10");
    const safeLimit = Number.isFinite(limit)
      ? Math.min(Math.max(limit, 1), 100)
      : 10;

    // TypeScript: auth.userId is guaranteed to exist at this point
    const userId = auth.userId as string;

    const items = await db
      .select({
        id: sentEmails.id,
        subject: sentEmails.subject,
        sentAt: sentEmails.sentAt,
      })
      .from(sentEmails)
      .where(eq(sentEmails.userId, userId))
      .orderBy(desc(sentEmails.createdAt))
      .limit(safeLimit);

    return c.json({ items, nextCursor: null });
  }
);

export default router;
