import { Hono } from "hono";

const router = new Hono().basePath("/mail");

// TBH Implementation on this, it will be a mashup of email.send, email.reply, thread.list/get/actions, etc.

router.get("/", (c) => c.json({ ok: true, resource: "mail" }));

export default router;
