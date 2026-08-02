import { describe, expect, it } from "bun:test";
import {
	configuredFromAddresses,
	normalizeMailboxConfigurationInput,
	replyAddressForThread,
} from "@/lib/mailbox-config-model";
import type {
	MailboxConfigurationState,
	MailThread,
} from "@/lib/mail-types";

const domains = [
	{ id: "dom_inbound", domain: "inbound.new" },
	{ id: "dom_northstar", domain: "northstar.studio" },
];

const configuration: MailboxConfigurationState = {
	onboarded: true,
	mailboxes: [
		{
			domainId: "dom_inbound",
			domain: "inbound.new",
			enabled: true,
			selectionMode: "all",
			addresses: [],
			defaultFromAddress: "ryan@inbound.new",
		},
		{
			domainId: "dom_northstar",
			domain: "northstar.studio",
			enabled: true,
			selectionMode: "selected",
			addresses: ["hello@northstar.studio", "support@northstar.studio"],
			defaultFromAddress: "hello@northstar.studio",
		},
	],
};

function threadDeliveredTo(address: string): MailThread {
	return {
		id: "thread_1",
		subject: "A question",
		snippet: "Hello",
		participants: [{ name: "Maya", email: "maya@example.com" }],
		lastMessageAt: "2026-08-02T12:00:00.000Z",
		messageCount: 1,
		unread: true,
		starred: false,
		important: false,
		folder: "inbox",
		category: "team",
		labels: [],
		messages: [{
			id: "message_1",
			threadId: "thread_1",
			direction: "inbound",
			from: { name: "Maya", email: "maya@example.com" },
			to: [{ name: address.split("@")[0], email: address }],
			sentAt: "2026-08-02T12:00:00.000Z",
			bodyText: "Hello",
		}],
	};
}

describe("mailbox configuration", () => {
	it("normalizes selected addresses and disables omitted domains", () => {
		const result = normalizeMailboxConfigurationInput({
			mailboxes: [{
				domainId: "dom_inbound",
				enabled: true,
				selectionMode: "selected",
				addresses: [" Support@Inbound.New ", "support@inbound.new"],
				defaultFromAddress: "SUPPORT@INBOUND.NEW",
			}],
		}, domains, "ryan@inbound.new");

		expect(result.mailboxes[0]).toMatchObject({
			enabled: true,
			selectionMode: "selected",
			addresses: ["support@inbound.new"],
			defaultFromAddress: "support@inbound.new",
		});
		expect(result.mailboxes[1]).toMatchObject({
			enabled: false,
			addresses: [],
			defaultFromAddress: null,
		});
	});

	it("rejects an address outside its authorized domain", () => {
		expect(() => normalizeMailboxConfigurationInput({
			mailboxes: [{
				domainId: "dom_inbound",
				enabled: true,
				selectionMode: "selected",
				addresses: ["support@example.com"],
			}],
		}, domains)).toThrow("support@example.com is not a mailbox on inbound.new");
	});

	it("uses the exact all-domain recipient when replying", () => {
		expect(replyAddressForThread(
			threadDeliveredTo("anything@inbound.new"),
			configuration,
			"ryan@inbound.new",
		)).toBe("anything@inbound.new");
	});

	it("uses a selected recipient and falls back for an unselected one", () => {
		expect(replyAddressForThread(
			threadDeliveredTo("support@northstar.studio"),
			configuration,
			"ryan@inbound.new",
		)).toBe("support@northstar.studio");
		expect(replyAddressForThread(
			threadDeliveredTo("private@northstar.studio"),
			configuration,
			"ryan@inbound.new",
		)).toBe("ryan@inbound.new");
	});

	it("builds compose choices from configured defaults and selected addresses", () => {
		expect(configuredFromAddresses(configuration)).toEqual([
			"ryan@inbound.new",
			"hello@northstar.studio",
			"support@northstar.studio",
		]);
	});
});
