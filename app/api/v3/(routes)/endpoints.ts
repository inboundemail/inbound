import { Hono } from "hono";

const router = new Hono().basePath("/endpoints");

router.get("/", (c) => c.json({ ok: true, resource: "endpoints" }));

export default router;
