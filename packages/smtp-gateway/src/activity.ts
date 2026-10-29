import { logEvent } from "./log.ts";

export type ActivityEventName =
	| "session_ended"
	| "command_error"
	| "quota_exceeded"
	| "send_failed";

/** One mailbox activity event for POST /mailboxes/activity/ingest. No message content or addresses. */
export interface ActivityEvent {
	credentialId: string;
	userId?: string;
	protocol: "imap" | "smtp";
	event: ActivityEventName;
	reason?: string;
	clientIp?: string;
	client?: string;
	session?: string;
	count?: number;
	occurredAt?: string;
	detail?: Record<string, string | number | boolean>;
}

export interface ActivityReporterOptions {
	apiBaseUrl: string;
	gatewayAuthSecret: string | null;
	timeoutMs: number;
	maxQueue?: number;
	batchSize?: number;
	flushIntervalMs?: number;
	fetch?: (url: string, init: RequestInit) => Promise<Response>;
}

interface Queued {
	event: ActivityEvent;
	key: string | null;
}

/**
 * Buffers activity events in a small bounded queue and posts them to the API
 * in batches (every 5 s or 100 events). The oldest events are dropped when the
 * queue is full, and an ingest failure is logged and dropped: reporting never
 * blocks or fails a session or command.
 */
export class ActivityReporter {
	private options: Required<
		Omit<ActivityReporterOptions, "gatewayAuthSecret">
	> & {
		gatewayAuthSecret: string | null;
	};
	private queue: Queued[] = [];
	private pending = new Map<string, ActivityEvent>();
	private timer: ReturnType<typeof setInterval> | null = null;
	private flushing: Promise<void> | null = null;
	private dropped = 0;

	constructor(options: ActivityReporterOptions) {
		this.options = {
			maxQueue: 1000,
			batchSize: 100,
			flushIntervalMs: 5000,
			fetch: (url, init) => fetch(url, init),
			...options,
		};
	}

	start(): void {
		if (this.timer) return;
		this.timer = setInterval(() => {
			void this.flush();
		}, this.options.flushIntervalMs);
		this.timer.unref?.();
	}

	/**
	 * Queues an event. Events with the same `coalesceKey` still waiting in the
	 * queue are merged by adding to their count.
	 */
	record(event: ActivityEvent, coalesceKey?: string): void {
		try {
			const key = coalesceKey ?? null;
			const queued = key ? this.pending.get(key) : undefined;
			if (queued) {
				queued.count = (queued.count ?? 1) + (event.count ?? 1);
				return;
			}
			const entry = {
				...event,
				occurredAt: event.occurredAt ?? new Date().toISOString(),
			};
			this.queue.push({ event: entry, key });
			if (key) this.pending.set(key, entry);
			while (this.queue.length > this.options.maxQueue) {
				const oldest = this.queue.shift();
				if (oldest?.key) this.pending.delete(oldest.key);
				this.dropped++;
			}
			if (this.queue.length >= this.options.batchSize) void this.flush();
		} catch {
			// Reporting must never affect the session.
		}
	}

	get size(): number {
		return this.queue.length;
	}

	/** Sends everything queued; resolves when done. Never rejects. */
	flush(): Promise<void> {
		if (this.flushing) {
			return this.flushing.then(() =>
				this.queue.length > 0 ? this.flush() : undefined,
			);
		}
		this.flushing = this.drain().finally(() => {
			this.flushing = null;
		});
		return this.flushing;
	}

	async stop(): Promise<void> {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		await this.flush();
	}

	private async drain(): Promise<void> {
		if (this.dropped > 0) {
			logEvent("activity_dropped", {
				count: this.dropped,
				reason: "queue_full",
			});
			this.dropped = 0;
		}
		while (this.queue.length > 0) {
			const batch = this.queue.splice(0, this.options.batchSize);
			for (const item of batch) {
				if (item.key) this.pending.delete(item.key);
			}
			await this.send(batch.map((item) => item.event));
		}
	}

	private async send(events: ActivityEvent[]): Promise<void> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (this.options.gatewayAuthSecret) {
			headers["x-inbound-gateway-secret"] = this.options.gatewayAuthSecret;
		}
		try {
			const response = await this.options.fetch(
				`${this.options.apiBaseUrl}/mailboxes/activity/ingest`,
				{
					method: "POST",
					headers,
					body: JSON.stringify({ events }),
					redirect: "error",
					signal: AbortSignal.timeout(this.options.timeoutMs),
				},
			);
			if (!response.ok) {
				logEvent("activity_ingest", {
					status: response.status,
					dropped: events.length,
				});
			}
			await response.body?.cancel().catch(() => undefined);
		} catch (err) {
			logEvent("activity_ingest", {
				status:
					(err as Error | null)?.name === "TimeoutError"
						? "timeout"
						: "network",
				dropped: events.length,
			});
		}
	}
}
