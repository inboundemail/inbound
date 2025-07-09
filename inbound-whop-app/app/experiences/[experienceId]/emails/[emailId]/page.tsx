import { whopSdk } from "@/lib/whop-sdk";
import { headers } from "next/headers";
import { getApiKey } from "@/app/actions/apiManagement";
import { redirect } from "next/navigation";
import { Button } from "../../../../components/button";
import Link from "next/link";

const mockEmails = [
	{
		id: "1",
		from: "support@whop.com",
		senderName: "Whop Support",
		subject: "Welcome to your new experience!",
		preview: "Thanks for joining. Here's what you need to know...",
		content: `<p>Hi there!</p>
		
		<p>Welcome to your new Whop experience! We're excited to have you on board.</p>
		
		<p>Here's what you need to know to get started:</p>
		
		<ul>
			<li>Access your dashboard anytime through the main menu</li>
			<li>Check your notifications for important updates</li>
			<li>Explore the features available in your plan</li>
			<li>Reach out to support if you have any questions</li>
		</ul>
		
		<p>We're here to help you make the most of your experience!</p>
		
		<p>Best regards,<br>The Whop Team</p>`,
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
		content: `<p>Hello!</p>
		
		<p>We've just rolled out some exciting new features to your dashboard that we think you'll love:</p>
		
		<h3>📊 Enhanced Analytics</h3>
		<p>Get deeper insights into your performance with our new analytics dashboard. Track engagement, growth, and key metrics all in one place.</p>
		
		<h3>🔔 Smart Notifications</h3>
		<p>Stay on top of important updates with our improved notification system. You'll never miss a critical message again.</p>
		
		<h3>🎨 Customizable Interface</h3>
		<p>Personalize your dashboard with new themes and layout options. Make it truly yours!</p>
		
		<p>Log in to your dashboard to explore these new features.</p>
		
		<p>Happy building!<br>The Whop Team</p>`,
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
		content: `<p>Thank you for your payment!</p>
		
		<p>Your subscription has been confirmed and is now active. Here are the details:</p>
		
		<div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
			<h3>Subscription Details</h3>
			<p><strong>Plan:</strong> Pro Monthly</p>
			<p><strong>Amount:</strong> $29.99</p>
			<p><strong>Billing Period:</strong> Monthly</p>
			<p><strong>Next Billing Date:</strong> January 15, 2024</p>
		</div>
		
		<p>Your receipt has been sent to your email address. You can also download it from your billing dashboard.</p>
		
		<p>If you have any questions about your subscription or billing, don't hesitate to reach out to our support team.</p>
		
		<p>Thank you for choosing Whop!</p>
		
		<p>Best regards,<br>Whop Billing Team</p>`,
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
		content: `<p>Hey there!</p>
		
		<p>We want to make sure you're getting the most value from your Whop experience. Here are 5 tips to help you maximize your membership:</p>
		
		<h3>1. 🎯 Set Clear Goals</h3>
		<p>Define what you want to achieve with your membership. Having clear objectives will help you stay focused and motivated.</p>
		
		<h3>2. 📚 Explore All Resources</h3>
		<p>Take time to browse through all available resources. You might discover valuable content you didn't know existed.</p>
		
		<h3>3. 🤝 Connect with the Community</h3>
		<p>Engage with other members. The community is one of the most valuable aspects of any experience.</p>
		
		<h3>4. 📝 Take Action</h3>
		<p>Don't just consume content - implement what you learn. Action is where the real value lies.</p>
		
		<h3>5. 🔄 Stay Consistent</h3>
		<p>Regular engagement yields better results than sporadic intense sessions.</p>
		
		<p>We're rooting for your success!</p>
		
		<p>Cheers,<br>The Whop Team</p>`,
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

// Server action to handle email response
async function handleEmailResponse(formData: FormData) {
	'use server'
	
	const response = formData.get('response') as string;
	const emailId = formData.get('emailId') as string;
	
	// Here you would implement the actual email response logic
	// For now, we'll just simulate a successful response
	console.log(`Response to email ${emailId}: ${response}`);
	
	// In a real implementation, you might:
	// 1. Send the response via your email service
	// 2. Store the response in the database
	// 3. Update the email thread
	// 4. Send notifications
}

export default async function EmailViewPage({
	params,
}: {
	params: Promise<{ experienceId: string; emailId: string }>;
}) {
	const headersList = await headers();
	const { experienceId, emailId } = await params;

	// Verify user access
	const { userId } = await whopSdk.verifyUserToken(headersList);
	
	const result = await whopSdk.access.checkIfUserHasAccessToExperience({
		userId,
		experienceId,
	});

	const user = await whopSdk.users.getUser({ userId });
	const experience = await whopSdk.experiences.getExperience({ experienceId });

	// Check if user has API key
	const apiKey = await getApiKey(userId);
	if (!apiKey.success) {
		redirect(`/experiences/${experienceId}`);
	}

	if (!result.hasAccess) {
		redirect(`/experiences/${experienceId}`);
	}

	// Find the email by ID
	const email = mockEmails.find(e => e.id === emailId);
	
	if (!email) {
		return (
			<div className="min-h-screen bg-gray-1 py-12 px-4 sm:px-6 lg:px-8">
				<div className="max-w-5xl mx-auto">
					<div className="bg-red-2 border border-red-6 rounded-xl p-6 shadow-sm">
						<div className="flex items-center gap-2 text-red-9">
							<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
							</svg>
							<span className="font-medium">Email not found.</span>
						</div>
					</div>
				</div>
			</div>
		);
	}

	const initials = getInitials(email.senderName);
	const avatarColor = getAvatarColor(email.senderName);

	return (
		<div className="min-h-screen bg-gray-1 py-12 px-4 sm:px-6 lg:px-8">
			<div className="max-w-5xl mx-auto">
				{/* Header with back button */}
				<div className="mb-6">
					<div className="flex items-center gap-4 mb-4">
						<Link href={`/experiences/${experienceId}`}>
							<Button variant="ghost" size="default">
								<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
								</svg>
								Back to Inbox
							</Button>
						</Link>
						<div className="text-3 text-gray-10 font-medium">
							{experience.name}
						</div>
					</div>
				</div>

				{/* Email Header and Content */}
				<div className="bg-gray-2 border border-gray-5 rounded-xl p-6 mb-6 shadow-sm">
					{/* Email Header */}
					<div className="flex items-start gap-4 mb-6 pb-6 border-b border-gray-6">
						{/* Avatar */}
						<div
							className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-4 flex-shrink-0 shadow-sm"
							style={{ backgroundColor: avatarColor }}
						>
							{initials}
						</div>

						{/* Email Header Info */}
						<div className="flex-1 min-w-0">
							<div className="flex items-start justify-between gap-4">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 mb-1">
										<h1 className="text-6 font-bold text-gray-12 truncate">
											{email.subject}
										</h1>
										{!email.isRead && (
											<div className="w-2 h-2 bg-accent-9 rounded-full shadow-sm flex-shrink-0"></div>
										)}
									</div>
									<div className="flex items-center gap-2 text-4 text-gray-10 mb-2">
										<span className="font-medium">{email.senderName}</span>
										<span>&lt;{email.from}&gt;</span>
									</div>
									<div className="flex items-center gap-4 text-3 text-gray-8">
										<span>To: {user.name}</span>
										<span>{email.time}</span>
										{email.hasAttachments && (
											<span className="inline-flex items-center gap-1 bg-blue-2 text-blue-9 border border-blue-6 rounded-full px-2 py-0.5 font-medium">
												<svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
												</svg>
												{email.attachmentCount} attachment{email.attachmentCount !== 1 ? 's' : ''}
											</span>
										)}
									</div>
								</div>
								<div className="flex items-center gap-2">
									<Button variant="ghost" size="sm">
										<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
										</svg>
									</Button>
									<Button variant="ghost" size="sm">
										<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
										</svg>
									</Button>
								</div>
							</div>
						</div>
					</div>

					{/* Email Content */}
					<div 
						className="prose prose-gray max-w-none text-gray-12"
						dangerouslySetInnerHTML={{ __html: email.content }}
					/>
				</div>

				{/* Response Form */}
				<div className="bg-gray-2 border border-gray-5 rounded-xl p-6 shadow-sm">
					<h3 className="text-5 font-semibold text-gray-12 mb-4">Reply</h3>
					<form action={handleEmailResponse} className="space-y-4">
						<input type="hidden" name="emailId" value={emailId} />
						
						<div>
							<label htmlFor="response" className="block text-3 font-medium text-gray-12 mb-2">
								Your Response
							</label>
							<textarea
								id="response"
								name="response"
								rows={6}
								placeholder="Type your response..."
								className="flex min-h-[120px] w-full rounded-xl border border-gray-6 bg-gray-1 px-4 py-3 text-base shadow-sm transition-colors placeholder:text-gray-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-8 focus-visible:border-accent-8 disabled:cursor-not-allowed disabled:opacity-50 resize-none text-gray-12"
								required
							/>
						</div>
						
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Button type="button" variant="ghost" size="sm">
									<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
									</svg>
									Attach File
								</Button>
								<Button type="button" variant="ghost" size="sm">
									<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m3 0H4a1 1 0 000 2h1v10a2 2 0 002 2h10a2 2 0 002-2V6h1a1 1 0 100-2h-3z" />
									</svg>
									Format
								</Button>
							</div>
							
							<div className="flex items-center gap-2">
								<Button type="button" variant="ghost" size="default">
									Save Draft
								</Button>
								<Button type="submit" variant="primary" size="default">
									<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
									</svg>
									Send Reply
								</Button>
							</div>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
} 