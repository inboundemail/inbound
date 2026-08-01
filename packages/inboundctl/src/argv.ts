export type ParsedArgv = {
	positionals: string[];
	options: Record<string, string | string[] | boolean>;
};

const SHORT_OPTIONS: Record<string, string> = {
	d: "debug",
	h: "help",
	j: "json",
	m: "mailbox",
};

function addOption(
	options: ParsedArgv["options"],
	key: string,
	value: string | boolean,
) {
	const current = options[key];
	if (current === undefined) {
		options[key] = value;
	} else if (Array.isArray(current)) {
		current.push(String(value));
	} else {
		options[key] = [String(current), String(value)];
	}
}

export function parseArgv(argv: string[]): ParsedArgv {
	const parsed: ParsedArgv = { positionals: [], options: {} };

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === "--") {
			parsed.positionals.push(...argv.slice(index + 1));
			break;
		}

		if (token.startsWith("--")) {
			const option = token.slice(2);
			const separator = option.indexOf("=");
			if (separator !== -1) {
				addOption(
					parsed.options,
					option.slice(0, separator),
					option.slice(separator + 1),
				);
				continue;
			}

			const next = argv[index + 1];
			if (next !== undefined && !next.startsWith("-")) {
				addOption(parsed.options, option, next);
				index += 1;
			} else {
				addOption(parsed.options, option, true);
			}
			continue;
		}

		if (token.startsWith("-") && token.length === 2) {
			const short = token.slice(1);
			const option = SHORT_OPTIONS[short] || short;
			const next = argv[index + 1];
			if (option === "mailbox" && next !== undefined && !next.startsWith("-")) {
				addOption(parsed.options, option, next);
				index += 1;
			} else {
				addOption(parsed.options, option, true);
			}
			continue;
		}

		parsed.positionals.push(token);
	}

	return parsed;
}

export function optionString(
	parsed: ParsedArgv,
	...names: string[]
): string | undefined {
	for (const name of names) {
		const value = parsed.options[name];
		if (Array.isArray(value)) return value.at(-1);
		if (typeof value === "string") return value;
	}
	return undefined;
}

export function optionStrings(
	parsed: ParsedArgv,
	...names: string[]
): string[] {
	for (const name of names) {
		const value = parsed.options[name];
		if (Array.isArray(value)) return value;
		if (typeof value === "string") return [value];
	}
	return [];
}

export function optionBoolean(parsed: ParsedArgv, ...names: string[]): boolean {
	for (const name of names) {
		const value = parsed.options[name];
		if (value === true) return true;
		const last = Array.isArray(value) ? value.at(-1) : value;
		if (typeof last === "string") {
			return ["1", "true", "yes", "on"].includes(last.toLowerCase());
		}
	}
	return false;
}
