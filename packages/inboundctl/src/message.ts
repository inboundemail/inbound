import { readFile, writeFile } from "node:fs/promises";
import type { ParsedArgv } from "./argv";
import { optionBoolean, optionString, optionStrings } from "./argv";

export type Message = {
	from?: string;
	to?: string[];
	cc?: string[];
	bcc?: string[];
	reply_to?: string[];
	subject?: string;
	text?: string;
	html?: string;
	reply_all?: boolean;
};

const MULTI_HEADERS = new Set(["to", "cc", "bcc", "reply-to"]);

export async function messageFromArgs(
	parsed: ParsedArgv,
	draftPath?: string,
): Promise<Message> {
	const draft = draftPath ? await readDraft(draftPath) : {};
	return compact({
		...draft,
		from: optionString(parsed, "from") || draft.from,
		to: addressOptions(parsed, "to") || draft.to,
		cc: addressOptions(parsed, "cc") || draft.cc,
		bcc: addressOptions(parsed, "bcc") || draft.bcc,
		reply_to: addressOptions(parsed, "reply-to", "reply_to") || draft.reply_to,
		subject: optionString(parsed, "subject") || draft.subject,
		text: (await bodyOption(parsed, "text", "text-file")) ?? draft.text,
		html: (await bodyOption(parsed, "html", "html-file")) ?? draft.html,
		reply_all: optionBoolean(parsed, "all", "reply-all") || draft.reply_all,
	});
}

export async function readDraft(path: string): Promise<Message> {
	const raw = await readFile(path, "utf8");
	const lines = raw.split(/\r?\n/);
	const headers: Record<string, string> = {};
	let bodyIndex = lines.length;
	for (let index = 0; index < lines.length; index += 1) {
		if (!lines[index].trim()) {
			bodyIndex = index + 1;
			break;
		}
		const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(lines[index]);
		if (!match) throw new Error(`Invalid draft header at line ${index + 1}`);
		const name = match[1].toLowerCase().replaceAll("_", "-");
		const value = match[2].trim();
		if (!value) continue;
		headers[name] =
			MULTI_HEADERS.has(name) && headers[name]
				? `${headers[name]},${value}`
				: value;
	}
	const body = lines.slice(bodyIndex).join("\n").trim();
	const isHtml = headers["content-type"]?.toLowerCase().includes("html");
	return compact({
		from: headers.from,
		to: splitAddresses(headers.to),
		cc: splitAddresses(headers.cc),
		bcc: splitAddresses(headers.bcc),
		reply_to: splitAddresses(headers["reply-to"]),
		subject: headers.subject,
		text: !isHtml && body ? body : undefined,
		html: isHtml && body ? body : undefined,
	});
}

export async function createDraft(path: string, from?: string): Promise<void> {
	await writeFile(
		path,
		[
			`From: ${from || "sender@example.com"}`,
			"To: recipient@example.com",
			"Subject: Subject",
			"Content-Type: text/plain",
			"",
			"Write your message here.",
		].join("\n"),
		{ encoding: "utf8", flag: "wx" },
	);
}

function addressOptions(
	parsed: ParsedArgv,
	...names: string[]
): string[] | undefined {
	const values = optionStrings(parsed, ...names).flatMap(
		(value) => splitAddresses(value) || [],
	);
	return values.length > 0 ? values : undefined;
}

async function bodyOption(
	parsed: ParsedArgv,
	inlineName: string,
	fileName: string,
): Promise<string | undefined> {
	const inline = optionString(parsed, inlineName);
	if (inline !== undefined) return inline;
	const path = optionString(parsed, fileName);
	if (!path) return undefined;
	if (path === "-") {
		const chunks: Buffer[] = [];
		for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
		return Buffer.concat(chunks).toString("utf8");
	}
	return readFile(path, "utf8");
}

function splitAddresses(value?: string): string[] | undefined {
	if (!value) return undefined;
	const values = value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
	return values.length > 0 ? values : undefined;
}

function compact<T extends Record<string, unknown>>(value: T): T {
	return Object.fromEntries(
		Object.entries(value).filter(([, item]) => item !== undefined),
	) as T;
}
