import { ArrowRight, LockKeyhole, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

const AUTH_ERRORS: Record<string, string> = {
	access_denied: "Access was cancelled. Nothing was shared.",
	invalid_oauth_state: "The sign-in request expired. Start again to continue.",
	missing_authorization_code: "Inbound did not return an authorization code.",
	oauth_not_configured: "OAuth credentials have not been connected yet.",
	token_exchange_failed: "Inbound could not complete the token exchange.",
	userinfo_failed: "Inbound could not load your account details.",
	oauth_callback_failed: "Sign-in could not be completed. Please try again.",
};

export function LoginScreen({ error }: { error?: string | null }) {
	return (
		<main className="login-screen">
			<section className="login-card">
				<div className="login-brand">
					<BrandMark className="login-mark" />
					<span>Inbound Mail</span>
				</div>
				<div className="login-copy">
					<p className="eyebrow">Your mail, at the speed of thought</p>
					<h1>A calmer inbox for everything that matters.</h1>
					<p>
						Sign in with Inbound and choose exactly which domains this mail client
						can access.
					</p>
				</div>
				{error ? <p className="login-error" role="alert">{AUTH_ERRORS[error] ?? "Sign-in could not be completed. Please try again."}</p> : null}
				<a className="primary-action login-action" href="/api/auth/inbound/start">
					<span>Sign in with Inbound</span>
					<ArrowRight size={17} strokeWidth={2} />
				</a>
				<div className="login-notes">
					<span><LockKeyhole size={14} /> Domain-scoped access</span>
					<span><Sparkles size={14} /> Local-first speed</span>
				</div>
			</section>
		</main>
	);
}
