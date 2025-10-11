import { Hono } from "hono";

const router = new Hono().basePath("/attachments");

router.get("/", (c) => c.json({ ok: true, resource: "attachments" }));

export default router;
