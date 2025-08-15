import { whopSdk } from "@/lib/whop-sdk";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "../../../components/button";
import { SubmitButton } from "../../../components/submit-button";
import Link from "next/link";
import { Inbound } from '@inboundemail/sdk'

const inbound = new Inbound(process.env.INBOUND_API_KEY!)

// Server action to handle email sending
async function handleEmailSend(
	userId: string,
	experienceId: string,
	formData: FormData
) {
	'use server'

	const emailText = formData.get('emailText') as string;
	const emailSubject = formData.get('emailSubject') as string;
	const recipientEmail = formData.get('recipientEmail') as string;
	const fromEmail = formData.get('fromEmail') as string;

	if (!emailText || emailText.trim() === '') {
		// Could implement error handling here
		return;
	}

	if (!recipientEmail || recipientEmail.trim() === '') {
		// Could implement error handling here
		return;
	}

	if (!emailSubject || emailSubject.trim() === '') {
		// Could implement error handling here
		return;
	}

	let success = false;
	let errorOccurred = false;

	try {
		// Send email using the SDK
		const result = await inbound.emails.send({
			from: fromEmail.trim(),
			to: recipientEmail.trim(),
			subject: emailSubject.trim(),
			text: `${emailText.trim()}\n\nsent via whop`,
			html: `<p>${emailText.trim().replace(/\n/g, '<br>')}</p><br><br><p><em>sent via whop</em></p>`
		});

		if (result.id) {
			success = true;
		} else {
			errorOccurred = true;
		}
	} catch (error) {
		console.error('Error sending email:', error);
		errorOccurred = true;
	}

	// Handle redirects outside of try-catch to avoid NEXT_REDIRECT error
	if (success) {
		redirect(`/experiences/${experienceId}?toast=email-sent`);
	} else if (errorOccurred) {
		redirect(`/experiences/${experienceId}?toast=email-error`);
	}

	// For errors, we could implement toast notifications or error handling
	// For now, we'll just return without action
}

export default async function SendEmailPage({
	params,
}: {
	params: Promise<{ experienceId: string }>;
}) {
	// The headers contains the user token
	const headersList = await headers();

	// The experienceId is a path param
	const { experienceId } = await params;

	// The user token is in the headers
	const { userId } = await whopSdk.verifyUserToken(headersList);

	const result = await whopSdk.access.checkIfUserHasAccessToExperience({
		userId,
		experienceId,
	});

	const user = await whopSdk.users.getUser({ userId });
	const experience = await whopSdk.experiences.getExperience({ experienceId });
	const userInboundEmail = user.username + '@whopbound.com';
	const userName = user.name;
	const formattedFromEmail = `${userName} <${userInboundEmail}>`;

	// Either: 'admin' | 'customer' | 'no_access';
	const { accessLevel } = result;

	if (!result.hasAccess) {
		return (
			<div className="min-h-screen bg-gray-1 py-12 px-4 sm:px-6 lg:px-8">
				<div className="max-w-5xl mx-auto">
					<div className="bg-red-2 border border-red-6 rounded-xl p-6 shadow-sm">
						<div className="flex items-center gap-2 text-red-9">
							<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
							</svg>
							<span className="font-medium">You don't have access to this experience.</span>
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gray-1 py-12 px-4 sm:px-6 lg:px-8">
			<div className="max-w-4xl mx-auto">
				{/* Header */}
				<div className="mb-6">
					<Link
						href={`/experiences/${experienceId}`}
						className="inline-flex items-center gap-2 text-gray-10 hover:text-gray-12 transition-colors mb-4"
					>
						<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
						</svg>
						Back to Inbox
					</Link>
					<h1 className="text-6 font-bold text-gray-12 tracking-tight">
						Compose New Email
					</h1>
				</div>

				{/* Compose Form */}
				<div className="bg-gray-2 border border-gray-5 rounded-xl p-6 shadow-sm">
					<h2 className="text-4 font-semibold text-gray-12 mb-4">New Message</h2>
					<p className="text-3 text-gray-10 mb-4">
						Sending as: <span className="font-medium text-gray-12">{formattedFromEmail}</span>
					</p>

					<form action={handleEmailSend.bind(null, userId, experienceId)} className="space-y-4">
						<input type="hidden" name="fromEmail" value={formattedFromEmail} />

						{/* To Field */}
						<div>
							<label htmlFor="recipientEmail" className="block text-3 font-medium text-gray-12 mb-2">
								To
							</label>
							<input
								type="email"
								id="recipientEmail"
								name="recipientEmail"
								placeholder="recipient@example.com"
								required
								className="flex h-12 w-full rounded-xl border border-gray-6 bg-gray-1 px-3 py-2 text-sm shadow-sm transition-all duration-200 placeholder:text-gray-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-8 focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:border-gray-7 disabled:cursor-not-allowed disabled:opacity-50 text-gray-12"
							/>
						</div>

						{/* Subject Field */}
						<div>
							<label htmlFor="emailSubject" className="block text-3 font-medium text-gray-12 mb-2">
								Subject
							</label>
							<input
								type="text"
								id="emailSubject"
								name="emailSubject"
								placeholder="Enter email subject..."
								required
								className="flex h-12 w-full rounded-xl border border-gray-6 bg-gray-1 px-3 py-2 text-sm shadow-sm transition-all duration-200 placeholder:text-gray-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-8 focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:border-gray-7 disabled:cursor-not-allowed disabled:opacity-50 text-gray-12"
							/>
						</div>

						{/* Message Body */}
						<div>
							<label htmlFor="emailText" className="block text-3 font-medium text-gray-12 mb-2">
								Message
							</label>
							<textarea
								id="emailText"
								name="emailText"
								rows={12}
								placeholder="Type your message here..."
								required
								className="flex min-h-[200px] w-full rounded-xl border border-gray-6 bg-gray-1 px-3 py-2 text-base shadow-sm transition-colors placeholder:text-gray-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-8 focus-visible:border-accent-8 disabled:cursor-not-allowed disabled:opacity-50 text-gray-12"
							/>
						</div>

						<div className="flex items-center gap-3 pt-4">
							<SubmitButton
								variant="primary"
								size="default"
								className="h-12"
								loadingText="Sending..."
							>
								<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
								</svg>
								Send Email
							</SubmitButton>
							<Link href={`/experiences/${experienceId}`}>
								<Button
									variant="secondary"
									size="default"
									className="h-12"
								>
									Cancel
								</Button>
							</Link>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
}
