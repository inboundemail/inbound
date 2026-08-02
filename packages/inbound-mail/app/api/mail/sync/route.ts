import { NextRequest, NextResponse } from "next/server";
import {
	inboundApiFetch,
	inboundSessionFromRequest,
} from "@/lib/inbound-api";
import { readMailboxConfiguration } from "@/lib/mailbox-config-store";

interface UpstreamThread {
	id: string;
	normalized_subject?: string | null;
	participant_emails: string[];
	participant_names: string[];
	message_count: number;
	last_message_at: string;
	has_unread: boolean;
	is_archived: boolean;
	latest_message?: {
		from_text: string;
		text_preview?: string | null;
		is_read: boolean;
		has_attachments: boolean;
		date?: string | null;
	} | null;
}

interface UpstreamListResponse {
	threads: UpstreamThread[];
}

export async function GET(request: NextRequest) {
	const session = await inboundSessionFromRequest(request);
	if (!session) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}

	let configuration;
	try {
		configuration = await readMailboxConfiguration(session);
	} catch {
		return NextResponse.json(
			{ error: "Mailbox configuration is temporarily unavailable" },
			{ status: 503 },
		);
	}
	if (!configuration.onboarded) {
		return NextResponse.json({ error: "Mailbox setup is required" }, { status: 409 });
	}
	const filters: Array<{ type: "address" | "domain"; value: string }> = [];
	for (const mailbox of configuration.mailboxes) {
		if (!mailbox.enabled) continue;
		if (mailbox.selectionMode === "selected") {
			filters.push(...mailbox.addresses.map((address) => ({ type: "address" as const, value: address })));
		} else {
			filters.push({ type: "domain", value: mailbox.domainId });
		}
	}
	if (filters.length === 0) {
		return NextResponse.json({ threads: [], syncedAt: new Date().toISOString() });
	}

	const responses = await Promise.all(
		filters.map((filter) => {
			const params = new URLSearchParams({ limit: "100" });
			params.set(filter.type, filter.value);
			return inboundApiFetch(request, `/api/e2/mail/threads?${params}`, undefined, session);
		}),
	);

	if (responses.some((response) => !response)) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}
	const failed = responses.find((response) => response && !response.ok);
	if (failed) {
		return NextResponse.json(
			{
				error: "Inbound sync is not available yet",
				upstreamStatus: failed.status,
			},
			{ status: failed.status },
		);
	}

	const payloads = await Promise.all(
		responses.map((response) => response?.json() as Promise<UpstreamListResponse>),
	);
	const unique = new Map<string, UpstreamThread>();
	for (const payload of payloads) {
		for (const thread of payload.threads) unique.set(thread.id, thread);
	}

	return NextResponse.json({
		threads: [...unique.values()].sort(
			(a, b) =>
				new Date(b.last_message_at).getTime() -
				new Date(a.last_message_at).getTime(),
		),
		syncedAt: new Date().toISOString(),
	});
}
