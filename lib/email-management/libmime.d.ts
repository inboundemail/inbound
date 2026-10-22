declare module "libmime" {
	interface ParsedHeaderValue {
		value: string | false;
		params: Record<string, unknown>;
	}

	interface Libmime {
		decodeHeader(headerLine: string): { key: string; value: string };
		parseHeaderValue(str: string): ParsedHeaderValue;
	}

	const libmime: Libmime;
	export default libmime;
}
