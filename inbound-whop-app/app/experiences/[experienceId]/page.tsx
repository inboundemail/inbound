import { whopSdk } from "@/lib/whop-sdk";
import { headers } from "next/headers";
import { getApiKey, saveApiKey } from "@/app/actions/apiManagement";
import { redirect } from "next/navigation";
import { Button } from "../../components/button";
import Image from "next/image";

const mockEmails = [
	{
		id: "1",
		from: "support@whop.com",
		senderName: "Whop Support",
		subject: "Welcome to your new experience!",
		preview: "Thanks for joining. Here's what you need to know...",
		time: "2 hours ago",
		isRead: false,
		hasAttachments: false,
	},
	{
		id: "2",
		from: "notifications@whop.com",
		senderName: "Whop Notifications",
		subject: "New features available in your dashboard",
		preview: "Check out the latest updates to improve your workflow...",
		time: "5 hours ago",
		isRead: true,
		hasAttachments: true,
		attachmentCount: 2,
	},
	{
		id: "3",
		from: "billing@whop.com",
		senderName: "Whop Billing",
		subject: "Your subscription has been confirmed",
		preview: "Your payment was successful. View your receipt...",
		time: "1 day ago",
		isRead: true,
		hasAttachments: false,
	},
	{
		id: "4",
		from: "team@whop.com",
		senderName: "Whop Team",
		subject: "Tips to get the most out of your experience",
		preview: "Here are 5 ways to maximize your membership...",
		time: "2 days ago",
		isRead: false,
		hasAttachments: false,
	},
];

// Generate consistent color based on sender name
const getAvatarColor = (name: string) => {
	const colors = [
		'#6366f1', // indigo
		'#8b5cf6', // violet  
		'#06b6d4', // cyan
		'#10b981', // emerald
		'#f59e0b', // amber
		'#ef4444', // red
		'#ec4899', // pink
		'#84cc16', // lime
	];
	const hash = name.split('').reduce((a, b) => {
		a = ((a << 5) - a) + b.charCodeAt(0);
		return a & a;
	}, 0);
	return colors[Math.abs(hash) % colors.length];
};

// Get initials from name
const getInitials = (name: string) => {
	const words = name.trim().split(/\s+/);
	if (words.length >= 2) {
		return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
	} else {
		return name.slice(0, 2).toUpperCase();
	}
};

// Server action to handle API key submission
async function handleApiKeySubmission(userId: string, formData: FormData) {
	'use server'

	const apiKey = formData.get('apiKey') as string;
	const experienceId = formData.get('experienceId') as string;

	if (!apiKey || apiKey.trim() === '') {
		// Could implement error handling here - for now we'll just return
		return;
	}

	const result = await saveApiKey({
		lookupId: userId,
		apiKey: apiKey.trim()
	});

	if (result.success) {
		// Redirect to refresh the page and check the API key again
		redirect(`/experiences/${experienceId}`);
	}

	// For errors, we could implement toast notifications or error handling
	// For now, we'll just return without action
}

export default async function ExperiencePage({
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

	let doesUserHaveInboundApiKey = false;
	const apiKey = await getApiKey(userId);
	if (apiKey.success) {
		doesUserHaveInboundApiKey = true;
	}

	// Either: 'admin' | 'customer' | 'no_access';
	// 'admin' means the user is an admin of the whop, such as an owner or moderator
	// 'customer' means the user is a common member in this whop
	// 'no_access' means the user does not have access to the whop
	const { accessLevel } = result;


	const unreadCount = mockEmails.filter(email => !email.isRead).length;

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
		return (
			<div className="min-h-screen bg-gray-1 py-12 px-4 sm:px-6 lg:px-8">
				<div className="max-w-5xl mx-auto">
					<div className="bg-gradient-to-br from-gray-2 to-gray-3 border border-gray-6 rounded-xl p-8 shadow-lg">
						<div className="text-center">
							<div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-accent-8 to-accent-9 rounded-full flex items-center justify-center shadow-lg">
								<Image src="/api-icon.png" alt="Inbound Logo" width={64} height={64} />
							</div>
							<h3 className="text-6 font-bold text-gray-12 mb-2 tracking-tight">
								API Key Required
							</h3>
							<p className="text-4 text-gray-10 mb-6 max-w-md mx-auto leading-relaxed">
								To access your inbox, you'll need an Inbound API key. This connects your Whop experience to your email service.
							</p>
							<form action={handleApiKeySubmission.bind(null, userId)} className="space-y-6">
								<input type="hidden" name="experienceId" value={experienceId} />

								<div className="space-y-4">
									<div>
										<label htmlFor="apiKey" className="block text-3 font-semibold text-gray-12 mb-2">
											Enter your Inbound API Key
										</label>
										<input
											type="text"
											id="apiKey"
											name="apiKey"
											placeholder="sk-..."
											required
											className="flex h-12 w-full rounded-xl border border-gray-6 bg-gray-1 px-4 py-3 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-8 focus-visible:border-accent-8 disabled:cursor-not-allowed disabled:opacity-50 text-gray-12"
										/>
									</div>

									<Button
										type="submit"
										variant="primary"
										size="lg"
										className="w-full"
									>
										<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
										</svg>
										Save API Key
									</Button>
								</div>
							</form>

							<div className="mt-8 pt-6 border-t border-gray-6">
								<div className="bg-blue-2 border border-blue-6 rounded-xl p-4 mb-4">
									<div className="flex items-center gap-3 flex-col">
										<p className="text-3 font-semibold text-blue-11 mb-1">Don&apos;t have an API key?</p>
										<p className="text-3 text-blue-10 leading-relaxed">
											Visit your Inbound settings page to generate a new API key.
										</p>
									</div>
								</div>

								<Button
									variant="ghost"
									size="lg"
									asChild
								>
									<a
										href="https://inbound.new/settings"
										target="_blank"
										rel="noopener noreferrer"
									>
										<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
										</svg>
										Get API Key from Inbound Settings
										<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
										</svg>
									</a>
								</Button>
							</div>
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gray-1 py-12 px-4 sm:px-6 lg:px-8">
			<div className="max-w-5xl mx-auto">
				{/* Header Section */}
				<div className="mb-6">
					<div className="flex items-center justify-between">
						<div>
							<h2 className="text-8 font-bold text-gray-12 mb-1 tracking-tight">
								{experience.name} ({unreadCount} unread)
							</h2>
							<p className="text-4 text-gray-10 font-medium">
								Welcome {user.name} · Access Level: {accessLevel}
							</p>
						</div>
						{unreadCount > 0 && (
							<Button variant="primary" size="default">
								<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
								</svg>
								Mark all as read
							</Button>
						)}
					</div>
				</div>

				{/* Search and Filters */}
				<div className="mb-6">
					<div className="flex items-center gap-3">
						<div className="relative flex-1">
							<svg className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
							</svg>
							<input
								type="text"
								placeholder="Search messages..."
								className="flex h-9 w-full rounded-xl border border-gray-6 bg-gray-2 px-3 py-1 pl-10 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-8 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-8 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm text-gray-12"
							/>
						</div>
						<div className="relative">
							<select className="flex h-9 items-center justify-between whitespace-nowrap rounded-xl border border-gray-6 bg-gray-2 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-accent-8 disabled:cursor-not-allowed disabled:opacity-50 text-gray-12 appearance-none pr-8">
								<option value="all">All Messages</option>
								<option value="unread">Unread</option>
								<option value="attachments">With Attachments</option>
							</select>
							<svg className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
							</svg>
						</div>
					</div>
				</div>

				{/* Email List */}
				<div className="space-y-3">
					{mockEmails.map((email) => {
						const initials = getInitials(email.senderName);
						const avatarColor = getAvatarColor(email.senderName);

						return (
							<div
								key={email.id}
								className={`flex items-center gap-4 p-4 bg-gray-2 hover:bg-gray-3 transition-all duration-200 border border-gray-5 rounded-xl cursor-pointer group shadow-sm hover:shadow-md ${!email.isRead ? 'border-l-4 border-l-accent-9' : ''
									}`}
							>
								{/* Avatar */}
								<div
									className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-3 flex-shrink-0 shadow-sm"
									style={{ backgroundColor: avatarColor }}
								>
									{initials}
								</div>

								{/* Email content */}
								<div className="flex-1 min-w-0">
									<div className="flex items-center justify-between gap-4">
										{/* Sender and Subject */}
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2 mb-1">
												<span className={`text-3 truncate ${email.isRead ? 'font-medium text-gray-10' : 'font-semibold text-gray-12'}`}>
													{email.senderName}
												</span>
												{email.hasAttachments && (
													<span className="inline-flex items-center gap-1 bg-blue-2 text-blue-9 border border-blue-6 text-2 rounded-full px-2 py-0.5 font-medium">
														<svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
														</svg>
														{email.attachmentCount}
													</span>
												)}
												{!email.isRead && (
													<div className="w-2 h-2 bg-accent-9 rounded-full shadow-sm"></div>
												)}
											</div>
											<div className={`text-3 truncate ${email.isRead ? 'text-gray-10' : 'text-gray-12 font-medium'}`}>
												{email.subject}
											</div>
											<div className="text-2 text-gray-8 truncate mt-1">
												{email.preview}
											</div>
										</div>

										{/* Time */}
										<div className="text-right flex-shrink-0">
											<div className="text-2 text-gray-8 whitespace-nowrap font-medium">
												{email.time}
											</div>
										</div>
									</div>
								</div>
							</div>
						);
					})}
				</div>

				{/* Pagination */}
				<div className="bg-gray-2 border border-gray-5 rounded-xl p-4 mt-6 shadow-sm">
					<div className="flex items-center justify-between">
						<div className="text-3 text-gray-10 font-medium">
							Showing 1 to 4 of 4 messages
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="secondary"
								size="default"
								disabled
							>
								Previous
							</Button>
							<Button
								variant="secondary"
								size="default"
								disabled
							>
								Next
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
