import type { MailContact } from "@/lib/mail-types";

const EMAIL_ADDRESS = /^[^\s<>@]+@[^\s<>@]+$/;

function fallbackName(email: string) {
	return email.split("@")[0] || "Unknown sender";
}

function cleanDisplayName(value: string) {
	return value
		.trim()
		.replace(/^"|"$/g, "")
		.replace(/\\(["\\])/g, "$1")
		.trim();
}

export function contactFromMailbox(value: unknown, fallbackEmail = ""): MailContact {
	const mailbox = String(value ?? "").trim();
	const bracketed = mailbox.match(/^(.*?)\s*<\s*([^<>]+)\s*>$/);
	if (bracketed) {
		const email = bracketed[2].trim();
		return {
			name: cleanDisplayName(bracketed[1]) || fallbackName(email),
			email,
		};
	}

	if (EMAIL_ADDRESS.test(mailbox)) {
		return { name: fallbackName(mailbox), email: mailbox };
	}

	const email = fallbackEmail.trim();
	return {
		name: cleanDisplayName(mailbox) || fallbackName(email),
		email,
	};
}

export function contactsForThread(
	participantNames: string[],
	participantEmails: string[],
	latestFrom: unknown,
): MailContact[] {
	const contacts = participantEmails.map((email, index) =>
		contactFromMailbox(participantNames[index], email),
	);
	const sender = contactFromMailbox(latestFrom, participantEmails[0] ?? "");
	const senderEmail = sender.email.toLowerCase();
	const remaining = contacts.filter((contact) =>
		senderEmail
			? contact.email.toLowerCase() !== senderEmail
			: contact.name !== sender.name,
	);

	return [sender, ...remaining];
}

const EMAIL_FRAME_HEAD = `
<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'self'">
<meta name="referrer" content="no-referrer">
<base target="_blank">
<style>
	html, body { min-width: 0 !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; background: transparent !important; overflow-wrap: anywhere; color-scheme: light; }
	img, video, table { max-width: 100% !important; }
	img, video { height: auto !important; }
	pre { max-width: 100%; white-space: pre-wrap; }
</style>`;

export function prepareEmailHtml(html: string) {
	if (/<head(?:\s[^>]*)?>/i.test(html)) {
		return html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${EMAIL_FRAME_HEAD}`);
	}
	if (/<html(?:\s[^>]*)?>/i.test(html)) {
		return html.replace(/<html(\s[^>]*)?>/i, (root) => `${root}<head>${EMAIL_FRAME_HEAD}</head>`);
	}
	return `<!doctype html><html><head>${EMAIL_FRAME_HEAD}</head><body>${html}</body></html>`;
}
