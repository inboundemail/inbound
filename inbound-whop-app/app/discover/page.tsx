export default function DiscoverPage() {
	return (
		<div className="min-h-screen bg-gray-1 py-12 px-4 sm:px-6 lg:px-8">
			<div className="max-w-5xl mx-auto">
				{/* Header Section */}
				<div className="mb-8">
					<h1 className="text-8 font-bold text-gray-12 mb-2 tracking-tight text-center">
						Inbound Email Management
					</h1>
					<p className="text-4 text-gray-10 text-center font-medium">
						Transform your email workflow with powerful automation and insights
					</p>
				</div>

				{/* Main Description Card */}
				<div className="bg-gray-2 border border-gray-5 rounded-xl p-8 shadow-sm text-center mb-8">
					<div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-accent-8 to-accent-9 rounded-full flex items-center justify-center shadow-lg">
						<svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
						</svg>
					</div>
					<h2 className="text-6 font-bold text-gray-12 mb-4 tracking-tight">
						Streamline Your Email Operations
					</h2>
					<p className="text-4 text-gray-10 max-w-3xl mx-auto mb-6 leading-relaxed">
						Manage, respond to, and analyze your emails with powerful automation tools. 
						Perfect for creators who need to handle customer support, sales inquiries, 
						and community engagement at scale.
					</p>
					<div className="bg-accent-2 border border-accent-6 rounded-xl p-4 max-w-2xl mx-auto">
						<p className="text-3 text-accent-11 font-semibold mb-1">
							💡 Pro Tip
						</p>
						<p className="text-3 text-accent-10">
							Connect your domain and start receiving emails instantly. Use our SDK 
							to build custom workflows that save hours of manual work.
						</p>
					</div>
				</div>

				{/* Key Features Section */}
				<div className="mb-8">
					<h2 className="text-6 font-bold text-gray-12 mb-6 text-center tracking-tight">
						Powerful Features for Email Management
					</h2>
					<div className="grid md:grid-cols-3 gap-6 mb-8">
						<div className="bg-gray-2 border border-gray-5 rounded-xl p-6 shadow-sm">
							<div className="w-12 h-12 mb-4 bg-blue-2 border border-blue-6 rounded-lg flex items-center justify-center">
								<svg className="h-6 w-6 text-blue-9" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
								</svg>
							</div>
							<h3 className="text-4 font-semibold text-gray-12 mb-2">
								Smart Replies
							</h3>
							<p className="text-3 text-gray-10 leading-relaxed">
								Respond to emails directly from your dashboard with automatic threading and "sent via whop" signatures.
							</p>
						</div>
						<div className="bg-gray-2 border border-gray-5 rounded-xl p-6 shadow-sm">
							<div className="w-12 h-12 mb-4 bg-green-2 border border-green-6 rounded-lg flex items-center justify-center">
								<svg className="h-6 w-6 text-green-9" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
								</svg>
							</div>
							<h3 className="text-4 font-semibold text-gray-12 mb-2">
								Advanced Search
							</h3>
							<p className="text-3 text-gray-10 leading-relaxed">
								Find emails instantly with powerful search and filtering options. Filter by attachments, read status, and more.
							</p>
						</div>
						<div className="bg-gray-2 border border-gray-5 rounded-xl p-6 shadow-sm">
							<div className="w-12 h-12 mb-4 bg-purple-2 border border-purple-6 rounded-lg flex items-center justify-center">
								<svg className="h-6 w-6 text-purple-9" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
								</svg>
							</div>
							<h3 className="text-4 font-semibold text-gray-12 mb-2">
								SDK Integration
							</h3>
							<p className="text-3 text-gray-10 leading-relaxed">
								Build custom workflows with our powerful SDK. Perfect for automating responses and integrating with your existing tools.
							</p>
						</div>
					</div>
				</div>

				<h2 className="text-6 font-bold text-gray-12 mb-6 text-center tracking-tight">
					Success Stories from Creators
				</h2>

				{/* Success Stories Cards */}
				<div className="grid md:grid-cols-2 gap-6 mb-8">
					{/* Success Story Card 1 */}
					<div className="bg-gray-2 border border-gray-5 rounded-xl p-6 shadow-sm flex flex-col justify-between">
						<div>
							<div className="flex items-center gap-3 mb-4">
								<div className="w-10 h-10 bg-gradient-to-br from-blue-8 to-blue-9 rounded-full flex items-center justify-center">
									<span className="text-white font-bold text-2">CK</span>
								</div>
								<div>
									<h3 className="text-4 font-bold text-gray-12">
										CryptoKings
									</h3>
									<p className="text-2 text-gray-8">Trading Community</p>
								</div>
							</div>
							<p className="text-3 text-gray-10 mb-4 leading-relaxed">
								"Streamlined our customer support with automated email responses. 
								Grew to <span className="font-semibold text-accent-9">2,500+ members</span> and 
								<span className="font-semibold text-accent-9">$18,000+/mo</span> revenue. 
								Members love getting instant responses to their questions!"
							</p>
							<div className="flex items-center gap-4 text-2 text-gray-8 mb-4">
								<div className="flex items-center gap-1">
									<svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
									</svg>
									2,500+ members
								</div>
								<div className="flex items-center gap-1">
									<svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
									</svg>
									$18K+/mo
								</div>
							</div>
						</div>
						<a
							href="https://whop.com/cryptokings/?a=inbound_email"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center justify-center gap-2 bg-accent-9 hover:bg-accent-10 text-white font-medium py-2 px-4 rounded-lg transition-colors text-3"
						>
							Visit CryptoKings
							<svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
							</svg>
						</a>
					</div>

					{/* Success Story Card 2 */}
					<div className="bg-gray-2 border border-gray-5 rounded-xl p-6 shadow-sm flex flex-col justify-between">
						<div>
							<div className="flex items-center gap-3 mb-4">
								<div className="w-10 h-10 bg-gradient-to-br from-green-8 to-green-9 rounded-full flex items-center justify-center">
									<span className="text-white font-bold text-2">SP</span>
								</div>
								<div>
									<h3 className="text-4 font-bold text-gray-12">
										SignalPro
									</h3>
									<p className="text-2 text-gray-8">Premium Signals</p>
								</div>
							</div>
							<p className="text-3 text-gray-10 mb-4 leading-relaxed">
								"Email automation helped us scale customer onboarding. 
								Retention jumped to <span className="font-semibold text-accent-9">92%</span> 
								and our affiliate program brought in 
								<span className="font-semibold text-accent-9">$4,000+</span> last quarter 
								through automated email sequences."
							</p>
							<div className="flex items-center gap-4 text-2 text-gray-8 mb-4">
								<div className="flex items-center gap-1">
									<svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
									</svg>
									92% retention
								</div>
								<div className="flex items-center gap-1">
									<svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
									</svg>
									$4K+ affiliate
								</div>
							</div>
						</div>
						<a
							href="https://whop.com/signalpro/?a=inbound_email"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center justify-center gap-2 bg-accent-9 hover:bg-accent-10 text-white font-medium py-2 px-4 rounded-lg transition-colors text-3"
						>
							Visit SignalPro
							<svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
							</svg>
						</a>
					</div>
				</div>

				{/* Call to Action */}
				<div className="bg-gradient-to-br from-accent-2 to-accent-3 border border-accent-6 rounded-xl p-8 text-center">
					<h3 className="text-5 font-bold text-accent-12 mb-3 tracking-tight">
						Ready to Transform Your Email Workflow?
					</h3>
					<p className="text-3 text-accent-11 mb-6 max-w-2xl mx-auto leading-relaxed">
						Join hundreds of creators who have streamlined their email operations 
						with our powerful automation tools. Get started in minutes.
					</p>
					<a
						href="https://inbound.new"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center justify-center gap-2 bg-accent-9 hover:bg-accent-10 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-4 shadow-lg"
					>
						Get Started Free
						<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
						</svg>
					</a>
				</div>
			</div>
		</div>
	);
}
