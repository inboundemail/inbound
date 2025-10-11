import { Hono } from "hono";
import { handle } from "hono/vercel";
import { openAPIRouteHandler } from "hono-openapi";
import {
  attachments,
  domains,
  emailAddresses,
  emails,
  endpoints,
  mail,
  onboarding,
  threads,
} from "../(routes)";

const app = new Hono({ strict: false }).basePath('/api/h2');

// Mount feature routers
const routes = [
  attachments,
  domains,
  emailAddresses,
  emails,
  endpoints,
  mail,
  onboarding,
  threads,
] as const;
routes.forEach((route) => {
  app.route("/", route);
});

// OpenAPI JSON
app.get(
  "/openapi",
  openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: "inbound API",
        version: "0.1.0",
        description: "Endpoints for the inbound API",
      },
      servers: [
        {
          url: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000",
          description: "Local",
        },
        {
          url: "https://inbound.new",
          description: "Production",
        },
      ],
    },
  })
);

export const GET = handle(app);
export const POST = handle(app);
