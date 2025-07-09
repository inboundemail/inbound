import { whopSdk } from "@/lib/whop-sdk";
import { headers } from "next/headers";

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

	// Either: 'admin' | 'customer' | 'no_access';
	// 'admin' means the user is an admin of the whop, such as an owner or moderator
	// 'customer' means the user is a common member in this whop
	// 'no_access' means the user does not have access to the whop
	const { accessLevel } = result;

	// Mock email data for placeholder
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
							<button className="appearance-none inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium relative cursor-pointer select-none touch-manipulation border-none transition-all duration-200 ease-out focus-visible:outline-none disabled:pointer-events-none bg-gradient-to-b from-[#8466ff] to-[#6C47FF] text-white shadow-[0_4px_12px_rgba(0,0,0,0.3),inset_0_-1px_0.5px_1px_rgba(40,27,93,0.15),inset_0_1px_0.5px_1px_rgba(255,255,255,0.2)] hover:from-[#7557ff] hover:to-[#5d3eff] active:from-[#6647ff] active:to-[#4e35ff] active:shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_2px_rgba(40,27,93,0.3)] text-sm leading-5 px-4 py-2">
								<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
								</svg>
								Mark all as read
							</button>
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
								className={`flex items-center gap-4 p-4 bg-gray-2 hover:bg-gray-3 transition-all duration-200 border border-gray-5 rounded-xl cursor-pointer group shadow-sm hover:shadow-md ${
									!email.isRead ? 'border-l-4 border-l-accent-9' : ''
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
							<button 
								className="appearance-none inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium relative cursor-pointer select-none touch-manipulation border-none transition-all duration-200 ease-out focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-gradient-to-b from-slate-100 to-slate-200 text-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.1),inset_0_-1px_0.5px_1px_rgba(0,0,0,0.05),inset_0_1px_0.5px_1px_rgba(255,255,255,0.8)] hover:from-slate-200 hover:to-slate-300 active:from-slate-300 active:to-slate-400 active:shadow-[0_1px_4px_rgba(0,0,0,0.15),inset_0_1px_2px_rgba(0,0,0,0.1)] text-sm leading-5 px-4 py-2" 
								disabled
							>
								Previous
							</button>
							<button 
								className="appearance-none inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium relative cursor-pointer select-none touch-manipulation border-none transition-all duration-200 ease-out focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-gradient-to-b from-slate-100 to-slate-200 text-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.1),inset_0_-1px_0.5px_1px_rgba(0,0,0,0.05),inset_0_1px_0.5px_1px_rgba(255,255,255,0.8)] hover:from-slate-200 hover:to-slate-300 active:from-slate-300 active:to-slate-400 active:shadow-[0_1px_4px_rgba(0,0,0,0.15),inset_0_1px_2px_rgba(0,0,0,0.1)] text-sm leading-5 px-4 py-2" 
								disabled
							>
								Next
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
