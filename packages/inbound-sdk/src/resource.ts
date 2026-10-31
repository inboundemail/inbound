import type { Inbound } from "./generated/index.js";

export abstract class APIResource {
	constructor(protected _client: Inbound) {}
}
