export async function render(node: unknown): Promise<string> {
	const { render: renderEmail } = await import("@react-email/render");
	return renderEmail(node as never);
}

type FileOptions = ConstructorParameters<typeof File>[2];
interface BlobLike {
	readonly name?: string;
	readonly lastModified?: number;
	readonly size: number;
	readonly type: string;
	text(): Promise<string>;
	slice(start?: number, end?: number): BlobLike;
	arrayBuffer?(): Promise<ArrayBuffer>;
}
interface ResponseLike { url: string; blob(): Promise<BlobLike> }
type Part = string | ArrayBuffer | ArrayBufferView | BlobLike;
export type Uploadable = File | Response | AsyncIterable<Uint8Array> | (Blob & { readonly name?: string });
export type ToFileInput = Part | ResponseLike | AsyncIterable<Part>;
const object = (v: unknown): v is Record<PropertyKey, unknown> => v !== null && typeof v === "object";
const blobLike = (v: unknown): v is BlobLike => object(v) && typeof v.size === "number" && typeof v.type === "string" && typeof v.text === "function" && typeof v.slice === "function";
const responseLike = (v: unknown): v is ResponseLike => object(v) && typeof v.url === "string" && typeof v.blob === "function";
const iterable = (v: unknown): v is AsyncIterable<Part> => object(v) && typeof v[Symbol.asyncIterator] === "function";

function filename(v: unknown) {
	if (!object(v)) return;
	const path = v.name || v.filename || v.path || v.url;
	return path ? String(path).split(/[\\/]/).pop() : undefined;
}
async function part(value: Part): Promise<BlobPart> {
	if (ArrayBuffer.isView(value)) return Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
	if (typeof value === "string" || value instanceof ArrayBuffer || value instanceof Blob) return value;
	if ("arrayBuffer" in value && typeof value.arrayBuffer === "function") return await value.arrayBuffer();
	throw new TypeError("Expected a blob with arrayBuffer()");
}
export async function toFile(input: ToFileInput | PromiseLike<ToFileInput>, name?: string | null, options?: FileOptions): Promise<File> {
	const value = await input;
	if (typeof File !== "undefined" && value instanceof File && !name && !options) return value;
	const contents = responseLike(value) ? await value.blob() : value;
	const parts: BlobPart[] = [];
	if (iterable(contents)) { for await (const chunk of contents) parts.push(await part(chunk)); }
	else parts.push(await part(contents));
	const fileName = name ?? filename(value) ?? "unknown_file";
	const opts = { ...options, type: options?.type ?? (blobLike(contents) ? contents.type : "") };
	if (typeof File !== "undefined") return new File(parts, fileName, opts);
	const form = new FormData();
	form.set("file", new Blob(parts, opts), fileName);
	return form.get("file") as File;
}

function upload(value: unknown): value is ToFileInput { return blobLike(value) || responseLike(value) || iterable(value); }
function hasUpload(value: unknown): boolean {
	return upload(value) || (object(value) && Object.values(value).some(hasUpload));
}
export async function multipart(body: object): Promise<FormData | undefined> {
	if (!hasUpload(body)) return;
	const form = new FormData();
	async function append(key: string, value: unknown) {
		if (value === undefined) return;
		if (value === null) throw new TypeError(`Cannot send null in multipart field ${key}`);
		if (upload(value)) form.append(key, await toFile(value));
		else if (Array.isArray(value)) { for (const item of value) await append(`${key}[]`, item); }
		else if (object(value)) { for (const [k, v] of Object.entries(value)) await append(`${key}[${k}]`, v); }
		else form.append(key, String(value));
	}
	for (const [key, v] of Object.entries(body)) await append(key, v);
	return form;
}
