import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { auth } from "@/lib/auth/auth";
import { headers } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";

// Nucleo icon imports
import ArrowBoldRight from "@/components/icons/arrow-bold-right";
import Envelope2 from "@/components/icons/envelope-2";
import Globe2 from "@/components/icons/globe-2";
import BoltLightning from "@/components/icons/bolt-lightning";
import CircleSparkle from "@/components/icons/circle-sparkle";
import Check2 from "@/components/icons/check-2";
import InboundIcon from "@/components/icons/inbound";
import Code2 from "@/components/icons/code-2";
import Timer from "@/components/icons/timer";
import Database2 from "@/components/icons/database-2";
import ShieldCheck from "@/components/icons/shield-check";
import Microchip from "@/components/icons/microchip";
import Gear2 from "@/components/icons/gear-2";
import SackDollar from "@/components/icons/sack-dollar";
import ChartActivity2 from "@/components/icons/chart-activity-2";

export const metadata: Metadata = {
	title:
		"Email Processing Examples - Real-World Use Cases for Inbound Email API | inbound",
	description:
		"Discover 6 powerful real-world examples of email processing automation. From customer support to e-commerce, see how businesses use inbound email APIs to automate workflows and boost productivity.",
	keywords: [
		"email processing examples",
		"inbound email use cases",
		"email automation examples",
		"customer support email automation",
		"email to webhook examples",
		"email API use cases",
		"email workflow automation",
		"inbound email processing",
		"email parsing examples",
		"email integration examples",
		"business email automation",
		"email-driven workflows",
		"automated email handling",
		"email processing patterns",
		"enterprise email automation",
		"email API integration examples",
		"real-world email automation",
		"email processing solutions",
	],
	openGraph: {
		title: "Email Processing Examples - Real-World Use Cases for Businesses",
		description:
			"Discover 6 powerful real-world examples of email processing automation. See how businesses automate customer support, lead generation, monitoring, and more with inbound email APIs.",
		type: "website",
		url: "https://inbound.new/examples",
	},
	twitter: {
		card: "summary_large_image",
		title: "Email Processing Examples - Real-World Use Cases",
		description:
			"Discover 6 powerful real-world examples of email processing automation. From customer support to e-commerce workflows.",
	},
	alternates: {
		canonical: "https://inbound.new/examples",
	},
};

export default async function ExamplesPage() {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	return (
		<div className="min-h-screen bg-background text-foreground">
			{/* Main Content */}
			<main className="px-6 py-16">
				<div className="max-w-4xl mx-auto text-center">
					{/* Hero Section */}
					<div className="mb-12">
						<h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-2">
							Examples
						</h1>
						<p className="text-base text-muted-foreground">
							Practical email workflows you can copy and adapt.
						</p>
						<div className="flex items-center justify-center gap-3 max-w-md mx-auto mt-6">
							<Input type="email" placeholder="you@company.com" />
							<Button variant="primary" asChild>
								{session ? (
									<Link href="/add">
										Try now
										<ArrowBoldRight width="12" height="12" className="ml-2" />
									</Link>
								) : (
									<Link href="/login">
										Try now
										<ArrowBoldRight width="12" height="12" className="ml-2" />
									</Link>
								)}
							</Button>
						</div>
					</div>
				</div>

				{/* Examples Grid */}
				<div className="max-w-7xl mx-auto">
					<div className="grid lg:grid-cols-2 gap-8 mb-24">
						{/* Example 1: Customer Support Automation */}
						<div className="bg-card border border-dotted border-border rounded-none p-6">
							<div className="flex items-start gap-3 mb-4">
								<Envelope2
									width="20"
									height="20"
									secondaryfill="var(--muted-foreground)"
								/>
								<div>
									<h2 className="text-base font-semibold">Support tickets</h2>
									<p className="text-sm text-muted-foreground">
										Turn support@ emails into triaged tickets.
									</p>
								</div>
							</div>

							<ul className="space-y-2 mb-4">
								<li className="flex items-center gap-2 text-sm">
									<Check2
										width="14"
										height="14"
										secondaryfill="var(--muted-foreground)"
									/>{" "}
									Auto-create tickets
								</li>
								<li className="flex items-center gap-2 text-sm">
									<Check2
										width="14"
										height="14"
										secondaryfill="var(--muted-foreground)"
									/>{" "}
									Route by priority
								</li>
								<li className="flex items-center gap-2 text-sm">
									<Check2
										width="14"
										height="14"
										secondaryfill="var(--muted-foreground)"
									/>{" "}
									Extract customer/order data
								</li>
							</ul>

							<div className="bg-muted/50 border border-dotted border-border p-3 font-mono text-xs">
								<div className="text-muted-foreground mb-2">
									// structuredEmails
								</div>
								<div className="text-accent-foreground">
									const ticket = &#123;
								</div>
								<div className="pl-4">
									<div>subject: email.subject,</div>
									<div>from: email.fromData.address,</div>
									<div>priority: extractPriority(email.textBody)</div>
								</div>
								<div className="text-accent-foreground">&#125;</div>
							</div>
						</div>

						{/* Example 2: Lead Generation & CRM */}
						<div className="bg-card border border-dotted border-border rounded-none p-6">
							<div className="flex items-start gap-3 mb-4">
								<Globe2
									width="20"
									height="20"
									secondaryfill="var(--muted-foreground)"
								/>
								<div>
									<h2 className="text-base font-semibold">Leads to CRM</h2>
									<p className="text-sm text-muted-foreground">
										Qualify inbound leads from contact@.
									</p>
								</div>
							</div>

							<ul className="space-y-2 mb-4">
								<li className="flex items-center gap-2 text-sm">
									<Check2
										width="14"
										height="14"
										secondaryfill="var(--muted-foreground)"
									/>{" "}
									Parse contact submissions
								</li>
								<li className="flex items-center gap-2 text-sm">
									<Check2
										width="14"
										height="14"
										secondaryfill="var(--muted-foreground)"
									/>{" "}
									Score and assign owner
								</li>
								<li className="flex items-center gap-2 text-sm">
									<Check2
										width="14"
										height="14"
										secondaryfill="var(--muted-foreground)"
									/>{" "}
									Sync to CRM
								</li>
							</ul>

							<div className="bg-muted/50 border border-dotted border-border p-3 font-mono text-xs">
								<div className="text-muted-foreground mb-2">
									// structuredEmails
								</div>
								<div className="text-accent-foreground">
									const lead = &#123;
								</div>
								<div className="pl-4">
									<div>email: email.fromData.address,</div>
									<div>company: extractCompany(email.textBody),</div>
									<div>score: scoreLead(email.textBody)</div>
								</div>
								<div className="text-accent-foreground">&#125;</div>
							</div>
						</div>

						{/* Example 3: System Monitoring & DevOps */}
						<div className="bg-card border border-dotted border-border rounded-none p-6">
							<div className="flex items-start gap-3 mb-4">
								<ShieldCheck
									width="20"
									height="20"
									secondaryfill="var(--muted-foreground)"
								/>
								<div>
									<h2 className="text-base font-semibold">Monitoring alerts</h2>
									<p className="text-sm text-muted-foreground">
										Convert alerts to incidents with owners.
									</p>
								</div>
							</div>

							<ul className="space-y-2 mb-4">
								<li className="flex items-center gap-2 text-sm">
									<Check2
										width="14"
										height="14"
										secondaryfill="var(--muted-foreground)"
									/>{" "}
									Parse alert emails
								</li>
								<li className="flex items-center gap-2 text-sm">
									<Check2
										width="14"
										height="14"
										secondaryfill="var(--muted-foreground)"
									/>{" "}
									Route by severity
								</li>
								<li className="flex items-center gap-2 text-sm">
									<Check2
										width="14"
										height="14"
										secondaryfill="var(--muted-foreground)"
									/>{" "}
									Notify on Slack
								</li>
							</ul>

							<div className="bg-muted/50 border border-dotted border-border p-3 font-mono text-xs">
								<div className="text-muted-foreground mb-2">
									// structuredEmails
								</div>
								<div className="text-accent-foreground">
									const incident = &#123;
								</div>
								<div className="pl-4">
									<div>severity: extractSeverity(email.subject),</div>
									<div>service: parseService(email.textBody),</div>
									<div>assignee: route(email.textBody)</div>
								</div>
								<div className="text-accent-foreground">&#125;</div>
							</div>
						</div>

						{/* Example 4: E-commerce Order Processing */}
						<div className="bg-card border border-dotted border-border rounded-none p-6">
							<div className="flex items-start gap-3 mb-4">
								<SackDollar
									width="20"
									height="20"
									secondaryfill="var(--muted-foreground)"
								/>
								<div>
									<h2 className="text-base font-semibold">Orders</h2>
									<p className="text-sm text-muted-foreground">
										Sync order emails to your system.
									</p>
								</div>
							</div>

							<ul className="space-y-2 mb-4">
								<li className="flex items-center gap-2 text-sm">
									<Check2
										width="14"
										height="14"
										secondaryfill="var(--muted-foreground)"
									/>{" "}
									Parse confirmations
								</li>
								<li className="flex items-center gap-2 text-sm">
									<Check2
										width="14"
										height="14"
										secondaryfill="var(--muted-foreground)"
									/>{" "}
									Track shipments
								</li>
								<li className="flex items-center gap-2 text-sm">
									<Check2
										width="14"
										height="14"
										secondaryfill="var(--muted-foreground)"
									/>{" "}
									Update inventory
								</li>
							</ul>

							<div className="bg-muted/50 border border-dotted border-border p-3 font-mono text-xs">
								<div className="text-muted-foreground mb-2">
									// structuredEmails
								</div>
								<div className="text-accent-foreground">
									const order = &#123;
								</div>
								<div className="pl-4">
									<div>id: extractOrderId(email.subject),</div>
									<div>status: parseOrderStatus(email.textBody),</div>
									<div>to: email.toData[0].address</div>
								</div>
								<div className="text-accent-foreground">&#125;</div>
							</div>
						</div>

						{/* Example 5: Content Management & Publishing */}
						<div className="bg-card border border-dotted border-border rounded-none p-6">
							<div className="flex items-start gap-3 mb-4">
								<Code2
									width="20"
									height="20"
									secondaryfill="var(--muted-foreground)"
								/>
								<div>
									<h2 className="text-base font-semibold">Content</h2>
									<p className="text-sm text-muted-foreground">
										Publish posts from editor@ inbox.
									</p>
								</div>
							</div>

							<ul className="space-y-2 mb-4">
								<li className="flex items-center gap-2 text-sm">
									<Check2
										width="14"
										height="14"
										secondaryfill="var(--muted-foreground)"
									/>{" "}
									Convert to Markdown
								</li>
								<li className="flex items-center gap-2 text-sm">
									<Check2
										width="14"
										height="14"
										secondaryfill="var(--muted-foreground)"
									/>{" "}
									Extract tags
								</li>
								<li className="flex items-center gap-2 text-sm">
									<Check2
										width="14"
										height="14"
										secondaryfill="var(--muted-foreground)"
									/>{" "}
									Auto-publish
								</li>
							</ul>

							<div className="bg-muted/50 border border-dotted border-border p-3 font-mono text-xs">
								<div className="text-muted-foreground mb-2">
									// structuredEmails
								</div>
								<div className="text-accent-foreground">
									const content = &#123;
								</div>
								<div className="pl-4">
									<div>title: email.subject,</div>
									<div>author: email.fromData.name,</div>
									<div>body: toMarkdown(email.textBody)</div>
								</div>
								<div className="text-accent-foreground">&#125;</div>
							</div>
						</div>

						{/* Example 6: AI-Powered Email Classification */}
						<div className="bg-card border border-dotted border-border rounded-none p-6">
							<div className="flex items-start gap-3 mb-4">
								<Microchip
									width="20"
									height="20"
									secondaryfill="var(--muted-foreground)"
								/>
								<div>
									<h2 className="text-base font-semibold">AI routing</h2>
									<p className="text-sm text-muted-foreground">
										Label, prioritize, and auto-reply.
									</p>
								</div>
							</div>

							<ul className="space-y-2 mb-4">
								<li className="flex items-center gap-2 text-sm">
									<Check2
										width="14"
										height="14"
										secondaryfill="var(--muted-foreground)"
									/>{" "}
									Intent + sentiment
								</li>
								<li className="flex items-center gap-2 text-sm">
									<Check2
										width="14"
										height="14"
										secondaryfill="var(--muted-foreground)"
									/>{" "}
									Smart replies
								</li>
								<li className="flex items-center gap-2 text-sm">
									<Check2
										width="14"
										height="14"
										secondaryfill="var(--muted-foreground)"
									/>{" "}
									Team routing
								</li>
							</ul>

							<div className="bg-muted/50 border border-dotted border-border p-3 font-mono text-xs">
								<div className="text-muted-foreground mb-2">
									// structuredEmails
								</div>
								<div className="text-accent-foreground">
									const analysis = &#123;
								</div>
								<div className="pl-4">
									<div>intent: classify(email.textBody),</div>
									<div>sentiment: sentiment(email.textBody),</div>
									<div>priority: priorityScore(email.textBody)</div>
								</div>
								<div className="text-accent-foreground">&#125;</div>
							</div>
						</div>
					</div>
				</div>

				{/* Implementation Guide Section */}
				<div className="max-w-6xl mx-auto mb-24">
					<div className="text-center mb-8">
						<h2 className="text-xl font-semibold mb-2">Implement in minutes</h2>
						<p className="text-sm text-muted-foreground">
							Use the SDK + a webhook to handle any example.
						</p>
					</div>

					{/* Code Example */}
					<div className="bg-card border border-dotted border-border rounded-none">
						<div className="px-4 py-3 border-b border-dotted border-border bg-muted/50">
							<h3 className="text-sm font-medium">Universal handler</h3>
						</div>
						<div className="p-4 font-mono text-xs">
							<pre className="text-accent-foreground whitespace-pre-wrap">
								{`import { Inbound } from 'inboundemail'

const inbound = new Inbound()

// Set up webhook for any use case
app.post('/webhook/email', async (req, res) => {
  const { email }: InboundWebhookPayload = req.body // structuredEmails
  
  // Universal email data extraction
  const emailData = {
    from: email.fromData.address,
    subject: email.subject,
    content: email.textBody,
    attachments: email.attachments,
    timestamp: email.date
  }
  
  // Route based on your use case
  switch (detectUseCase(emailData)) {
    case 'support':
      await handleSupportTicket(emailData)
      break
    case 'lead':
      await processLead(emailData)
      break
    case 'monitor':
      await createIncident(emailData)
      break
    case 'order':
      await updateOrderStatus(emailData)
      break
    default:
      await processGenericEmail(emailData)
  }
  
  res.status(200).json({ success: true })
})`}
							</pre>
						</div>
					</div>
				</div>

				{/* Industries Section */}
				<div className="max-w-6xl mx-auto mb-24">
					<div className="text-center mb-8">
						<h2 className="text-xl font-semibold mb-2">Where it fits</h2>
						<p className="text-sm text-muted-foreground">
							Teams across industries automate with inbound email.
						</p>
					</div>

					<div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
						<div className="bg-card border border-dotted border-border rounded-none p-4 text-center">
							<div className="text-2xl mb-3">🛒</div>
							<h4 className="font-semibold mb-2">E-commerce</h4>
							<p className="text-sm text-muted-foreground">
								Order processing, returns, customer support automation
							</p>
						</div>

						<div className="bg-card border border-dotted border-border rounded-none p-4 text-center">
							<div className="text-2xl mb-3">🏥</div>
							<h4 className="font-semibold mb-2">Healthcare</h4>
							<p className="text-sm text-muted-foreground">
								Patient communications, appointment scheduling, lab results
							</p>
						</div>

						<div className="bg-card border border-dotted border-border rounded-none p-4 text-center">
							<div className="text-2xl mb-3">🏢</div>
							<h4 className="font-semibold mb-2">SaaS</h4>
							<p className="text-sm text-muted-foreground">
								User onboarding, support ticketing, usage notifications
							</p>
						</div>

						<div className="bg-card border border-dotted border-border rounded-none p-4 text-center">
							<div className="text-2xl mb-3">💰</div>
							<h4 className="font-semibold mb-2">Finance</h4>
							<p className="text-sm text-muted-foreground">
								Transaction alerts, compliance reporting, customer inquiries
							</p>
						</div>

						<div className="bg-card border border-dotted border-border rounded-none p-4 text-center">
							<div className="text-2xl mb-3">🎓</div>
							<h4 className="font-semibold mb-2">Education</h4>
							<p className="text-sm text-muted-foreground">
								Student communications, grade notifications, enrollment
								processing
							</p>
						</div>

						<div className="bg-card border border-dotted border-border rounded-none p-4 text-center">
							<div className="text-2xl mb-3">🏠</div>
							<h4 className="font-semibold mb-2">Real Estate</h4>
							<p className="text-sm text-muted-foreground">
								Lead qualification, property inquiries, document processing
							</p>
						</div>

						<div className="bg-card border border-dotted border-border rounded-none p-4 text-center">
							<div className="text-2xl mb-3">📰</div>
							<h4 className="font-semibold mb-2">Media</h4>
							<p className="text-sm text-muted-foreground">
								Content submissions, subscription management, reader engagement
							</p>
						</div>

						<div className="bg-card border border-dotted border-border rounded-none p-4 text-center">
							<div className="text-2xl mb-3">⚙️</div>
							<h4 className="font-semibold mb-2">DevOps</h4>
							<p className="text-sm text-muted-foreground">
								System monitoring, incident management, deployment notifications
							</p>
						</div>
					</div>
				</div>

				{/* CTA Section */}
				<div className="max-w-4xl mx-auto text-center">
					<div className="border border-dotted border-border rounded-none p-8">
						<h2 className="text-xl font-semibold mb-2">Start building</h2>
						<p className="text-sm text-muted-foreground mb-6">
							5,000 emails free. Type-safe SDK. Examples included.
						</p>
						<div className="flex items-center gap-3 max-w-md mx-auto">
							<Input type="email" placeholder="your-workflow@example.com" />
							<Button variant="primary" asChild>
								{session ? (
									<Link href="/add">
										Get started
										<ArrowBoldRight width="12" height="12" className="ml-2" />
									</Link>
								) : (
									<Link href="/login">
										Get started
										<ArrowBoldRight width="12" height="12" className="ml-2" />
									</Link>
								)}
							</Button>
						</div>
					</div>
				</div>
			</main>

			{/* Footer */}
			<footer className="border-t border-border bg-sidebar py-12">
				<div className="max-w-6xl mx-auto px-6">
					<div className="flex flex-col md:flex-row justify-between items-center">
						<div className="flex items-center gap-3 mb-4 md:mb-0">
							<InboundIcon width={32} height={32} />
							<span className="text-xl font-semibold">inbound</span>
						</div>
						<div className="flex gap-8 text-sm text-muted-foreground">
							<Link
								href="https://inbound.new/docs"
								className="hover:text-foreground transition-colors"
							>
								Docs
							</Link>
							<Link
								href="/pricing"
								className="hover:text-foreground transition-colors"
							>
								Pricing
							</Link>
							<Link
								href="/privacy"
								className="hover:text-foreground transition-colors"
							>
								Privacy
							</Link>
							<Link
								href="/terms"
								className="hover:text-foreground transition-colors"
							>
								Terms
							</Link>
							<a
								href="mailto:support@inbound.new"
								className="hover:text-foreground transition-colors"
							>
								Support
							</a>
						</div>
					</div>
					<div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
						© {new Date().getFullYear()} inbound. Real-world email automation
						examples for modern developers.
					</div>
				</div>
			</footer>
		</div>
	);
}
