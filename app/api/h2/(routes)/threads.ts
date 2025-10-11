import { Hono } from "hono";

const router = new Hono().basePath("/threads");

router.get("/", (c) => c.json({ ok: true, resource: "threads" }));

export default router;
