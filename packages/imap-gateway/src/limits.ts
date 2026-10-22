interface FailureRecord {
	count: number;
	windowStart: number;
}

export interface AcceptedSocket {
	remoteAddress?: string;
	once(event: "close", listener: () => void): unknown;
}

export const MAX_FAILURE_RECORDS = 1_000_000;

export function normalizeIp(address: string | undefined): string {
	return (address ?? "").replace(/^::ffff:/, "") || "unknown";
}

export class ConnectionLimits {
	private perIp = new Map<string, number>();
	private releases = new WeakMap<object, () => void>();
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
		maxFailureRecords = 100_000,
	) {
		if (
			!Number.isSafeInteger(maxFailureRecords) ||
			maxFailureRecords <= 0 ||
			maxFailureRecords > MAX_FAILURE_RECORDS
		) {
			throw new Error(
				"Authentication failure record cap must be between 1 and 1,000,000",
			);
		}
		this.maxPerIp = maxPerIp;
		this.failureLimit = failureLimit;
		this.failureWindowMs = failureWindowMs;
		this.maxFailureRecords = maxFailureRecords;
	}

	acceptSocket(socket: AcceptedSocket): boolean {
		const ip = normalizeIp(socket.remoteAddress);
		const current = this.perIp.get(ip) ?? 0;
		if (current >= this.maxPerIp) return false;
		this.perIp.set(ip, current + 1);
		let released = false;
		const release = () => {
			if (released) return;
			released = true;
			const open = this.perIp.get(ip) ?? 0;
			if (open <= 1) this.perIp.delete(ip);
			else this.perIp.set(ip, open - 1);
		};
		socket.once("close", release);
		this.releases.set(socket, release);
		return true;
	}

	/**
	 * Releases an accepted socket's slot when its IMAP session closes. STARTTLS removes every
	 * listener from the plaintext socket, including the "close" listener added at accept.
	 */
	releaseSocket(socket: object | undefined): void {
		if (socket) this.releases.get(socket)?.();
	}

	openConnections(ip: string): number {
		return this.perIp.get(normalizeIp(ip)) ?? 0;
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
		return null;
	}

	recordAuthFailure(ip: string, username: string): void {
		const now = Date.now();
		this.incrementFailure(this.failures, this.authKey(ip, username), now);
		this.incrementFailure(this.ipFailures, ip, now);
	}

	recordMalformedAuth(ip: string): void {
		this.incrementFailure(this.ipFailures, ip, Date.now());
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

	private makeRoom(records: Map<string, FailureRecord>, now: number): void {
		while (records.size >= this.maxFailureRecords) {
			const oldest = records.keys().next();
			if (oldest.done) return;
			records.delete(oldest.value);
		}
		for (const [key, record] of records) {
			if (now - record.windowStart <= this.failureWindowMs) break;
			records.delete(key);
		}
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
		this.makeRoom(records, now);
		records.set(key, { count: 1, windowStart: now });
	}
}

export class ContentBudgetError extends Error {
	readonly imapCode = "LIMIT";
	readonly responseMessage =
		"Server is busy sending other large messages, try again later";
}

interface BudgetWaiter {
	bytes: number;
	owner?: string;
	resolve: () => void;
	timer: ReturnType<typeof setTimeout>;
}

/**
 * Bounds the memory held by FETCH content in flight. Waiters are served in order, except that a
 * waiter held back only by its owner's share does not block other owners.
 */
export class ContentBudget {
	private inFlight = 0;
	private byOwner = new Map<string, number>();
	private waiters: BudgetWaiter[] = [];
	readonly capacity: number;
	readonly ownerCapacity: number;
	private waitMs: number;

	constructor(capacity: number, waitMs: number, maxOwnerShare = 0.5) {
		this.capacity = capacity;
		this.ownerCapacity = Math.max(1, Math.floor(capacity * maxOwnerShare));
		this.waitMs = waitMs;
	}

	get used(): number {
		return this.inFlight;
	}

	usedBy(owner: string): number {
		return this.byOwner.get(owner) ?? 0;
	}

	/** `owner` (a credential ID) may hold at most ownerCapacity bytes at once. */
	async acquire(requested: number, owner?: string): Promise<() => void> {
		const limit = owner === undefined ? this.capacity : this.ownerCapacity;
		const bytes = Math.min(Math.max(Math.ceil(requested), 1), limit);
		if (
			this.waiters.length === 0 &&
			this.inFlight + bytes <= this.capacity &&
			this.ownerFits(owner, bytes)
		) {
			this.take(bytes, owner);
			return this.releaser(bytes, owner);
		}
		await new Promise<void>((resolve, reject) => {
			const waiter: BudgetWaiter = {
				bytes,
				owner,
				resolve,
				timer: setTimeout(() => {
					const index = this.waiters.indexOf(waiter);
					if (index >= 0) this.waiters.splice(index, 1);
					reject(new ContentBudgetError("Fetch content budget exhausted"));
					this.drain();
				}, this.waitMs),
			};
			this.waiters.push(waiter);
			this.drain();
		});
		return this.releaser(bytes, owner);
	}

	private ownerFits(owner: string | undefined, bytes: number): boolean {
		return (
			owner === undefined || this.usedBy(owner) + bytes <= this.ownerCapacity
		);
	}

	private take(bytes: number, owner: string | undefined): void {
		this.inFlight += bytes;
		if (owner !== undefined) {
			this.byOwner.set(owner, this.usedBy(owner) + bytes);
		}
	}

	private releaser(bytes: number, owner: string | undefined): () => void {
		let released = false;
		return () => {
			if (released) return;
			released = true;
			this.inFlight -= bytes;
			if (owner !== undefined) {
				const remaining = this.usedBy(owner) - bytes;
				if (remaining > 0) this.byOwner.set(owner, remaining);
				else this.byOwner.delete(owner);
			}
			this.drain();
		};
	}

	private drain(): void {
		for (let index = 0; index < this.waiters.length; ) {
			const next = this.waiters[index];
			if (!next) return;
			if (this.inFlight + next.bytes > this.capacity) return;
			if (!this.ownerFits(next.owner, next.bytes)) {
				index++;
				continue;
			}
			this.waiters.splice(index, 1);
			clearTimeout(next.timer);
			this.take(next.bytes, next.owner);
			next.resolve();
		}
	}
}
