import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	getEmail,
	getThread,
	listInbox,
	listThreads,
	replyToEmail,
	revokeApiKey,
	sendEmail,
	updateEmail,
} from "./api";
import { optionBoolean, optionString, parseArgv } from "./argv";
import { loginWithDeviceFlow, openBrowser } from "./auth";
import {
	clearCredentials,
	configHome,
	loadConfig,
	loadCredentials,
	saveConfig,
	saveCredentials,
} from "./config";
import { HttpError, requestJson } from "./http";
import { createMailbox, resolveMailbox } from "./mailbox";
import {
	createDraft,
	type Message,
	messageFromArgs,
	readDraft,
} from "./message";
import { printResult } from "./output";
import { validateMessage } from "./validate";

export class CliError extends Error {
	constructor(
		message: string,
		readonly exitCode = 2,
	) {
		super(message);
	}
}

export async function runCli(argv: string[]): Promise<void> {
	const parsed = parseArgv(argv);
	const asJson = optionBoolean(parsed, "json");
	if (optionBoolean(parsed, "help") || parsed.positionals[0] === "help") {
		printHelp();
		return;
	}

	const config = await loadConfig();
	const credentials = await loadCredentials();
	const baseUrl = (
		optionString(parsed, "base-url") ||
		process.env.INBOUND_BASE_URL ||
		config.baseUrl
	).replace(/\/$/, "");
	const [group, action, third, ...rest] = parsed.positionals;

	if (
		group === "login" ||
		group === "init" ||
		(group === "auth" && action === "login")
	) {
		if (credentials && !optionBoolean(parsed, "force")) {
			throw new CliError(
				"This device is already authenticated. Use 'inboundctl auth status' or pass --force to create a replacement key.",
			);
		}
		const next = await loginWithDeviceFlow({
			baseUrl,
			events: {
				onCode(code) {
					console.error(`Open ${code.verification_uri}`);
					console.error(`Enter code: ${code.user_code}`);
					if (!optionBoolean(parsed, "no-browser")) {
						openBrowser(code.verification_uri);
					}
					console.error("Waiting for approval...");
				},
			},
		});
		config.baseUrl = baseUrl;
		await Promise.all([saveCredentials(next), saveConfig(config)]);
		printResult(
			{
				message: "Authenticated with Inbound.",
				user: next.user || null,
				configHome: configHome(),
			},
			asJson,
		);
		return;
	}

	if (group === "auth") {
		if (action === "status") {
			const apiKey = requireApiKey(parsed, credentials?.apiKey);
			await requestJson({
				baseUrl,
				path: "/api/e2/domains",
				token: apiKey,
				query: { limit: 1 },
			});
			printResult(
				{
					authenticated: true,
					baseUrl,
					user: credentials?.user || null,
					source: credentialSource(parsed, credentials?.apiKey),
				},
				asJson,
			);
			return;
		}
		if (action === "logout") {
			if (credentials?.apiKey) {
				await revokeApiKey(baseUrl, credentials.apiKey);
			}
			await clearCredentials();
			printResult(
				{
					message: credentials?.apiKey
						? "Revoked the CLI API key and removed local credentials."
						: "No saved device credentials were found.",
				},
				asJson,
			);
			return;
		}
		throw new CliError("Use 'inboundctl auth status|login|logout'.");
	}

	if (group === "mailbox") {
		if (action === "add") {
			const name = required(third, "mailbox name");
			if (config.mailboxes[name] && !optionBoolean(parsed, "force")) {
				throw new CliError(
					`Mailbox '${name}' already exists. Use --force to replace it.`,
				);
			}
			config.mailboxes[name] = createMailbox(
				optionString(parsed, "from"),
				rest,
			);
			config.defaultMailbox ||= name;
			await saveConfig(config);
			printResult(
				{
					message: `Added mailbox '${name}'.`,
					mailbox: config.mailboxes[name],
				},
				asJson,
			);
			return;
		}
		if (action === "list") {
			printResult(
				{
					mailboxes: Object.entries(config.mailboxes).map(
						([name, mailbox]) => ({
							name,
							...mailbox,
							default: config.defaultMailbox === name,
						}),
					),
				},
				asJson,
			);
			return;
		}
		if (action === "show") {
			const name = third || config.defaultMailbox;
			if (!name || !config.mailboxes[name])
				throw new CliError("Mailbox not found.", 4);
			printResult(
				{
					name,
					...config.mailboxes[name],
					default: config.defaultMailbox === name,
				},
				asJson,
			);
			return;
		}
		if (action === "use") {
			const name = required(third, "mailbox name");
			if (!config.mailboxes[name])
				throw new CliError(`Unknown mailbox '${name}'.`, 4);
			config.defaultMailbox = name;
			await saveConfig(config);
			printResult({ message: `Default mailbox set to '${name}'.` }, asJson);
			return;
		}
		if (action === "remove") {
			const name = required(third, "mailbox name");
			if (!config.mailboxes[name])
				throw new CliError(`Unknown mailbox '${name}'.`, 4);
			delete config.mailboxes[name];
			if (config.defaultMailbox === name)
				config.defaultMailbox = Object.keys(config.mailboxes)[0];
			await saveConfig(config);
			printResult({ message: `Removed mailbox '${name}'.` }, asJson);
			return;
		}
		throw new CliError("Use 'inboundctl mailbox add|list|show|use|remove'.");
	}

	if (group === "skill") {
		const source = skillPath();
		if (action === "path") {
			printResult(source, asJson);
			return;
		}
		if (action === "install") {
			const target = optionString(parsed, "target") || third;
			if (!target)
				throw new CliError(
					"skill install requires --target <skills-directory>.",
				);
			const destination = resolve(target, "inboundctl", "SKILL.md");
			if (existsSync(destination) && !optionBoolean(parsed, "force")) {
				throw new CliError(
					`Skill already exists at ${destination}. Use --force to replace it.`,
				);
			}
			await mkdir(dirname(destination), { recursive: true });
			await copyFile(source, destination);
			printResult(
				{ message: `Installed skill at ${destination}.`, path: destination },
				asJson,
			);
			return;
		}
		throw new CliError("Use 'inboundctl skill path|install'.");
	}

	if (group === "draft") {
		if (action === "create") {
			const path = third || "message.inbound";
			const selected = optionalMailbox(config, optionString(parsed, "mailbox"));
			await createDraft(path, selected?.from);
			printResult({ message: `Created ${path}.`, path }, asJson);
			return;
		}
		if (action === "validate") {
			const path = required(third, "draft path");
			const message = await readDraft(path);
			applyMailboxSender(
				message,
				optionalMailbox(config, optionString(parsed, "mailbox"))?.from,
			);
			const validation = validateMessage(message);
			printResult(validation, asJson);
			if (!validation.valid) throw new CliError("Message validation failed.");
			return;
		}
		throw new CliError("Use 'inboundctl draft create|validate'.");
	}

	if (group === "validate") {
		const message = await messageFromArgs(parsed, action);
		applyMailboxSender(
			message,
			optionalMailbox(config, optionString(parsed, "mailbox"))?.from,
		);
		const validation = validateMessage(message);
		printResult(validation, asJson);
		if (!validation.valid) throw new CliError("Message validation failed.");
		return;
	}

	if (group === "send" || group === "reply") {
		const isReply = group === "reply";
		const target = isReply ? required(action, "email or thread ID") : undefined;
		const draftPath = isReply ? third : action;
		const message = await messageFromArgs(parsed, draftPath);
		applyMailboxSender(
			message,
			optionalMailbox(config, optionString(parsed, "mailbox"))?.from,
		);
		const validation = validateMessage(message, { reply: isReply });
		if (
			!validation.valid ||
			(optionBoolean(parsed, "strict") && validation.warnings.length > 0)
		) {
			if (asJson) printResult({ ...validation, message }, true);
			else printResult(validation, false);
			throw new CliError("Message validation failed.");
		}
		if (optionBoolean(parsed, "dry-run")) {
			printResult(
				{ valid: true, errors: [], warnings: validation.warnings, message },
				asJson,
			);
			return;
		}
		const apiKey = requireApiKey(parsed, credentials?.apiKey);
		const result = isReply
			? await replyToEmail(baseUrl, apiKey, target as string, message)
			: await sendEmail(baseUrl, apiKey, message);
		printResult(result, asJson);
		return;
	}

	const apiKey = requireApiKey(parsed, credentials?.apiKey);
	const selectedMailbox = optionString(parsed, "mailbox");

	if (!group || group === "inbox") {
		if (group === "inbox" && action && action !== "list")
			throw new CliError("Use 'inboundctl inbox list'.");
		if (optionBoolean(parsed, "read") && optionBoolean(parsed, "unread")) {
			throw new CliError("--read and --unread cannot be used together.");
		}
		const status = optionBoolean(parsed, "unread")
			? "unread"
			: optionBoolean(parsed, "read")
				? "read"
				: optionString(parsed, "status");
		const scope = resolveMailbox(config, selectedMailbox);
		const result = await listInbox({
			baseUrl,
			apiKey,
			scope,
			options: {
				status,
				search: optionString(parsed, "search"),
				timeRange: optionString(parsed, "since", "time-range"),
				limit: positiveInteger(optionString(parsed, "limit"), 25),
			},
		});
		printResult(result, asJson);
		return;
	}

	if (group === "email") {
		if (action === "get") {
			printResult(
				await getEmail(baseUrl, apiKey, required(third, "email ID")),
				asJson,
			);
			return;
		}
		if (action === "mark") {
			const body: { is_read?: boolean; is_archived?: boolean } = {};
			if (optionBoolean(parsed, "read")) body.is_read = true;
			if (optionBoolean(parsed, "unread")) body.is_read = false;
			if (optionBoolean(parsed, "archived")) body.is_archived = true;
			if (optionBoolean(parsed, "unarchived")) body.is_archived = false;
			if (Object.keys(body).length === 0)
				throw new CliError(
					"email mark requires --read, --unread, --archived, or --unarchived.",
				);
			printResult(
				await updateEmail(baseUrl, apiKey, required(third, "email ID"), body),
				asJson,
			);
			return;
		}
		throw new CliError("Use 'inboundctl email get|mark'.");
	}

	if (group === "thread") {
		if (action === "list") {
			printResult(
				await listThreads({
					baseUrl,
					apiKey,
					scope: resolveMailbox(config, selectedMailbox),
					limit: positiveInteger(optionString(parsed, "limit"), 25),
					unread: optionBoolean(parsed, "unread"),
				}),
				asJson,
			);
			return;
		}
		if (action === "get") {
			printResult(
				await getThread(baseUrl, apiKey, required(third, "thread ID")),
				asJson,
			);
			return;
		}
		throw new CliError("Use 'inboundctl thread list|get'.");
	}

	throw new CliError(`Unknown command '${group}'. Run 'inboundctl help'.`);
}

export function exitCodeFor(error: unknown): number {
	if (error instanceof CliError) return error.exitCode;
	if (error instanceof HttpError) {
		if (error.status === 401 || error.status === 403) return 3;
		if (error.status === 404) return 4;
	}
	return 1;
}

function requireApiKey(
	parsed: ReturnType<typeof parseArgv>,
	saved?: string,
): string {
	const key =
		optionString(parsed, "api-key") || process.env.INBOUND_API_KEY || saved;
	if (!key)
		throw new CliError(
			"Not authenticated. Run 'inboundctl login' or set INBOUND_API_KEY.",
			3,
		);
	return key;
}

function credentialSource(
	parsed: ReturnType<typeof parseArgv>,
	saved?: string,
): string {
	if (optionString(parsed, "api-key")) return "flag";
	if (process.env.INBOUND_API_KEY) return "environment";
	return saved ? "device" : "none";
}

function required(value: string | undefined, label: string): string {
	if (!value) throw new CliError(`Missing ${label}.`);
	return value;
}

function positiveInteger(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
		throw new CliError("Limit must be an integer between 1 and 100.");
	}
	return parsed;
}

function optionalMailbox(
	config: Awaited<ReturnType<typeof loadConfig>>,
	selected?: string,
) {
	if (!selected && !config.defaultMailbox) return null;
	return resolveMailbox(config, selected);
}

function applyMailboxSender(message: Message, sender?: string): void {
	message.from ||= sender;
}

function skillPath(): string {
	const moduleDirectory = dirname(fileURLToPath(import.meta.url));
	const path = join(moduleDirectory, "..", "skills", "inboundctl", "SKILL.md");
	if (!existsSync(path))
		throw new CliError("Bundled inboundctl skill was not found.", 1);
	return path;
}

function printHelp(): void {
	console.log(`inboundctl - agent-first Inbound email CLI

Usage:
  inboundctl login [--no-browser]
  inboundctl auth status|logout
  inboundctl mailbox add <name> [--from address] <selector...>
  inboundctl mailbox list|show|use|remove
  inboundctl [-m mailbox] [--unread|--read] [--search text]
  inboundctl email get|mark <email-id>
  inboundctl thread list|get
  inboundctl draft create|validate [path]
  inboundctl validate [draft] [message flags]
  inboundctl send [draft] [message flags] [--dry-run]
  inboundctl reply <email-or-thread-id> [draft] [message flags]
  inboundctl skill path|install --target <skills-directory>

Global flags:
  -m, --mailbox <name>  Select a mailbox
  -j, --json            Print machine-readable JSON
  --base-url <url>      Override the Inbound API URL
  --api-key <key>       Override saved authentication`);
}
