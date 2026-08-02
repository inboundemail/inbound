"use client";

import {
	ArrowRight,
	AtSign,
	Check,
	LoaderCircle,
	Plus,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import {
	isEmailAddress,
	normalizeAddress,
} from "@/lib/mailbox-config-model";
import type {
	InboundSession,
	MailboxConfiguration,
	MailboxConfigurationState,
} from "@/lib/mail-types";

interface MailboxOnboardingProps {
	editing?: boolean;
	initial: MailboxConfigurationState;
	session: InboundSession;
	onCancel?: () => void;
	onComplete: (configuration: MailboxConfigurationState) => void;
}

function cloneMailboxes(mailboxes: MailboxConfiguration[]) {
	return mailboxes.map((mailbox) => ({
		...mailbox,
		addresses: [...mailbox.addresses],
	}));
}

function mailboxDomain(address: string) {
	return normalizeAddress(address).split("@")[1] ?? "";
}

export function MailboxOnboarding({
	editing = false,
	initial,
	session,
	onCancel,
	onComplete,
}: MailboxOnboardingProps) {
	const [mailboxes, setMailboxes] = useState(() => cloneMailboxes(initial.mailboxes));
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const enabledCount = useMemo(
		() => mailboxes.filter((mailbox) => mailbox.enabled).length,
		[mailboxes],
	);

	const updateMailbox = (
		domainId: string,
		update: (mailbox: MailboxConfiguration) => MailboxConfiguration,
	) => {
		setMailboxes((current) => current.map((mailbox) =>
			mailbox.domainId === domainId ? update(mailbox) : mailbox,
		));
		setError(null);
	};

	const addAddresses = (mailbox: MailboxConfiguration) => {
		const values = (drafts[mailbox.domainId] ?? "")
			.split(/[\s,;]+/u)
			.map(normalizeAddress)
			.filter(Boolean);
		if (!values.length) return;
		const invalid = values.find((address) =>
			!isEmailAddress(address) || mailboxDomain(address) !== mailbox.domain,
		);
		if (invalid) {
			setError(`“${invalid}” is not a mailbox on ${mailbox.domain}.`);
			return;
		}
		updateMailbox(mailbox.domainId, (current) => {
			const addresses = [...new Set([...current.addresses, ...values])];
			return {
				...current,
				addresses,
				defaultFromAddress: addresses.includes(current.defaultFromAddress ?? "")
					? current.defaultFromAddress
					: addresses[0],
			};
		});
		setDrafts((current) => ({ ...current, [mailbox.domainId]: "" }));
	};

	const save = async () => {
		if (saving) return;
		setSaving(true);
		setError(null);
		try {
			const response = await fetch("/api/config/mailboxes", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ mailboxes }),
			});
			const payload = await response.json() as MailboxConfigurationState & { error?: string };
			if (!response.ok) throw new Error(payload.error || "Unable to save mailboxes.");
			onComplete(payload);
		} catch (saveError) {
			setError(saveError instanceof Error ? saveError.message : "Unable to save mailboxes.");
			setSaving(false);
		}
	};

	return (
		<main className="mailbox-setup-screen">
			<section className="mailbox-setup-card">
				<header className="mailbox-setup-brand mailbox-setup-enter">
					<div><BrandMark /><strong>Inbound Mail</strong></div>
					<span>{session.user?.email}</span>
				</header>

				<div className="mailbox-setup-copy mailbox-setup-enter">
					<p className="eyebrow">{editing ? "Mailbox settings" : "One quick setup"}</p>
					<h1>{editing ? "Choose your mailboxes" : "What mail should appear here?"}</h1>
					<p>
						Enable whole domains or choose individual addresses. Replies automatically use
						the exact mailbox that received the message.
					</p>
				</div>

				<div className="mailbox-domain-list mailbox-setup-enter">
					{mailboxes.length ? mailboxes.map((mailbox) => (
						<section className={`mailbox-domain-card ${mailbox.enabled ? "mailbox-domain-enabled" : ""}`} key={mailbox.domainId}>
							<header>
								<div className="mailbox-domain-name"><strong>{mailbox.domain}</strong><span>{mailbox.enabled ? "Included in your inbox" : "Not included"}</span></div>
								<label className="mailbox-toggle">
									<input
										aria-label={`Include ${mailbox.domain}`}
										checked={mailbox.enabled}
										onChange={(event) => updateMailbox(mailbox.domainId, (current) => ({ ...current, enabled: event.target.checked }))}
										type="checkbox"
									/>
									<span><Check size={12} /></span>
								</label>
							</header>

							{mailbox.enabled ? (
								<div className="mailbox-domain-body">
									<div className="mailbox-mode-switch" role="group" aria-label={`Addresses on ${mailbox.domain}`}>
										<button
											aria-pressed={mailbox.selectionMode === "all"}
											onClick={() => updateMailbox(mailbox.domainId, (current) => ({ ...current, selectionMode: "all" }))}
											type="button"
										>All addresses</button>
										<button
											aria-pressed={mailbox.selectionMode === "selected"}
											onClick={() => updateMailbox(mailbox.domainId, (current) => ({
												...current,
												selectionMode: "selected",
												defaultFromAddress: current.addresses.includes(current.defaultFromAddress ?? "")
													? current.defaultFromAddress
													: current.addresses[0] ?? null,
											}))}
											type="button"
										>Choose addresses</button>
									</div>

									{mailbox.selectionMode === "all" ? (
										<label className="mailbox-default-field">
											<span>New messages send from</span>
											<input
												aria-label={`Default From address for ${mailbox.domain}`}
												onChange={(event) => updateMailbox(mailbox.domainId, (current) => ({ ...current, defaultFromAddress: event.target.value }))}
												placeholder={`mail@${mailbox.domain}`}
												value={mailbox.defaultFromAddress ?? ""}
											/>
											<small>Incoming mail can use any address on this domain.</small>
										</label>
									) : (
										<div className="mailbox-address-picker">
											<label><span>Mailboxes</span><div>
												<input
													aria-label={`Add addresses on ${mailbox.domain}`}
													onChange={(event) => setDrafts((current) => ({ ...current, [mailbox.domainId]: event.target.value }))}
													onKeyDown={(event) => {
														if (event.key === "Enter") { event.preventDefault(); addAddresses(mailbox); }
													}}
													placeholder={`you@${mailbox.domain}`}
													value={drafts[mailbox.domainId] ?? ""}
												/>
												<button aria-label={`Add mailbox on ${mailbox.domain}`} onClick={() => addAddresses(mailbox)} type="button"><Plus size={15} /></button>
											</div></label>
											{mailbox.addresses.length ? (
												<div className="mailbox-address-list">
													{mailbox.addresses.map((address) => (
														<div className="mailbox-address-chip" key={address}>
															<button
																aria-pressed={mailbox.defaultFromAddress === address}
																onClick={() => updateMailbox(mailbox.domainId, (current) => ({ ...current, defaultFromAddress: address }))}
																type="button"
															>{mailbox.defaultFromAddress === address ? "Default" : "Make default"}</button>
															<span>{address}</span>
															<button
																aria-label={`Remove ${address}`}
																onClick={() => updateMailbox(mailbox.domainId, (current) => {
																	const addresses = current.addresses.filter((item) => item !== address);
																	return { ...current, addresses, defaultFromAddress: current.defaultFromAddress === address ? addresses[0] ?? null : current.defaultFromAddress };
																})}
																type="button"
															><X size={13} /></button>
														</div>
													))}
												</div>
											) : <small className="mailbox-address-empty">Add every address you want to read or send as.</small>}
										</div>
									)}
								</div>
							) : null}
						</section>
					)) : (
						<div className="mailbox-no-domains">
							<AtSign size={19} />
							<strong>No domains were authorized</strong>
							<span>You can continue with an empty inbox and reconnect domains later.</span>
						</div>
					)}
				</div>

				<footer className="mailbox-setup-actions mailbox-setup-enter">
					<div><strong>{enabledCount}</strong><span>domain{enabledCount === 1 ? "" : "s"} enabled</span></div>
					<div>
						{editing ? <button className="mailbox-secondary-action" disabled={saving} onClick={onCancel} type="button">Cancel</button> : null}
						<button className="mailbox-primary-action" disabled={saving} onClick={() => void save()} type="button">
							{saving ? <LoaderCircle className="spin" size={15} /> : <ArrowRight size={15} />}
							{saving ? "Saving…" : editing ? "Save mailboxes" : "Open my inbox"}
						</button>
					</div>
				</footer>
				{error ? <p className="mailbox-setup-error" role="alert">{error}</p> : null}
			</section>
		</main>
	);
}
