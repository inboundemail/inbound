export async function render(node: unknown): Promise<string> {
	// Optional integration: ordinary clients never load React or a renderer.
	const { render: renderEmail } = await import("@react-email/render").catch(() => {
		throw new Error("Install @react-email/render to render React email components");
	});
	return renderEmail(node as never);
}

export type Uploadable = File | Response | AsyncIterable<Uint8Array>;
type FileInput = Uploadable | BlobPart | AsyncIterable<BlobPart>;
export async function toFile(input: FileInput | PromiseLike<FileInput>, name?: string | null, options?: FilePropertyBag): Promise<File> {
	const value = await input;
	if (typeof File !== "undefined" && value instanceof File && !name && !options) return value;
	const parts: BlobPart[] = [];
	if (value instanceof Response) {
		parts.push(await value.blob());
		name ??= value.url && new URL(value.url).pathname.split("/").pop();
	} else if (typeof value === "object" && Symbol.asyncIterator in value) {
		for await (const part of value) parts.push(part instanceof Uint8Array ? new Uint8Array(part) : part);
	} else parts.push(value as BlobPart);
	const first = parts[0];
	const blob = new Blob(parts, { type: options?.type ?? (first instanceof Blob ? first.type : "") });
	const filename = name ?? (value && typeof value === "object" && "name" in value ? String(value.name) : "unknown_file");
	if (typeof File !== "undefined") return new File([blob], filename, { ...options, type: blob.type });
	// Node 18 has fetch and FormData but doesn't expose File on globalThis.
	const form = new FormData();
	form.set("file", blob, filename);
	return form.get("file") as File;
}
