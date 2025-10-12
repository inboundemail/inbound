import { Hono } from "hono";

const router = new Hono().basePath("/onboarding");

router.get("/", (c) => c.json({ ok: true, resource: "onboarding" }));

export default router;
