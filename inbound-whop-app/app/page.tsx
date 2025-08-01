import Image from "next/image";

export default function Page() {
	return (
		<div className="min-h-screen bg-gray-1 py-12 px-4 sm:px-6 lg:px-8">
			<div className="max-w-4xl mx-auto">
				<div className="text-center mb-12">
					<h1 className="text-8 font-bold text-gray-12 mb-4 tracking-tight flex items-center justify-center gap-2">

						the
						<Image src="/whoplogo.png" alt="Whop Logo" width={30} height={30} className="rounded-sm" />
						whop 🤝
						<Image src="https://inbound.new/inbound-logo-3.png" alt="Whop Logo" width={30} height={30} />
						inbound app
					</h1>
					<p className="text-4 text-gray-10 max-w-2xl mx-auto leading-relaxed">
						Connect your email management system to Whop in minutes. Follow these steps to get started.
					</p>
				</div>
				<div className="bg-gray-2 border border-gray-5 rounded-xl p-6 shadow-sm">
					install into your whop today! using the link below.
				</div>
			</div>
		</div>
	);
}
