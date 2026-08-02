import { auth } from "@/lib/auth/auth";
import { INBOUND_DOMAIN_SCOPE } from "@/lib/auth/inbound-oauth";

interface ClientOptions {
	name: string;
	redirectUris: string[];
	publicClient: boolean;
	requireConsent: boolean;
}

function readOptions(args: string[]): ClientOptions {
	let name = "Internal Inbound App";
	const redirectUris: string[] = [];
	let publicClient = false;
	let requireConsent = false;

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--name") {
			name = args[index + 1] ?? "";
			index += 1;
		} else if (argument === "--redirect-uri") {
			const redirectUri = args[index + 1];
			if (redirectUri) redirectUris.push(redirectUri);
			index += 1;
		} else if (argument === "--public") {
			publicClient = true;
		} else if (argument === "--require-consent") {
			requireConsent = true;
		} else {
			throw new Error(`Unknown argument: ${argument}`);
		}
	}

	if (!name.trim()) throw new Error("--name cannot be empty");
	if (redirectUris.length === 0) {
		throw new Error("Provide at least one --redirect-uri");
	}
	for (const redirectUri of redirectUris) new URL(redirectUri);

	return { name, redirectUris, publicClient, requireConsent };
}

async function main() {
	const options = readOptions(Bun.argv.slice(2));
	const client = await auth.api.adminCreateOAuthClient({
		body: {
			client_name: options.name,
			redirect_uris: options.redirectUris,
			scope: [
				"openid",
				"profile",
				"email",
				"offline_access",
				INBOUND_DOMAIN_SCOPE,
			].join(" "),
			token_endpoint_auth_method: options.publicClient
				? "none"
				: "client_secret_basic",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			type: options.publicClient ? undefined : "web",
			require_pkce: true,
			skip_consent: !options.requireConsent,
		},
	});

	console.log(JSON.stringify(client, null, 2));
}

main().catch((error: unknown) => {
	console.error(
		error instanceof Error ? error.message : "Client creation failed",
	);
	process.exit(1);
});
