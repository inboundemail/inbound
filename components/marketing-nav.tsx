import Link from "next/link";

interface MarketingNavProps {
	isLoggedIn?: boolean;
}

export function MarketingNav({ isLoggedIn = false }: MarketingNavProps) {
	return (
		<header className="py-6 flex items-center justify-between">
			<Link href="/" className="flex items-center gap-2.5">
				<svg
					width="22"
					height="22"
					viewBox="0 0 134 134"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						opacity="0.5"
						d="M0 90.9294L43.0709 134L55.4167 68.1611C55.7302 66.489 55.1984 64.7698 53.9954 63.5669L19.7548 29.3272C16.8242 26.3967 11.8088 27.9483 11.045 32.0218L0 90.9294Z"
						fill="#8161FF"
					/>
					<path
						d="M43.072 134L0.00113678 90.9288L65.8393 78.5842C67.5114 78.2706 69.2305 78.8025 70.4334 80.0054L104.674 114.245C107.605 117.175 106.053 122.191 101.979 122.955L43.072 134Z"
						fill="#8161FF"
					/>
					<path
						opacity="0.5"
						d="M90.9291 0L134.001 43.0721L68.1618 55.4168C66.4897 55.7303 64.7707 55.1984 63.5677 53.9955L29.3281 19.7559C26.3975 16.8253 27.949 11.8098 32.0225 11.046L90.9291 0Z"
						fill="#8161FF"
					/>
					<path
						d="M78.5864 65.8407C78.2729 67.5128 78.8047 69.2319 80.0077 70.4348L114.247 104.674C117.178 107.605 122.193 106.053 122.957 101.98L134.002 43.0723L90.9311 0.00140381L78.5864 65.8407Z"
						fill="#8161FF"
					/>
				</svg>
				<span className="font-outfit font-semibold text-[20px]">inbound</span>
			</Link>
			<nav className="flex items-center gap-5 text-sm">
				<Link
					href="/docs"
					className="text-[#3f3f46] hover:text-[#1c1917] transition-colors"
				>
					docs
				</Link>
				<Link
					href="/pricing"
					className="text-[#3f3f46] hover:text-[#1c1917] transition-colors"
				>
					pricing
				</Link>
				<Link
					href="/blog"
					className="text-[#3f3f46] hover:text-[#1c1917] transition-colors"
				>
					blog
				</Link>
				{isLoggedIn ? (
					<Link
						href="/logs"
						className="bg-[#8161FF] hover:bg-[#6b4fd9] text-white px-4 py-2 rounded-lg transition-colors"
					>
						Dashboard
					</Link>
				) : (
					<Link
						href="/login"
						className="bg-[#8161FF] hover:bg-[#6b4fd9] text-white px-4 py-2 rounded-lg transition-colors"
					>
						Log in
					</Link>
				)}
			</nav>
		</header>
	);
}

export function MarketingFooter() {
	return (
		<footer className="py-12 border-t border-[#e7e5e4] mt-8">
			<div className="flex items-center justify-between text-sm text-[#52525b]">
				<div className="flex items-center gap-4">
					<span>© {new Date().getFullYear()} Inbound</span>
					<Link href="/terms" className="hover:text-[#1c1917]">
						Terms
					</Link>
					<Link href="/privacy" className="hover:text-[#1c1917]">
						Privacy
					</Link>
				</div>
				<a
					href="https://status.inbound.new"
					target="_blank"
					rel="noopener noreferrer"
					className="hover:text-[#1c1917]"
				>
					Status
				</a>
			</div>
		</footer>
	);
}
