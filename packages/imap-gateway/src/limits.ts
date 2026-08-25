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
	private maxPerIp: number;
	private failureLimit: number;
	private failureWindowMs: number;

	constructor(maxPerIp: number, failureLimit: number, failureWindowMs: number) {
		this.maxPerIp = maxPerIp;
		this.failureLimit = failureLimit;
		this.failureWindowMs = failureWindowMs;
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
		const key = this.authKey(ip, username);
		const record = this.failures.get(key);
		if (!record) return null;
		if (Date.now() - record.windowStart > this.failureWindowMs) {
			this.failures.delete(key);
			return null;
		}
		if (record.count >= this.failureLimit) {
			return new Error("Too many failed authentication attempts");
		}
		return null;
	}

	recordAuthFailure(ip: string, username: string): void {
		const now = Date.now();
		const key = this.authKey(ip, username);
		const record = this.failures.get(key);
		if (!record || now - record.windowStart > this.failureWindowMs) {
			this.failures.set(key, { count: 1, windowStart: now });
		} else {
			record.count++;
		}

		if (this.failures.size > 10_000) this.sweepFailures(now);
	}

	recordAuthSuccess(ip: string, username: string): void {
		this.failures.delete(this.authKey(ip, username));
	}

	private authKey(ip: string, username: string): string {
		return `${ip}\0${username}`;
	}

	private sweepFailures(now: number): void {
		for (const [ip, record] of this.failures) {
			if (now - record.windowStart > this.failureWindowMs) {
				this.failures.delete(ip);
			}
		}
	}
}
