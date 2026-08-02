import { loadConfig } from "./config.ts";
import { SmtpGateway } from "./server.ts";

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
