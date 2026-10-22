import { loadConfig } from "./config.ts";
import { SmtpGateway } from "./server.ts";

// State after an unexpected error (counters, slots, half-handled sessions) cannot be trusted, so
// log and exit non-zero; systemd restarts the service.
for (const event of ["uncaughtException", "unhandledRejection"] as const) {
	process.on(event, (error: unknown) => {
		console.error(`[smtp-gateway] fatal ${event}, exiting`, error);
		process.exit(70);
	});
}

const config = loadConfig();
const gateway = new SmtpGateway(config);
gateway.start();

const shutdown = async (signal: string) => {
	console.log(`[smtp-gateway] received ${signal}, shutting down`);
	await gateway.stop();
	process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
