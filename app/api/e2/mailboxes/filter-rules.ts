import { sql } from "drizzle-orm";
import { type Static, t } from "elysia";
import { containsControlCharacters } from "@/app/api/e2/mailboxes/shared";
import {
	ensureFolders,
	folderPathFromParam,
	type MailboxOwnerRef,
} from "@/app/api/e2/mailboxes/state";
import { db } from "@/lib/db";
import type { mailboxFilters } from "@/lib/db/schema";
import { isScopeMailboxPath } from "@/packages/imap-gateway/src/mailbox-rules";

export const MAX_FILTERS_PER_MAILBOX = 100;
export const MAX_FILTER_CONDITIONS = 20;
export const MAX_FILTER_ACTIONS = 20;
export const MAX_FILTER_VALUE_LENGTH = 1024;

export const FILTER_FIELDS = [
	"from",
	"to",
	"cc",
	"recipient",
	"subject",
	"header",
	"body",
	"has_attachment",
	"size",
	"junk",
	"jev",
] as const;
export const FILTER_OPERATORS = [
	"contains",
	"not_contains",
	"equals",
	"not_equals",
	"starts_with",
	"ends_with",
	"domain_is",
	"exists",
	"greater_than",
	"less_than",
	"gte",
] as const;
export const FILTER_ACTIONS = [
	"move_to",
	"mark_read",
	"flag",
	"add_keyword",
	"mark_junk",
	"mark_not_junk",
	"move_to_trash",
	"stop",
] as const;
export const JEV_DIMENSIONS = [
	"spam",
	"phishing",
	"fraud",
	"impersonation",
	"malware",
] as const;

type FilterField = (typeof FILTER_FIELDS)[number];
type FilterOperator = (typeof FILTER_OPERATORS)[number];
type FilterActionType = (typeof FILTER_ACTIONS)[number];

const TEXT_OPERATORS: FilterOperator[] = [
	"contains",
	"not_contains",
	"equals",
	"not_equals",
	"starts_with",
	"ends_with",
];
const ADDRESS_FIELDS: FilterField[] = ["from", "to", "cc", "recipient"];

const OPERATORS_BY_FIELD: Record<FilterField, FilterOperator[]> = {
	from: [...TEXT_OPERATORS, "domain_is"],
	to: [...TEXT_OPERATORS, "domain_is"],
	cc: [...TEXT_OPERATORS, "domain_is", "exists"],
	recipient: [...TEXT_OPERATORS, "domain_is"],
	subject: TEXT_OPERATORS,
	header: [...TEXT_OPERATORS, "exists"],
	body: ["contains", "not_contains"],
	has_attachment: ["equals"],
	size: ["greater_than", "less_than"],
	junk: ["equals"],
	jev: ["gte"],
};

export const FilterConditionSchema = t.Object({
	field: t.Union([
		t.Literal("from"),
		t.Literal("to"),
		t.Literal("cc"),
		t.Literal("recipient"),
		t.Literal("subject"),
		t.Literal("header"),
		t.Literal("body"),
		t.Literal("has_attachment"),
		t.Literal("size"),
		t.Literal("junk"),
		t.Literal("jev"),
	]),
	operator: t.Union([
		t.Literal("contains"),
		t.Literal("not_contains"),
		t.Literal("equals"),
		t.Literal("not_equals"),
		t.Literal("starts_with"),
		t.Literal("ends_with"),
		t.Literal("domain_is"),
		t.Literal("exists"),
		t.Literal("greater_than"),
		t.Literal("less_than"),
		t.Literal("gte"),
	]),
	value: t.Optional(
		t.Union([
			t.String({ maxLength: MAX_FILTER_VALUE_LENGTH }),
			t.Number(),
			t.Boolean(),
		]),
	),
	header: t.Optional(
		t.String({
			maxLength: 255,
			description: "Header name, required when field is `header`",
		}),
	),
	label: t.Optional(
		t.String({
			maxLength: 64,
			description:
				"Jev dimension, required when field is `jev`: spam, phishing, fraud, impersonation or malware",
		}),
	),
});

export const FilterActionSchema = t.Object({
	type: t.Union([
		t.Literal("move_to"),
		t.Literal("mark_read"),
		t.Literal("flag"),
		t.Literal("add_keyword"),
		t.Literal("mark_junk"),
		t.Literal("mark_not_junk"),
		t.Literal("move_to_trash"),
		t.Literal("stop"),
	]),
	value: t.Optional(
		t.String({
			maxLength: MAX_FILTER_VALUE_LENGTH,
			description:
				"Folder path for `move_to`, keyword for `add_keyword`; omitted otherwise",
		}),
	),
});

export const FilterMatchSchema = t.Union([t.Literal("all"), t.Literal("any")], {
	description: "all: every condition must match. any: at least one.",
});

export const FilterSchema = t.Object({
	id: t.String(),
	name: t.String(),
	position: t.Number(),
	enabled: t.Boolean(),
	match: FilterMatchSchema,
	conditions: t.Array(FilterConditionSchema),
	actions: t.Array(FilterActionSchema),
	stopProcessing: t.Boolean(),
	createdAt: t.String({ format: "date-time" }),
	updatedAt: t.String({ format: "date-time" }),
});

export const FilterInputSchema = t.Object({
	name: t.String({ minLength: 1, maxLength: 255 }),
	enabled: t.Optional(t.Boolean({ description: "Default true" })),
	match: t.Optional(FilterMatchSchema),
	conditions: t.Array(FilterConditionSchema, {
		minItems: 1,
		maxItems: MAX_FILTER_CONDITIONS,
	}),
	actions: t.Array(FilterActionSchema, {
		minItems: 1,
		maxItems: MAX_FILTER_ACTIONS,
	}),
	stopProcessing: t.Optional(
		t.Boolean({
			description: "Skip later filters when this one matches. Default false.",
		}),
	),
});

export const FilterUpdateSchema = t.Partial(FilterInputSchema, {
	minProperties: 1,
});

export type MailboxFilterRow = typeof mailboxFilters.$inferSelect;
export type FilterCondition = MailboxFilterRow["conditions"][number];
export type FilterAction = MailboxFilterRow["actions"][number];

export interface FilterDefinition {
	name: string;
	enabled: boolean;
	match: "all" | "any";
	conditions: FilterCondition[];
	actions: FilterAction[];
	stopProcessing: boolean;
}

export interface FilterDefinitionInput {
	name: string;
	enabled?: boolean;
	match?: "all" | "any";
	conditions: FilterCondition[];
	actions: FilterAction[];
	stopProcessing?: boolean;
}

type Checked<T> = { data: T } | { error: string };

const HEADER_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const DOMAIN =
	/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

function checkCondition(
	condition: FilterCondition,
	index: number,
): Checked<FilterCondition> {
	const where = `conditions[${index}]`;
	const field = condition.field as FilterField;
	const operator = condition.operator as FilterOperator;
	if (!FILTER_FIELDS.includes(field)) {
		return { error: `${where}: unknown field` };
	}
	if (!OPERATORS_BY_FIELD[field].includes(operator)) {
		return {
			error: `${where}: operator ${operator} can't be used with ${field}`,
		};
	}
	if (field !== "header" && condition.header !== undefined) {
		return { error: `${where}: header is only used with the header field` };
	}
	if (field !== "jev" && condition.label !== undefined) {
		return { error: `${where}: label is only used with the jev field` };
	}
	const value = condition.value;

	let header: string | undefined;
	if (field === "header") {
		header = condition.header?.trim().toLowerCase();
		if (!header || !HEADER_TOKEN.test(header)) {
			return { error: `${where}: a valid header name is required` };
		}
	}

	if (operator === "exists") {
		if (value !== undefined && typeof value !== "boolean") {
			return {
				error: `${where}: exists takes an optional true (present) or false (missing)`,
			};
		}
		const data: FilterCondition = { field, operator };
		if (header) data.header = header;
		if (value !== undefined) data.value = value;
		return { data };
	}

	if (field === "has_attachment" || field === "junk") {
		if (typeof value !== "boolean") {
			return { error: `${where}: value must be true or false` };
		}
		return { data: { field, operator, value } };
	}

	if (field === "size") {
		if (
			typeof value !== "number" ||
			!Number.isSafeInteger(value) ||
			value < 0
		) {
			return { error: `${where}: value must be a size in bytes` };
		}
		return { data: { field, operator, value } };
	}

	if (field === "jev") {
		const label = condition.label?.trim().toLowerCase();
		if (!label || !JEV_DIMENSIONS.some((dimension) => dimension === label)) {
			return {
				error: `${where}: label must be one of ${JEV_DIMENSIONS.join(", ")}`,
			};
		}
		if (
			typeof value !== "number" ||
			!Number.isInteger(value) ||
			value < 0 ||
			value > 4
		) {
			return { error: `${where}: value must be a level from 0 to 4` };
		}
		return { data: { field, operator, label, value } };
	}

	if (typeof value !== "string" || value.length === 0) {
		return { error: `${where}: value must be a non-empty string` };
	}
	if (value.length > MAX_FILTER_VALUE_LENGTH) {
		return {
			error: `${where}: value must be at most ${MAX_FILTER_VALUE_LENGTH} characters`,
		};
	}
	if (containsControlCharacters(value)) {
		return { error: `${where}: value must not contain control characters` };
	}
	if (operator === "domain_is") {
		const domain = value.trim().toLowerCase().replace(/^@/, "");
		if (
			!ADDRESS_FIELDS.includes(field) ||
			domain.length > 253 ||
			!DOMAIN.test(domain)
		) {
			return { error: `${where}: value must be a domain` };
		}
		return { data: { field, operator, value: domain } };
	}
	const data: FilterCondition = { field, operator, value };
	if (header) data.header = header;
	return { data };
}

function checkAction(
	action: FilterAction,
	index: number,
): Checked<FilterAction> {
	const where = `actions[${index}]`;
	const type = action.type as FilterActionType;
	if (!FILTER_ACTIONS.includes(type)) {
		return { error: `${where}: unknown action` };
	}
	if (type === "move_to") {
		const path = action.value ? folderPathFromParam(action.value) : null;
		if (!path) return { error: `${where}: value must be a folder path` };
		if (isScopeMailboxPath(path)) {
			return { error: `${where}: filters can't move mail into scope folders` };
		}
		return { data: { type, value: path } };
	}
	if (type === "add_keyword") {
		const keyword = action.value;
		if (!keyword || keyword.length > 255 || keyword.startsWith("\\")) {
			return {
				error: `${where}: value must be a keyword (system flags like \\Seen are set with their own actions)`,
			};
		}
		return { data: { type, value: keyword } };
	}
	if (action.value !== undefined) {
		return { error: `${where}: ${type} takes no value` };
	}
	return { data: { type } };
}

/** Pure validation of a complete filter definition. */
export function checkFilterDefinition(
	input: FilterDefinitionInput,
): Checked<FilterDefinition> {
	const name = input.name.trim();
	if (!name) return { error: "Name is required" };
	if (containsControlCharacters(input.name)) {
		return { error: "Name must not contain control characters" };
	}
	if (
		input.conditions.length === 0 ||
		input.conditions.length > MAX_FILTER_CONDITIONS
	) {
		return {
			error: `A filter needs 1 to ${MAX_FILTER_CONDITIONS} conditions`,
		};
	}
	if (input.actions.length === 0 || input.actions.length > MAX_FILTER_ACTIONS) {
		return { error: `A filter needs 1 to ${MAX_FILTER_ACTIONS} actions` };
	}
	const conditions: FilterCondition[] = [];
	for (const [index, condition] of input.conditions.entries()) {
		const checked = checkCondition(condition, index);
		if ("error" in checked) return checked;
		conditions.push(checked.data);
	}
	const actions: FilterAction[] = [];
	for (const [index, action] of input.actions.entries()) {
		const checked = checkAction(action, index);
		if ("error" in checked) return checked;
		actions.push(checked.data);
	}
	const types = actions.map((action) => action.type);
	if (
		types.filter((type) => type === "move_to" || type === "move_to_trash")
			.length > 1
	) {
		return { error: "A filter can move mail to only one folder" };
	}
	if (types.includes("mark_junk") && types.includes("mark_not_junk")) {
		return { error: "A filter can't both mark and unmark junk" };
	}
	return {
		data: {
			name,
			enabled: input.enabled ?? true,
			match: input.match === "any" ? "any" : "all",
			conditions,
			actions,
			stopProcessing: input.stopProcessing ?? false,
		},
	};
}

/**
 * Validates a filter's targets against the mailbox: move_to folders must
 * exist, and keywords are normalized the way IMAP stores them.
 */
export async function resolveFilterTargets(
	owner: MailboxOwnerRef,
	definition: FilterDefinition,
): Promise<Checked<FilterDefinition>> {
	const actions = [...definition.actions];
	const moves = actions.filter((action) => action.type === "move_to");
	if (moves.length > 0) {
		const folders = await ensureFolders(owner);
		const paths = new Set(folders.map((folder) => folder.path));
		const missing = moves.find((action) => !paths.has(action.value as string));
		if (missing) {
			return { error: `Folder ${missing.value} does not exist` };
		}
	}
	const keywordIndexes = actions
		.map((action, index) => (action.type === "add_keyword" ? index : -1))
		.filter((index) => index >= 0);
	for (const index of keywordIndexes) {
		const keyword = actions[index].value as string;
		let normalized: string[];
		try {
			const result = await db.execute(
				sql`SELECT imap_normalize_flags(ARRAY[${keyword}::text]::text[]) AS flags`,
			);
			const flags = result.rows[0]?.flags;
			normalized = Array.isArray(flags) ? flags.map(String) : [];
		} catch {
			return { error: `Invalid keyword ${JSON.stringify(keyword)}` };
		}
		const [flag] = normalized;
		if (normalized.length !== 1 || !flag || flag.startsWith("\\")) {
			return { error: `Invalid keyword ${JSON.stringify(keyword)}` };
		}
		actions[index] = { type: "add_keyword", value: flag };
	}
	return { data: { ...definition, actions } };
}

export function serializeFilter(row: MailboxFilterRow) {
	return {
		id: row.id,
		name: row.name,
		position: row.position,
		enabled: row.enabled,
		match: row.match,
		conditions: row.conditions as Static<typeof FilterConditionSchema>[],
		actions: row.actions as Static<typeof FilterActionSchema>[],
		stopProcessing: row.stopProcessing,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}
