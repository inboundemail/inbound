import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PricingTable } from "@/components/autumn/pricing-table-format";
import ArrowBoldRight from "@/components/icons/arrow-bold-right";
import Envelope2 from "@/components/icons/envelope-2";
import Globe2 from "@/components/icons/globe-2";
import CircleCheck from "@/components/icons/circle-check";
import BoltLightning from "@/components/icons/bolt-lightning";
import ArrowBoldDown from "@/components/icons/arrow-bold-down";
import Code2 from "@/components/icons/code-2";
import Star2 from "@/components/icons/star-2";
import Gear2 from "@/components/icons/gear-2";
import ShieldCheck from "@/components/icons/shield-check";
import Clock2 from "@/components/icons/clock-2";
import Refresh2 from "@/components/icons/refresh-2";
import Database2 from "@/components/icons/database-2";
import Cube2 from "@/components/icons/cube-2";
import Terminal from "@/components/icons/terminal";
import File2 from "@/components/icons/file-2";
import ExternalLink2 from "@/components/icons/external-link-2";
import { auth } from "@/lib/auth/auth";
import { headers } from "next/headers";
import CustomInboundIcon from "@/components/icons/customInbound";
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Email to Webhook Service - Convert Emails to HTTP Webhooks | Inbound",
  description:
    "Turn any email address into a powerful webhook endpoint. Built for developers with TypeScript SDK, REST API, and reliable webhook delivery. Start processing emails as structured data in minutes.",
  keywords: [
    "email to webhook",
    "email webhook service",
    "email API",
    "webhook email processing",
    "email to HTTP",
    "developers email API",
    "TypeScript email SDK",
    "structured email data",
    "email parsing service",
    "email infrastructure",
    "webhook email forwarding",
    "email automation API",
    "programmatic email handling",
    "email webhooks for developers",
  ],
  openGraph: {
    title: "Email to Webhook Service - Convert Emails to HTTP Webhooks",
    description:
      "Turn any email address into a powerful webhook endpoint. Built for developers with TypeScript SDK, REST API, and reliable webhook delivery.",
    url: "https://inbound.new/email-as-webhook",
    siteName: "Inbound",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Inbound - Email to Webhook Service",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Email to Webhook Service - Convert Emails to HTTP Webhooks",
    description:
      "Turn any email address into a powerful webhook endpoint. Built for developers with TypeScript SDK, REST API, and reliable webhook delivery.",
    images: ["/twitter-image.png"],
  },
  alternates: {
    canonical: "https://inbound.new/email-as-webhook",
  },
};

export default async function EmailAsWebhookPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return (
    <div className="min-h-screen bg-white">
      {/* Main Content */}
      <main className="px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          {/* Hero Section */}
          <div className="mb-16">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              email
              <CustomInboundIcon
                className="inline-block ml-4 mr-2 align-bottom opacity-0 animate-[fadeInRotate_1s_ease-out_0.5s_forwards]"
                backgroundColor="#1C2894"
                Icon={Envelope2}
                size={48}
              />
              to
              <CustomInboundIcon
                className="inline-block ml-4 mr-2 align-bottom opacity-0 animate-[fadeInRotate_1s_ease-out_1s_forwards]"
                backgroundColor="#6C47FF"
                Icon={BoltLightning}
                size={48}
              />
              <span className="text-[#6C47FF]">webhook</span>
              <br />
              <span className="text-[#1C2894]">service</span>
            </h1>
            <p className="text-xl text-gray-600 mb-4 max-w-2xl mx-auto leading-relaxed">
              turn any email address into a powerful webhook endpoint. built for
              developers with typescript SDK, REST API, and reliable webhook
              delivery. start processing emails as structured data in minutes.
            </p>

            <div className="flex items-center gap-4 max-w-md mx-auto mt-4">
              <Input type="email" placeholder="support@yourapp.com" />
              <Button variant="primary" asChild>
                {session ? (
                  <Link href="/add">
                    Start Free
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                ) : (
                  <Link href="/login">
                    Start Free
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                )}
              </Button>
            </div>
          </div>

          {/* How It Works Demo */}
          <div className="mb-32 text-left">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
              how it works
            </h2>

            {/* Step 1: Email Arrives */}
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-8 mb-8">
              <div className="flex items-center gap-4 mb-6">
                <CustomInboundIcon
                  backgroundColor="#10b981"
                  Icon={Envelope2}
                  size={40}
                />
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    1. Email Arrives
                  </h3>
                  <p className="text-gray-600">
                    Customer sends email to support@yourapp.com
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-lg p-4 border border-gray-200 font-mono text-sm">
                <div className="text-gray-500 mb-2">Incoming Email:</div>
                <div className="text-gray-800">
                  <div>
                    <strong>From:</strong> customer@company.com
                  </div>
                  <div>
                    <strong>To:</strong> support@yourapp.com
                  </div>
                  <div>
                    <strong>Subject:</strong> Need help with integration
                  </div>
                  <div className="mt-2 text-gray-600">
                    Hi team, I'm having trouble with the API...
                  </div>
                </div>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex items-center justify-center py-4">
              <ArrowBoldDown width="24" height="24" className="text-gray-400" />
            </div>

            {/* Step 2: Parse & Structure */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-8 mb-8">
              <div className="flex items-center gap-4 mb-6">
                <CustomInboundIcon
                  backgroundColor="#6C47FF"
                  Icon={Gear2}
                  size={40}
                />
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    2. Parse & Structure
                  </h3>
                  <p className="text-gray-600">
                    Inbound parses email into structured, type-safe data
                  </p>
                </div>
              </div>

              <div className="bg-gray-900 rounded-lg p-4 text-green-400 font-mono text-sm">
                <div className="text-gray-400 mb-2">
                  // Parsed Email Data (TypeScript)
                </div>
                <div>{`{`}</div>
                <div className="ml-4">
                  <div>messageId: "abc123...",</div>
                  <div>
                    from:{" "}
                    {`{ address: "customer@company.com", name: "John Doe" }`},
                  </div>
                  <div>to: {`[{ address: "support@yourapp.com" }]`},</div>
                  <div>subject: "Need help with integration",</div>
                  <div>textBody: "Hi team, I'm having trouble...",</div>
                  <div>
                    htmlBody: "{"<p>"}Hi team...{"</p>"}",
                  </div>
                  <div>attachments: [],</div>
                  <div>headers: {`{ ... }`}</div>
                </div>
                <div>{`}`}</div>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex items-center justify-center py-4">
              <ArrowBoldDown width="24" height="24" className="text-gray-400" />
            </div>

            {/* Step 3: Webhook Delivery */}
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-8">
              <div className="flex items-center gap-4 mb-6">
                <CustomInboundIcon
                  backgroundColor="#3b82f6"
                  Icon={BoltLightning}
                  size={40}
                />
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    3. Webhook Delivery
                  </h3>
                  <p className="text-gray-600">
                    Structured data delivered to your endpoint with retries
                  </p>
                </div>
              </div>

              <div className="bg-gray-900 rounded-lg p-4 text-blue-400 font-mono text-sm">
                <div className="text-gray-400 mb-2">
                  POST https://api.yourapp.com/webhooks/email
                </div>
                <div className="text-yellow-400">Headers:</div>
                <div className="ml-4 text-gray-300">
                  <div>Content-Type: application/json</div>
                  <div>X-Webhook-Signature: sha256=...</div>
                  <div>X-Email-ID: email_abc123</div>
                </div>
                <div className="mt-2 text-yellow-400">Body:</div>
                <div className="ml-4 text-gray-300">{`{ "event": "email.received", "email": { ... } }`}</div>
              </div>
            </div>
          </div>

          {/* Features Grid */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">
              built for developers
            </h2>
            <p className="text-lg text-gray-600 mb-12 text-center max-w-2xl mx-auto">
              everything you need to integrate email processing into your
              application
            </p>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {/* TypeScript SDK */}
              <div className="bg-white rounded-xl p-6 border border-purple-200 shadow-sm hover:shadow-lg transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <CustomInboundIcon
                    backgroundColor="#6C47FF"
                    Icon={Code2}
                    size={40}
                  />
                  <h3 className="text-xl font-bold text-gray-900">
                    TypeScript SDK
                  </h3>
                </div>
                <p className="text-gray-600 mb-4">
                  Fully typed SDK with auto-completion and error handling
                  built-in.
                </p>
                <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400">
                  <div>npm install exon-inbound</div>
                  <div className="mt-1 text-gray-400">
                    // Full type safety included
                  </div>
                </div>
              </div>

              {/* REST API */}
              <div className="bg-white rounded-xl p-6 border border-blue-200 shadow-sm hover:shadow-lg transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <CustomInboundIcon
                    backgroundColor="#3b82f6"
                    Icon={Globe2}
                    size={40}
                  />
                  <h3 className="text-xl font-bold text-gray-900">REST API</h3>
                </div>
                <p className="text-gray-600 mb-4">
                  Standard REST endpoints for any language or framework.
                </p>
                <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-blue-400">
                  <div>GET /api/v1/emails</div>
                  <div>POST /api/v1/domains</div>
                  <div>PUT /api/v1/webhooks/:id</div>
                </div>
              </div>

              {/* Structured Data */}
              <div className="bg-white rounded-xl p-6 border border-green-200 shadow-sm hover:shadow-lg transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <CustomInboundIcon
                    backgroundColor="#10b981"
                    Icon={Database2}
                    size={40}
                  />
                  <h3 className="text-xl font-bold text-gray-900">
                    Structured Data
                  </h3>
                </div>
                <p className="text-gray-600 mb-4">
                  Parsed email content with headers, attachments, and metadata.
                </p>
                <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400">
                  <div>interface ParsedEmail {`{`}</div>
                  <div className="ml-2">from: EmailAddress</div>
                  <div className="ml-2">subject: string</div>
                  <div>{`}`}</div>
                </div>
              </div>

              {/* Reliable Delivery */}
              <div className="bg-white rounded-xl p-6 border border-orange-200 shadow-sm hover:shadow-lg transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <CustomInboundIcon
                    backgroundColor="#f97316"
                    Icon={Refresh2}
                    size={40}
                  />
                  <h3 className="text-xl font-bold text-gray-900">
                    Reliable Delivery
                  </h3>
                </div>
                <p className="text-gray-600 mb-4">
                  Automatic retries, exponential backoff, and delivery tracking.
                </p>
                <div className="flex items-center gap-2">
                  <CircleCheck
                    width="16"
                    height="16"
                    className="text-green-500"
                  />
                  <span className="text-sm text-gray-600">
                    99.9% delivery rate
                  </span>
                </div>
              </div>

              {/* Security */}
              <div className="bg-white rounded-xl p-6 border border-red-200 shadow-sm hover:shadow-lg transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <CustomInboundIcon
                    backgroundColor="#dc2626"
                    Icon={ShieldCheck}
                    size={40}
                  />
                  <h3 className="text-xl font-bold text-gray-900">Secure</h3>
                </div>
                <p className="text-gray-600 mb-4">
                  HMAC signatures, HTTPS-only, and spam filtering included.
                </p>
                <div className="flex items-center gap-2">
                  <CircleCheck
                    width="16"
                    height="16"
                    className="text-green-500"
                  />
                  <span className="text-sm text-gray-600">SOC 2 compliant</span>
                </div>
              </div>

              {/* Real-time */}
              <div className="bg-white rounded-xl p-6 border border-purple-200 shadow-sm hover:shadow-lg transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <CustomInboundIcon
                    backgroundColor="#8b5cf6"
                    Icon={Clock2}
                    size={40}
                  />
                  <h3 className="text-xl font-bold text-gray-900">Real-time</h3>
                </div>
                <p className="text-gray-600 mb-4">
                  Webhooks delivered within seconds of email receipt.
                </p>
                <div className="flex items-center gap-2">
                  <CircleCheck
                    width="16"
                    height="16"
                    className="text-green-500"
                  />
                  <span className="text-sm text-gray-600">
                    {"<2s"} average latency
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Code Examples */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">
              start in minutes
            </h2>
            <p className="text-lg text-gray-600 mb-12 text-center max-w-2xl mx-auto">
              three simple steps to turn your email addresses into webhook
              endpoints
            </p>

            <div className="space-y-8 max-w-4xl mx-auto text-left">
              {/* Step 1: Install SDK */}
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-8 border border-purple-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white font-bold">
                    1
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">
                    Install the SDK
                  </h3>
                </div>
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
                  <div className="text-green-400 mb-2">
                    $ npm install exon-inbound
                  </div>
                  <div className="text-gray-300">
                    <span className="text-blue-400">import</span>{" "}
                    {`{ createInboundClient }`}{" "}
                    <span className="text-blue-400">from</span>{" "}
                    <span className="text-yellow-300">'exon-inbound'</span>
                  </div>
                  <div className="text-gray-300 mt-2">
                    <span className="text-blue-400">const</span>{" "}
                    <span className="text-white">inbound</span> ={" "}
                    <span className="text-yellow-300">createInboundClient</span>
                    ({`{`}
                  </div>
                  <div className="text-gray-300 ml-4">
                    <span className="text-red-400">apiKey</span>:{" "}
                    <span className="text-green-300">
                      process.env.INBOUND_API_KEY
                    </span>
                  </div>
                  <div className="text-gray-300">{`})`}</div>
                </div>
              </div>

              {/* Step 2: Create Email + Webhook */}
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-8 border border-blue-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
                    2
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">
                    Create Email & Webhook
                  </h3>
                </div>
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
                  <div className="text-gray-400">
                    // Create a webhook endpoint
                  </div>
                  <div className="text-blue-400">const</div>{" "}
                  <span className="text-white">webhook</span> ={" "}
                  <span className="text-blue-400">await</span>{" "}
                  <span className="text-white">inbound</span>.
                  <span className="text-yellow-300">createWebhook</span>({`{`}
                  <div className="ml-4">
                    <div>
                      <span className="text-red-400">name</span>:{" "}
                      <span className="text-green-300">'Support Emails'</span>,
                    </div>
                    <div>
                      <span className="text-red-400">url</span>:{" "}
                      <span className="text-green-300">
                        'https://api.yourapp.com/webhooks/email'
                      </span>
                    </div>
                  </div>
                  <div>{`})`}</div>
                  <div className="mt-3 text-gray-400">
                    // Create email address
                  </div>
                  <div className="text-blue-400">const</div>{" "}
                  <span className="text-white">email</span> ={" "}
                  <span className="text-blue-400">await</span>{" "}
                  <span className="text-white">inbound</span>.
                  <span className="text-yellow-300">createEmail</span>({`{`}
                  <div className="ml-4">
                    <div>
                      <span className="text-red-400">domain</span>:{" "}
                      <span className="text-green-300">'yourapp.com'</span>,
                    </div>
                    <div>
                      <span className="text-red-400">email</span>:{" "}
                      <span className="text-green-300">
                        'support@yourapp.com'
                      </span>
                      ,
                    </div>
                    <div>
                      <span className="text-red-400">webhookId</span>:{" "}
                      <span className="text-white">webhook</span>.
                      <span className="text-white">id</span>
                    </div>
                  </div>
                  <div>{`})`}</div>
                </div>
              </div>

              {/* Step 3: Handle Webhooks */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-8 border border-green-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center text-white font-bold">
                    3
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">
                    Handle Incoming Webhooks
                  </h3>
                </div>
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
                  <div className="text-gray-400">// Your webhook endpoint</div>
                  <div>
                    <span className="text-blue-400">app</span>.
                    <span className="text-yellow-300">post</span>(
                    <span className="text-green-300">'/webhooks/email'</span>,{" "}
                    <span className="text-blue-400">async</span> (
                    <span className="text-white">req, res</span>) {"=>"} {`{`}
                  </div>
                  <div className="ml-4">
                    <div>
                      <span className="text-blue-400">const</span> {`{ `}
                      <span className="text-white">email</span> {`} = `}
                      <span className="text-white">req</span>.
                      <span className="text-white">body</span>
                    </div>
                    <div className="mt-2 text-gray-400">
                      // Full type safety with structured data
                    </div>
                    <div>
                      <span className="text-yellow-300">console</span>.
                      <span className="text-yellow-300">log</span>(
                      <span className="text-white">email</span>.
                      <span className="text-white">parsedData</span>.
                      <span className="text-white">from</span>.
                      <span className="text-white">address</span>)
                    </div>
                    <div>
                      <span className="text-yellow-300">console</span>.
                      <span className="text-yellow-300">log</span>(
                      <span className="text-white">email</span>.
                      <span className="text-white">parsedData</span>.
                      <span className="text-white">subject</span>)
                    </div>
                    <div>
                      <span className="text-yellow-300">console</span>.
                      <span className="text-yellow-300">log</span>(
                      <span className="text-white">email</span>.
                      <span className="text-white">parsedData</span>.
                      <span className="text-white">textBody</span>)
                    </div>
                    <div className="mt-2 text-gray-400">
                      // Process the email...
                    </div>
                    <div>
                      <span className="text-white">res</span>.
                      <span className="text-yellow-300">status</span>(
                      <span className="text-green-300">200</span>).
                      <span className="text-yellow-300">send</span>(
                      <span className="text-green-300">'OK'</span>)
                    </div>
                  </div>
                  <div>{`})`}</div>
                </div>
              </div>
            </div>

            {/* Documentation CTA */}
            <div className="mt-12 text-center">
              <Button variant="secondary" asChild className="mr-4">
                <a
                  href="https://docs.inbound.new/"
                  className="flex items-center gap-2"
                >
                  <File2 width="16" height="16" />
                  View Full Documentation
                  <ExternalLink2 width="12" height="12" />
                </a>
              </Button>
              <Button variant="secondary" asChild>
                <a
                  href="https://github.com/R44VC0RP/inbound"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <Code2 width="16" height="16" />
                  View on GitHub
                  <ExternalLink2 width="12" height="12" />
                </a>
              </Button>
            </div>
          </div>

          {/* Use Cases */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">
              perfect for
            </h2>
            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                <CustomInboundIcon
                  backgroundColor="#3b82f6"
                  Icon={Star2}
                  size={40}
                  className="mb-4"
                />
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  AI Email Processing
                </h3>
                <p className="text-gray-600">
                  Feed incoming emails directly to your AI models for
                  classification, sentiment analysis, and automated responses.
                </p>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                <CustomInboundIcon
                  backgroundColor="#10b981"
                  Icon={Gear2}
                  size={40}
                  className="mb-4"
                />
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  Customer Support
                </h3>
                <p className="text-gray-600">
                  Automatically create tickets, route emails to the right team,
                  and track response times in your CRM.
                </p>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                <CustomInboundIcon
                  backgroundColor="#f97316"
                  Icon={Envelope2}
                  size={40}
                  className="mb-4"
                />
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  Lead Generation
                </h3>
                <p className="text-gray-600">
                  Capture and qualify leads from contact forms, integrate with
                  your sales pipeline, and trigger follow-up sequences.
                </p>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                <CustomInboundIcon
                  backgroundColor="#8b5cf6"
                  Icon={Terminal}
                  size={40}
                  className="mb-4"
                />
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  DevOps & Alerts
                </h3>
                <p className="text-gray-600">
                  Parse monitoring alerts, create incidents, and integrate with
                  your existing DevOps workflow tools.
                </p>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4 text-center">
              Simple Pricing
            </h2>
            <p className="text-lg text-gray-600 mb-12 text-center max-w-2xl mx-auto">
              Start free and scale as you grow. No setup fees, no monthly
              minimums.
            </p>
            <PricingTable />
          </div>

          {/* Final CTA */}
          <div className="bg-gradient-to-br from-purple-600 via-purple-700 to-purple-900 rounded-2xl p-12 text-white">
            <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
            <p className="text-xl text-purple-100 mb-8 max-w-2xl mx-auto">
              Join thousands of developers who trust Inbound for their email
              infrastructure.
            </p>
            <div className="flex items-center gap-4 max-w-md mx-auto">
              <Input
                type="email"
                placeholder="your-email@company.com"
                className="bg-white/10 border-white/20 text-white placeholder:text-purple-200"
              />
              <Button
                variant="secondary"
                asChild
                className="bg-white text-purple-700 hover:bg-gray-100"
              >
                {session ? (
                  <Link href="/add">Get Started Free</Link>
                ) : (
                  <Link href="/login">Get Started Free</Link>
                )}
              </Button>
            </div>
            <p className="text-sm text-purple-200 mt-4">
              No credit card required • 1,000 emails/month free
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
            <img
              src="/inbound-logo-3.png"
              alt="Inbound Logo"
              className="w-6 h-6"
            />
            <span className="text-lg font-bold text-gray-900">inbound</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <a
              href="https://twitter.com/intent/follow?screen_name=inbounddotnew"
              className="hover:text-gray-700 transition-colors flex items-center gap-1"
            >
              Contact us on
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="10"
                height="10"
                fill="none"
                viewBox="0 0 1200 1227"
              >
                <path
                  fill="#000"
                  d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z"
                />
              </svg>
            </a>
            <a
              href="https://discord.gg/JVdUrY9gJZ"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-700 transition-colors flex items-center gap-1"
            >
              Discord
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0002 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9554 2.4189-2.1568 2.4189Z" />
              </svg>
            </a>
            <a
              href="/privacy"
              className="hover:text-gray-700 transition-colors"
            >
              Privacy
            </a>
            <a href="/terms" className="hover:text-gray-700 transition-colors">
              Terms
            </a>
            <a
              href="https://docs.inbound.new/"
              className="hover:text-gray-700 transition-colors"
            >
              Docs
            </a>
            <a
              href="mailto:support@inbound.exon.dev"
              className="hover:text-gray-700 transition-colors"
            >
              Support
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
