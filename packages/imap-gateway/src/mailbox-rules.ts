export const DEFAULT_FOLDERS = [
	"INBOX",
	"Sent",
	"Drafts",
	"Trash",
	"Junk",
	"Archive",
] as const;

export const SPECIAL_USE: Record<string, string> = {
	Sent: "\\Sent",
	Drafts: "\\Drafts",
	Trash: "\\Trash",
	Junk: "\\Junk",
	Archive: "\\Archive",
};

export type FlagAction = "set" | "add" | "remove";

const SYSTEM_FLAGS = [
	"\\Seen",
	"\\Answered",
	"\\Flagged",
	"\\Deleted",
	"\\Draft",
];

export function normalizeFlags(flags: readonly string[]): string[] {
	const result = new Map<string, string>();
	for (const flag of flags) {
		const lower = flag.toLowerCase();
		if (lower === "\\recent") continue;
		const system = SYSTEM_FLAGS.find((value) => value.toLowerCase() === lower);
		if (!system && (!flag || /[\x00-\x20\x7f(){}%*"\\\]]/.test(flag))) {
			throw new Error("Invalid message flag");
		}
		if (!result.has(lower)) result.set(lower, system ?? flag);
	}
	return [...result.values()];
}

export function normalizeMailboxPath(path: string): string {
	if (
		!path ||
		path.length > 255 ||
		/[\x00-\x1f\x7f]/.test(path) ||
		path.split("/").some((part) => !part || part === "." || part === "..")
	) {
		throw new Error("Invalid mailbox path");
	}
	return path.toUpperCase() === "INBOX" ? "INBOX" : path;
}

export function isScopeMailboxPath(path: string): boolean {
	return path === "Scopes" || path.startsWith("Scopes/");
}

export function isProtectedMailboxPath(path: string): boolean {
	return (
		DEFAULT_FOLDERS.some((folder) => folder === path) ||
		isScopeMailboxPath(path)
	);
}

export function scopeMailboxPath(scope: {
	type: string;
	domain: string;
	address: string | null;
}): string {
	return `Scopes/${scope.type === "domain" ? `*@${scope.domain}` : scope.address}`;
}
