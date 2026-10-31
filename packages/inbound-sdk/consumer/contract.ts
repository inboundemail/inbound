import { createReadStream } from "node:fs";
import Inbound, { APIError, InboundError, NotFoundError, toFile } from "inboundemail";
import type { APIResource } from "inboundemail/resource.js";
import type { APIPromise } from "inboundemail/core/api-promise.mjs";
import type { EndpointCreateParams, EndpointUpdateParams } from "inboundemail/resources/endpoints.js";

declare const value: unknown;
new Inbound({ apiKey: process.env.INBOUND_API_KEY });
const c = new Inbound({ apiKey: "fixture", logLevel: "debug", logger: console, defaultQuery: { q: "a" }, defaultHeaders: { tags: ["a", "b"] }, fetchOptions: { redirect: "error" } });
const webhook: EndpointCreateParams.WebhookConfig = { url: "x", headers: value };
const update: EndpointUpdateParams.WebhookConfig = webhook;
const email: EndpointCreateParams.EmailConfig = { forwardTo: "a" };
const group: EndpointCreateParams.EmailGroupConfig = { emails: ["a"] };
const configs: (EndpointUpdateParams.EmailConfig | EndpointUpdateParams.EmailGroupConfig)[] = [email, group];
c.endpoints.update("e", { config: update });
c.emails.send({ from: "a", to: "b", subject: "s", headers: value }, { idempotencyKey: "k" });
c.domains.list({ limit: "3", offset: "2" });
c.mail.list({ limit: "10" });
const resource: APIResource = new Inbound.Domains(c);
const result: APIPromise<string> = c.withOptions({ maxRetries: 0 }).get<string>("/text", Promise.resolve({ query: { q: 1 }, headers: { tags: null } }));
result.catch(e => e.status);
const nativeThen: Promise<string>["then"] = result.then;
const handled: Promise<number> = result.then<number, number>(s => s.length, e => e.status);
const legacyAttachment: Promise<void> = c.attachments.retrieve("name.txt", { id: "email" });
const positionalAttachment: Promise<Response> = c.attachments.retrieve("email", "name.txt");
c.request(Promise.resolve({ method: "post" as const, path: "/path", body: {} }), 0);
const failure: APIError<404, Headers> = new NotFoundError(404, {}, "not found", new Headers());
const status: 404 = failure.status;
new InboundError();
APIError.generate(status, {}, "not found", failure.headers);
toFile(createReadStream("x.pdf"));
// @ts-expect-error Incremental sync uses list(), not the offset iterator.
c.folderMessages.listAll("box", "INBOX", { sinceUid: 1 });
// @ts-expect-error sinceModseq and offset pagination cannot be combined either.
c.folderMessages.listAll("box", "INBOX", { sinceModseq: 2 });
void [resource, result, configs, nativeThen, handled, legacyAttachment, positionalAttachment];
