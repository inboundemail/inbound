import type { MailCacheSnapshot } from "@/lib/mail-types";

const DB_NAME = "inbound-mail-cache";
const STORE_NAME = "mailbox";
const FALLBACK_PREFIX = "inbound-mail:snapshot:v2";

function openCache(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE_NAME)) {
				request.result.createObjectStore(STORE_NAME);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export async function readMailCache(
	cacheKey: string,
): Promise<MailCacheSnapshot | null> {
	if (typeof window === "undefined") return null;

	try {
		const db = await openCache();
		const value = await new Promise<MailCacheSnapshot | undefined>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readonly");
			const request = transaction.objectStore(STORE_NAME).get(cacheKey);
			request.onsuccess = () => resolve(request.result as MailCacheSnapshot | undefined);
			request.onerror = () => reject(request.error);
		});
		db.close();
		return value?.version === 2 ? value : null;
	} catch {
		const fallback = window.localStorage.getItem(`${FALLBACK_PREFIX}:${cacheKey}`);
		if (!fallback) return null;
		try {
			const parsed = JSON.parse(fallback) as MailCacheSnapshot;
			return parsed.version === 2 ? parsed : null;
		} catch {
			return null;
		}
	}
}

export async function writeMailCache(
	cacheKey: string,
	snapshot: MailCacheSnapshot,
): Promise<void> {
	if (typeof window === "undefined") return;

	try {
		const db = await openCache();
		await new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readwrite");
			transaction.objectStore(STORE_NAME).put(snapshot, cacheKey);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
		});
		db.close();
	} catch {
		window.localStorage.setItem(
			`${FALLBACK_PREFIX}:${cacheKey}`,
			JSON.stringify(snapshot),
		);
	}
}

export async function clearMailCache(cacheKey: string): Promise<void> {
	if (typeof window === "undefined") return;
	window.localStorage.removeItem(`${FALLBACK_PREFIX}:${cacheKey}`);
	try {
		const db = await openCache();
		await new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readwrite");
			transaction.objectStore(STORE_NAME).delete(cacheKey);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
		});
		db.close();
	} catch {
		// Local storage was already cleared; there is nothing else to reset.
	}
}
