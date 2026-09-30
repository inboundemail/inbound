import {
	buildLocalEnv,
	LOCAL_APP_PORT,
	LOCAL_MAIL_PORT,
	LOCAL_SERVICE_API_KEY,
} from "@/scripts/local-dev/env";
import { startLocalMailServer } from "@/scripts/local-dev/mail-server";
import { ensureSchema, removeServices, runSeed, startServices } from "@/scripts/local-dev/services";

const appUrl = `http://localhost:${LOCAL_APP_PORT}`;

async function main() {
	const [command, arg] = process.argv.slice(2);

	if (command === "reset") {
		removeServices();
		console.log("Local services and data removed. The next `bun run dev:local` starts fresh.");
		return;
	}

	startServices();
	if (ensureSchema()) console.log("Applied lib/db/schema.ts to the local database.");

	const env = buildLocalEnv({ appUrl });

	if (command === "seed" || command === "api-key") {
		if (!arg) throw new Error(`Usage: bun run dev:local ${command} you@example.com`);
		const result = runSeed<Record<string, unknown>>([command === "seed" ? "demo" : "api-key", arg], env);
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	if (command === "db") {
		console.log("Local services are ready.");
		return;
	}

	const mail = startLocalMailServer({
		port: LOCAL_MAIL_PORT,
		inboundWebhookUrl: `${appUrl}/api/inbound/webhook`,
		serviceApiKey: LOCAL_SERVICE_API_KEY,
		log: console.log,
	});

	console.log(`Starting next dev against local services at ${appUrl}`);
	console.log(`Outgoing email is captured at http://127.0.0.1:${LOCAL_MAIL_PORT}/_local/messages and looped back to /api/inbound/webhook.`);
	const child = Bun.spawn(["bunx", "next", "dev", "--port", String(LOCAL_APP_PORT)], {
		env,
		stdio: ["inherit", "inherit", "inherit"],
	});
	process.on("SIGINT", () => child.kill("SIGINT"));
	const code = await child.exited;
	mail.stop();
	process.exit(code);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
