import {
	chmod,
	mkdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type Mailbox = {
	from?: string;
	selectors: string[];
};

export type InboundctlConfig = {
	version: 1;
	baseUrl: string;
	defaultMailbox?: string;
	mailboxes: Record<string, Mailbox>;
};

export type Credentials = {
	version: 1;
	apiKey: string;
	apiKeyId?: string;
	user?: {
		id?: string;
		email?: string;
		name?: string;
	};
};

export const DEFAULT_CONFIG: InboundctlConfig = {
	version: 1,
	baseUrl: "https://inbound.new",
	mailboxes: {},
};

export function configHome(env = process.env): string {
	if (env.INBOUNDCTL_CONFIG_HOME) return env.INBOUNDCTL_CONFIG_HOME;
	if (env.XDG_CONFIG_HOME) return join(env.XDG_CONFIG_HOME, "inboundctl");
	return join(homedir(), ".config", "inboundctl");
}

export function configPath(env = process.env): string {
	return join(configHome(env), "config.json");
}

export function credentialsPath(env = process.env): string {
	return join(configHome(env), "credentials.json");
}

export async function loadConfig(env = process.env): Promise<InboundctlConfig> {
	try {
		const raw = await readFile(configPath(env), "utf8");
		const parsed = JSON.parse(raw) as Partial<InboundctlConfig>;
		return {
			version: 1,
			baseUrl: parsed.baseUrl?.replace(/\/$/, "") || DEFAULT_CONFIG.baseUrl,
			defaultMailbox: parsed.defaultMailbox,
			mailboxes: parsed.mailboxes || {},
		};
	} catch (error) {
		if (isMissingFile(error)) return structuredClone(DEFAULT_CONFIG);
		throw error;
	}
}

export async function saveConfig(
	config: InboundctlConfig,
	env = process.env,
): Promise<void> {
	await writeJson(configPath(env), config);
}

export async function loadCredentials(
	env = process.env,
): Promise<Credentials | null> {
	try {
		const raw = await readFile(credentialsPath(env), "utf8");
		return JSON.parse(raw) as Credentials;
	} catch (error) {
		if (isMissingFile(error)) return null;
		throw error;
	}
}

export async function saveCredentials(
	credentials: Credentials,
	env = process.env,
): Promise<void> {
	await writeJson(credentialsPath(env), credentials);
}

export async function clearCredentials(env = process.env): Promise<void> {
	await rm(credentialsPath(env), { force: true });
}

async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	await chmod(dirname(path), 0o700);
	const temporary = `${path}.${process.pid}.tmp`;
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
	await rename(temporary, path);
	await chmod(path, 0o600);
}

function isMissingFile(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}
