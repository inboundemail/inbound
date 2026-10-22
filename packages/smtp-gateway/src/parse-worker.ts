import { parentPort, workerData } from "node:worker_threads";
import { SmtpRelayError } from "./api-client.ts";
import {
	type MappedRawMessage,
	mapRawMessage,
	type RelayEnvelope,
} from "./mapper.ts";

export interface ParseWorkerInput {
	raw: Uint8Array;
	envelope: RelayEnvelope;
	maxMimeParts: number;
}

export type ParseWorkerMessage =
	| { type: "ready" }
	| { type: "mapped"; mapped: MappedRawMessage }
	| { type: "failure"; responseCode: number; message: string }
	| { type: "error"; name: string; message: string };

const port = parentPort;
if (!port) throw new Error("parse-worker must run in a worker thread");
const post = (message: ParseWorkerMessage) => port.postMessage(message);

post({ type: "ready" });
const input = workerData as ParseWorkerInput;
try {
	const mapped = await mapRawMessage(
		Buffer.from(input.raw.buffer, input.raw.byteOffset, input.raw.byteLength),
		input.envelope,
		{ maxMimeParts: input.maxMimeParts },
	);
	post({ type: "mapped", mapped });
} catch (error: unknown) {
	if (error instanceof SmtpRelayError) {
		post({
			type: "failure",
			responseCode: error.responseCode,
			message: error.message,
		});
	} else {
		post({
			type: "error",
			name: error instanceof Error ? error.name : typeof error,
			message: error instanceof Error ? error.message.slice(0, 200) : "",
		});
	}
}
