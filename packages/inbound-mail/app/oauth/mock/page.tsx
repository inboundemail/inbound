import { BrandMark } from "@/components/brand-mark";

export default async function MockOAuthConsentPage({
	searchParams,
}: {
	searchParams: Promise<{ state?: string; error?: string }>;
}) {
	const { state = "", error } = await searchParams;
	return (
		<main className="mock-consent-screen">
			<section className="mock-consent-card">
				<header className="mock-consent-brand">
					<BrandMark />
					<div>
						<strong>Sign in with Inbound</strong>
						<span>Local OAuth preview</span>
					</div>
				</header>
				<div className="mock-consent-copy">
					<p className="eyebrow">Inbound Mail</p>
					<h1>Choose the mail this app can access.</h1>
					<p>
						Inbound Mail will be able to read and send email only for the
						domains you approve here.
					</p>
				</div>
				<form action="/api/auth/mock/authorize" method="post">
					<input name="state" type="hidden" value={state} />
					<fieldset className="mock-domain-list">
						<legend>Domain access</legend>
						<label>
							<input defaultChecked name="domain" type="checkbox" value="inbound.new" />
							<span><strong>inbound.new</strong><small>Primary domain</small></span>
						</label>
						<label>
							<input defaultChecked name="domain" type="checkbox" value="northstar.studio" />
							<span><strong>northstar.studio</strong><small>Design workspace</small></span>
						</label>
					</fieldset>
					{error ? <p className="mock-consent-error">Choose at least one domain.</p> : null}
					<div className="mock-consent-actions">
						<button className="text-button" name="decision" type="submit" value="cancel">Cancel</button>
						<button className="primary-action" name="decision" type="submit" value="allow">Allow access</button>
					</div>
				</form>
				<p className="mock-consent-note">Development-only preview. No external data is accessed.</p>
			</section>
		</main>
	);
}
