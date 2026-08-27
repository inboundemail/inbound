interface FailureRecord {
	count: number;
	windowStart: number;
}

interface ConnectionSession {
	remoteAddress?: string;
}

export class ConnectionLimits {
	private perIp = new Map<string, number>();
	private accepted = new WeakSet<object>();
	private failures = new Map<string, FailureRecord>();
	private ipFailures = new Map<string, FailureRecord>();
	private maxPerIp: number;
	private failureLimit: number;
	private failureWindowMs: number;
	private maxFailureRecords: number;

	constructor(
		maxPerIp: number,
		failureLimit: number,
		failureWindowMs: number,
		maxFailureRecords = 10_000,
	) {
		if (
			!Number.isSafeInteger(maxFailureRecords) ||
			maxFailureRecords <= 0 ||
			maxFailureRecords > 10_000
		) {
			throw new Error(
				"Authentication failure record cap must be between 1 and 10,000",
			);
		}
		this.maxPerIp = maxPerIp;
		this.failureLimit = failureLimit;
		this.failureWindowMs = failureWindowMs;
		this.maxFailureRecords = maxFailureRecords;
	}

	onConnect(session: ConnectionSession): Error | null {
		const ip = session.remoteAddress ?? "unknown";
		const current = this.perIp.get(ip) ?? 0;
		if (current >= this.maxPerIp) {
			return new Error("Too many connections from this address");
		}
		this.perIp.set(ip, current + 1);
		this.accepted.add(session);
		return null;
	}

	onClose(session: ConnectionSession): void {
		if (!this.accepted.has(session)) return;
		this.accepted.delete(session);
		const ip = session.remoteAddress ?? "unknown";
		const current = this.perIp.get(ip) ?? 0;
		if (current <= 1) this.perIp.delete(ip);
		else this.perIp.set(ip, current - 1);
	}

	assertAuthAllowed(ip: string, username: string): Error | null {
		const now = Date.now();
		const account = this.getActiveFailure(
			this.failures,
			this.authKey(ip, username),
			now,
		);
		const aggregate = this.getActiveFailure(this.ipFailures, ip, now);
		if (
			(account && account.count >= this.failureLimit) ||
			(aggregate && aggregate.count >= this.failureLimit * 5)
		) {
			return new Error("Too many failed authentication attempts");
		}
		if (
			(!account && !this.hasFailureCapacity(this.failures, now)) ||
			(!aggregate && !this.hasFailureCapacity(this.ipFailures, now))
		) {
			return new Error("Authentication failure tracking is at capacity");
		}
		return null;
	}

	recordAuthFailure(ip: string, username: string): void {
		const now = Date.now();
		this.incrementFailure(this.failures, this.authKey(ip, username), now);
		this.incrementFailure(this.ipFailures, ip, now);
	}

	recordAuthSuccess(ip: string, username: string): void {
		this.failures.delete(this.authKey(ip, username));
	}

	private authKey(ip: string, username: string): string {
		return `${ip}\0${username}`;
	}

	private getActiveFailure(
		records: Map<string, FailureRecord>,
		key: string,
		now: number,
	): FailureRecord | undefined {
		const record = records.get(key);
		if (record && now - record.windowStart > this.failureWindowMs) {
			records.delete(key);
			return undefined;
		}
		return record;
	}

	private hasFailureCapacity(
		records: Map<string, FailureRecord>,
		now: number,
	): boolean {
		if (records.size < this.maxFailureRecords) return true;
		while (records.size >= this.maxFailureRecords) {
			const oldest = records.entries().next().value;
			if (!oldest || now - oldest[1].windowStart <= this.failureWindowMs) {
				return false;
			}
			records.delete(oldest[0]);
		}
		return true;
	}

	private incrementFailure(
		records: Map<string, FailureRecord>,
		key: string,
		now: number,
	): void {
		const record = this.getActiveFailure(records, key, now);
		if (record) {
			record.count++;
			return;
		}
		if (!this.hasFailureCapacity(records, now)) return;
		records.set(key, { count: 1, windowStart: now });
	}
}
