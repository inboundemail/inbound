import { whopSdk } from "@/lib/whop-sdk";
import { headers } from "next/headers";
import { getApiKey } from "@/app/actions/apiManagement";
import { getEmailDetails, replyToEmail, type EmailDetailsResponse } from "@/app/actions/emailManagement";
import { redirect } from "next/navigation";
import { Button } from "../../../../components/button";
import Link from "next/link";

// Server action to handle email reply
async function handleEmailReply(
	userId: string, 
	emailId: string, 
	experienceId: string, 
	formData: FormData
) {
	'use server'

	const replyText = formData.get('replyText') as string;
	const replySubject = formData.get('replySubject') as string;
	const recipientEmail = formData.get('recipientEmail') as string;
	const fromEmail = formData.get('fromEmail') as string;

	if (!replyText || replyText.trim() === '') {
		// Could implement error handling here
		return;
	}

	const result = await replyToEmail(userId, emailId, {
		from: fromEmail.trim(),
		to: recipientEmail,
		subject: replySubject,
		textBody: `${replyText.trim()}\n\nsent via whop`,
		htmlBody: `<p>${replyText.trim().replace(/\n/g, '<br>')}</p><br><br><p><em>sent via whop</em></p>`
	});

	if (result.success) {
		// Redirect back to the email list
		redirect(`/experiences/${experienceId}`);
	}

	// For errors, we could implement toast notifications or error handling
	// For now, we'll just return without action
}

export default async function EmailDetailPage({
	params,
}: {
	params: Promise<{ experienceId: string; emailId: string }>;
}) {
	// The headers contains the user token
	const headersList = await headers();

	// The experienceId and emailId are path params
	const { experienceId, emailId } = await params;

	// The user token is in the headers
	const { userId } = await whopSdk.verifyUserToken(headersList);

	const result = await whopSdk.access.checkIfUserHasAccessToExperience({
		userId,
		experienceId,
	});

	const user = await whopSdk.users.getUser({ userId });
	const experience = await whopSdk.experiences.getExperience({ experienceId });

	let doesUserHaveInboundApiKey = false;
	const apiKey = await getApiKey(userId);
	if (apiKey.success) {
		doesUserHaveInboundApiKey = true;
	}

	// Either: 'admin' | 'customer' | 'no_access';
	const { accessLevel } = result;

	// Fetch email details if user has API key
	let emailDetails: EmailDetailsResponse | null = null;
	let emailError: string | null = null;

	if (doesUserHaveInboundApiKey) {
		const emailResponse = await getEmailDetails(userId, emailId);

		if (emailResponse.success && emailResponse.data) {
			emailDetails = emailResponse.data;
		} else {
			emailError = emailResponse.error || 'Failed to fetch email details';
		}
	}

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

	if (!doesUserHaveInboundApiKey) {
		redirect(`/experiences/${experienceId}`);
	}

	console.log("emailDetails", emailDetails?.content.htmlBody);

	if (emailError || !emailDetails) {
		return (
			<div className="min-h-screen bg-gray-1 py-12 px-4 sm:px-6 lg:px-8">
				<div className="max-w-5xl mx-auto">
					<div className="mb-6">
						<Link 
							href={`/experiences/${experienceId}`}
							className="inline-flex items-center gap-2 text-gray-10 hover:text-gray-12 transition-colors"
						>
							<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
							</svg>
							Back to Inbox
						</Link>
					</div>
					<div className="bg-red-2 border border-red-6 rounded-xl p-6 shadow-sm">
						<div className="flex items-center gap-2 text-red-9">
							<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							<span className="font-medium">Error loading email: {emailError || 'Email not found'}</span>
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
						{emailDetails.subject}
					</h1>
				</div>

				{/* Card 1: Email Details & Message */}
				<div className="bg-gray-2 border border-gray-5 rounded-xl p-6 mb-6 shadow-sm">
					<div className="mb-4">
						<div className="text-4 font-semibold text-gray-12 mb-1">
							From: {emailDetails.from}
						</div>
						<div className="text-3 text-gray-10 mb-1">
							To: {emailDetails.to}
						</div>
						<div className="text-3 text-gray-10">
							Received: {new Date(emailDetails.receivedAt).toLocaleString()}
						</div>
					</div>

					<div className="border-t border-gray-4 pt-4">
						<h3 className="text-4 font-semibold text-gray-12 mb-3">Message</h3>
						<div className="bg-gray-1 border border-gray-4 rounded-lg p-4">
							{emailDetails.content.htmlBody ? (
								<div 
									dangerouslySetInnerHTML={{ __html: emailDetails.content.htmlBody }}
									className="prose prose-sm max-w-none text-gray-12"
								/>
							) : (
								<pre className="whitespace-pre-wrap text-3 text-gray-12 font-sans">
									{emailDetails.content.textBody}
								</pre>
							)}
						</div>
					</div>
				</div>

				{/* Card 2: Reply Form */}
				<div className="bg-gray-2 border border-gray-5 rounded-xl p-6 shadow-sm">
					<h2 className="text-4 font-semibold text-gray-12 mb-4">Reply</h2>
					
					<form action={handleEmailReply.bind(null, userId, emailId, experienceId)} className="space-y-4">
						<input type="hidden" name="recipientEmail" value={emailDetails.from} />
						<input type="hidden" name="replySubject" value={`Re: ${emailDetails.subject}`} />
						<input type="hidden" name="fromEmail" value={emailDetails.to} />

						<div>
							<textarea
								name="replyText"
								rows={6}
								placeholder="Type your reply here..."
								required
								className="flex min-h-[120px] w-full rounded-xl border border-gray-6 bg-gray-1 px-3 py-2 text-base shadow-sm transition-colors placeholder:text-gray-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-8 focus-visible:border-accent-8 disabled:cursor-not-allowed disabled:opacity-50 text-gray-12"
							/>
						</div>

						<div className="flex items-center gap-3">
							<Button
								type="submit"
								variant="primary"
								size="default"
							>
								Send Reply
							</Button>
							<Link href={`/experiences/${experienceId}`}>
								<Button
									variant="secondary"
									size="default"
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