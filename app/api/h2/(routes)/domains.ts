import { Hono } from "hono";

const router = new Hono().basePath("/domains");

router.get("/", (c) => c.json({ ok: true, resource: "domains" }));

export default router;
