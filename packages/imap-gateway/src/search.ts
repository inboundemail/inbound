import type postgres from "postgres";

export interface SearchNode {
	key: string;
	value?: unknown;
	exists?: boolean;
	header?: string;
	operator?: string;
}

type Sql = postgres.Sql;
type Fragment = postgres.PendingQuery<postgres.Row[]>;

const MONTHS: Record<string, number> = {
	jan: 0,
	feb: 1,
	mar: 2,
	apr: 3,
	may: 4,
	jun: 5,
	jul: 6,
	aug: 7,
	sep: 8,
	oct: 9,
	nov: 10,
	dec: 11,
};

function parseImapDate(value: string): Date | null {
	const match = value.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
	if (!match) {
		const fallback = new Date(value);
		return Number.isNaN(fallback.getTime()) ? null : fallback;
	}
	const month = MONTHS[match[2]?.toLowerCase() ?? ""];
	if (month === undefined) return null;
	return new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
}

function likePattern(value: string): string {
	return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function headerPattern(header: string, value: string): string {
	const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
	return `(^|\n)${escape(header)}:[^\n]*${escape(value)}`;
}

function nextDay(date: Date): Date {
	return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

const HEADER_COLUMNS: Record<string, string> = {
	from: "from_data",
	to: "to_data",
	cc: "cc_data",
	bcc: "bcc_data",
	subject: "subject",
	"message-id": "message_id",
};

export function buildCondition(sql: Sql, node: SearchNode): Fragment {
	switch (node.key) {
		case "all":
			return sql`TRUE`;

		case "uid": {
			const uids = Array.isArray(node.value)
				? (node.value as number[])
				: [Number(node.value)];
			return sql`mm.uid = ANY(${uids})`;
		}

		case "flag": {
			const flag = String(node.value);
			return node.exists
				? sql`mm.flags::jsonb ? ${flag}`
				: sql`NOT (mm.flags::jsonb ? ${flag})`;
		}

		case "internaldate":
		case "date": {
			const column =
				node.key === "internaldate" ? sql`mm.internal_date` : sql`se.date`;
			if (node.value instanceof Date) {
				return node.operator === "<="
					? sql`coalesce(${column} <= ${node.value}, FALSE)`
					: sql`coalesce(${column} >= ${node.value}, FALSE)`;
			}
			const date = parseImapDate(String(node.value));
			if (!date) return sql`FALSE`;
			switch (node.operator) {
				case "<":
					return sql`coalesce(${column} < ${date}, FALSE)`;
				case "<=":
					return sql`coalesce(${column} < ${nextDay(date)}, FALSE)`;
				case ">=":
					return sql`coalesce(${column} >= ${date}, FALSE)`;
				case "=":
					return sql`coalesce(${column} >= ${date} AND ${column} < ${nextDay(date)}, FALSE)`;
				default:
					return sql`FALSE`;
			}
		}

		case "size": {
			const size = Number(node.value) || 0;
			return node.operator === "<"
				? sql`coalesce(mm.size < ${size}, FALSE)`
				: sql`coalesce(mm.size > ${size}, FALSE)`;
		}

		case "header": {
			const header = node.header ?? "";
			const value = String(node.value ?? "");
			const pattern = headerPattern(header, value);
			const column = HEADER_COLUMNS[header];
			if (!column || !value) {
				return sql`coalesce(coalesce(se.raw_content, am.raw_content) ~* ${pattern}, FALSE)`;
			}
			return sql`coalesce(se.${sql(column)} ILIKE ${likePattern(value)}, am.raw_content ~* ${pattern}, FALSE)`;
		}

		case "text":
		case "body": {
			const value = likePattern(String(node.value ?? ""));
			const decoded =
				node.key === "text"
					? sql`(se.subject ILIKE ${value} OR se.text_body ILIKE ${value})`
					: sql`se.text_body ILIKE ${value}`;
			return sql`coalesce(${decoded}, am.raw_content ILIKE ${value}, FALSE)`;
		}

		case "or": {
			const children = ([] as SearchNode[]).concat(
				(node.value as SearchNode[]) ?? [],
			);
			if (children.length === 0) return sql`TRUE`;
			return children
				.map((child) => buildCondition(sql, child))
				.reduce((acc, cond) => sql`(${acc} OR ${cond})`);
		}

		case "not":
			return sql`NOT (${buildCondition(sql, node.value as SearchNode)})`;

		default:
			console.log(`[imap-search] unsupported term ${node.key}, ignoring`);
			return sql`TRUE`;
	}
}

export function buildSearchWhere(sql: Sql, query: SearchNode[]): Fragment {
	if (!query || query.length === 0) return sql`TRUE`;
	return query
		.map((node) => buildCondition(sql, node))
		.reduce((acc, cond) => sql`(${acc} AND ${cond})`);
}
