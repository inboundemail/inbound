import { Hono } from "hono";

const router = new Hono().basePath("/email-addresses");

router.get("/", (c) => c.json({ ok: true, resource: "email-addresses" }));

export default router;
