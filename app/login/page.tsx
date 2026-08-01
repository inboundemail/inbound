import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginContent } from "@/components/marketing/login-content";
import { auth } from "@/lib/auth/auth";

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ redirect?: string | string[] }>;
}) {
	const params = await searchParams;
	const requestedRedirect = Array.isArray(params.redirect)
		? params.redirect[0]
		: params.redirect;
	const callbackURL =
		requestedRedirect?.startsWith("/") && !requestedRedirect.startsWith("//")
			? requestedRedirect
			: "/logs";
	const session = await auth.api
		.getSession({
			headers: await headers(),
		})
		.catch(() => null);

	if (session?.user) {
		redirect(callbackURL);
	}

	return (
		<div className="min-h-screen w-full lg:grid lg:grid-cols-2">
			{/* Left Side - Mountain Background */}
			<div
				className="hidden lg:block relative h-full w-full overflow-hidden"
				style={{
					backgroundImage:
						"url('/ghostinfernox_generate_a_mountain_based_login_page_background_23188943-1946-4e43-8d85-1a8d89482214_1.png')",
					backgroundSize: "cover",
					backgroundPosition: "center",
				}}
			/>

			{/* Right Side - Content */}
			<div
				className="flex items-center justify-center p-8 bg-background relative min-h-screen overflow-hidden"
				style={{ overscrollBehaviorY: "none" }}
			>
				<BackgroundSvg />
				{/* Content Container */}
				<LoginContent />
			</div>
		</div>
	);
}

function BackgroundSvg() {
	return (
		<svg
			width="100%"
			height="100%"
			viewBox="0 0 1920 1080"
			xmlns="http://www.w3.org/2000/svg"
			className="absolute inset-0 pointer-events-none opacity-50"
			preserveAspectRatio="xMidYMid slice"
		>
			<rect
				width="100%"
				height="100%"
				fill="url(#dotPattern)"
				mask="url(#circleMask)"
			/>
			<defs>
				<pattern
					id="dotPattern"
					width="14"
					height="14"
					patternUnits="userSpaceOnUse"
				>
					<circle cx="7" cy="7" r="2" className="fill-foreground/10" />
				</pattern>
				<mask id="circleMask">
					<circle
						filter="blur(100px)"
						cx="50%"
						cy="50%"
						r="340"
						fill="url(#white-linear-gradient)"
					/>
				</mask>
				<linearGradient id="white-linear-gradient" x1="0" y1="0" x2="0" y2="1">
					<stop offset="10%" stopColor="black" />
					<stop offset="100%" stopColor="white" />
				</linearGradient>
			</defs>
		</svg>
	);
}
