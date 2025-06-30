import { Metadata } from 'next'
import { HiMail, HiLightningBolt, HiGlobeAlt, HiCog, HiCheckCircle, HiArrowRight, HiShieldCheck, HiCube, HiCollection, HiLightBulb, HiChartBar, HiClock, HiExclamationTriangle, HiCode, HiFilter, HiDatabase, HiCloudUpload } from "react-icons/hi"

export const metadata: Metadata = {
  title: 'What is Inbound Email Processing? Complete Guide to Email APIs | Inbound',
  description: 'Learn about inbound email processing, how email-to-webhook services work, and why businesses use email APIs for automation. Complete guide with examples.',
  keywords: 'inbound email, email processing, email API, email webhooks, email automation, email parsing, email gateway, email integration',
  openGraph: {
    title: 'What is Inbound Email Processing? Complete Guide to Email APIs',
    description: 'Learn about inbound email processing, how email-to-webhook services work, and why businesses use email APIs for automation. Complete guide with examples.',
    type: 'article',
    url: 'https://inbound.exon.dev/what-is-inbound-email',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'What is Inbound Email Processing? Complete Guide to Email APIs',
    description: 'Learn about inbound email processing, how email-to-webhook services work, and why businesses use email APIs for automation.',
  }
}

export default function WhatIsInboundEmailPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="px-6 py-6 border-b border-gray-100">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-2">
            <img src="/inbound-logo-3.png" alt="Inbound Logo" width={32} height={32} className="inline-block align-bottom" />
            <span className="text-2xl font-bold text-black">inbound</span>
          </div>
          <a href="/" className="text-gray-600 hover:text-gray-900 transition-colors">
            ← Back to Home
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-6 py-12 bg-gradient-to-br from-emerald-50 to-blue-50">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            What is Inbound Email Processing?
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
            Inbound email processing transforms incoming emails into structured data that your applications can understand and act upon. 
            It's the bridge between traditional email and modern API-driven workflows.
          </p>
          <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <HiClock className="w-4 h-4" />
              10 min read
            </span>
            <span>•</span>
            <span>Updated January 2025</span>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="px-6 py-12">
        <div className="max-w-4xl mx-auto">
          
          {/* Table of Contents */}
          <div className="bg-gray-50 rounded-lg p-6 mb-12">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Table of Contents</h2>
            <ul className="space-y-2 text-gray-700">
              <li><a href="#definition" className="hover:text-blue-600 transition-colors">1. What is Inbound Email Processing?</a></li>
              <li><a href="#how-it-works" className="hover:text-blue-600 transition-colors">2. How It Works</a></li>
              <li><a href="#benefits" className="hover:text-blue-600 transition-colors">3. Benefits for Businesses</a></li>
              <li><a href="#use-cases" className="hover:text-blue-600 transition-colors">4. Common Use Cases</a></li>
              <li><a href="#vs-traditional" className="hover:text-blue-600 transition-colors">5. vs Traditional Email</a></li>
              <li><a href="#implementation" className="hover:text-blue-600 transition-colors">6. Implementation Options</a></li>
              <li><a href="#security" className="hover:text-blue-600 transition-colors">7. Security Considerations</a></li>
              <li><a href="#best-practices" className="hover:text-blue-600 transition-colors">8. Best Practices</a></li>
            </ul>
          </div>

          {/* Section 1: Definition */}
          <section id="definition" className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
                <HiMail className="w-6 h-6 text-white" />
              </div>
              What is Inbound Email Processing?
            </h2>
            
            <div className="prose prose-lg max-w-none mb-8">
              <p className="text-gray-700 leading-relaxed mb-6">
                <strong>Inbound email processing</strong> is the automated handling of incoming emails by converting them into structured, machine-readable data that applications can process programmatically. Instead of emails sitting in traditional inboxes, they're intercepted, parsed, and delivered to your applications as JSON data via webhooks or APIs.
              </p>
              
              <div className="bg-emerald-50 border-l-4 border-emerald-400 p-6 rounded-lg mb-6">
                <div className="flex items-start gap-3">
                  <HiLightBulb className="w-6 h-6 text-emerald-600 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-emerald-900 mb-2">Think of it as...</h3>
                    <p className="text-emerald-800">
                      A smart postal service that doesn't just deliver mail to your mailbox, but opens each letter, 
                      reads the contents, extracts important information, and delivers a summary directly to your computer system.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Key Components */}
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <HiMail className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Email Reception</h3>
                <p className="text-gray-700 text-sm">Receive emails at any domain or address you configure</p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <HiCog className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Data Processing</h3>
                <p className="text-gray-700 text-sm">Parse and structure email content, headers, and attachments</p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                  <HiLightningBolt className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">API Delivery</h3>
                <p className="text-gray-700 text-sm">Send structured data to your applications via webhooks</p>
              </div>
            </div>
          </section>

          {/* Section 2: How It Works */}
          <section id="how-it-works" className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <HiCog className="w-6 h-6 text-white" />
              </div>
              How Inbound Email Processing Works
            </h2>
            
            <div className="space-y-8 mb-8">
              {/* Step 1 */}
              <div className="relative">
                <div className="flex items-start gap-6">
                  <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0">1</div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-3">Email Arrives</h3>
                    <p className="text-gray-700 mb-4">
                      Someone sends an email to an address you've configured (like support@yourapp.com). 
                      The email service intercepts this message before it reaches a traditional inbox.
                    </p>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-600 mb-2">Example incoming email:</div>
                      <div className="font-mono text-sm text-gray-800">
                        From: customer@example.com<br />
                        To: support@yourapp.com<br />
                        Subject: Bug report - Login not working<br />
                        Body: I can't log into my account...
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="relative">
                <div className="flex items-start gap-6">
                  <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0">2</div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-3">Email Gets Parsed</h3>
                    <p className="text-gray-700 mb-4">
                      The service extracts and structures all relevant data from the email including headers, body content, 
                      attachments, sender information, and metadata.
                    </p>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-600 mb-2">Extracted data includes:</div>
                      <ul className="text-sm text-gray-800 space-y-1">
                        <li>• Sender and recipient information</li>
                        <li>• Subject line and message body</li>
                        <li>• Timestamps and message IDs</li>
                        <li>• Attachments (files, images)</li>
                        <li>• Email headers and routing information</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="relative">
                <div className="flex items-start gap-6">
                  <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0">3</div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-3">Data Delivered via Webhook</h3>
                    <p className="text-gray-700 mb-4">
                      The structured data is sent to your application via an HTTP POST request to your webhook endpoint, 
                      allowing your system to process the email programmatically.
                    </p>
                    <div className="bg-gray-900 rounded-lg p-4">
                      <div className="text-sm text-gray-400 mb-2">JSON payload sent to your webhook:</div>
                      <pre className="text-sm text-gray-300 overflow-x-auto">
{`{
  "event": "email.received",
  "email": {
    "id": "email_123",
    "from": "customer@example.com",
    "to": ["support@yourapp.com"],
    "subject": "Bug report - Login not working",
    "body": {
      "text": "I can't log into my account...",
      "html": "<p>I can't log into my account...</p>"
    },
    "attachments": [],
    "receivedAt": "2025-01-15T12:00:00Z"
  }
}`}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="relative">
                <div className="flex items-start gap-6">
                  <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0">4</div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-3">Your App Takes Action</h3>
                    <p className="text-gray-700 mb-4">
                      Your application receives the webhook, processes the email data, and takes appropriate action 
                      such as creating support tickets, updating databases, or triggering automated responses.
                    </p>
                    <div className="bg-green-50 rounded-lg p-4">
                      <div className="text-sm text-green-800">
                        <strong>Example actions:</strong>
                        <ul className="mt-2 space-y-1">
                          <li>• Create support ticket in your system</li>
                          <li>• Send auto-reply to customer</li>
                          <li>• Notify team via Slack</li>
                          <li>• Update customer record in CRM</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Benefits */}
          <section id="benefits" className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                <HiCheckCircle className="w-6 h-6 text-white" />
              </div>
              Benefits for Businesses
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-6 border border-blue-200">
                <div className="flex items-center gap-3 mb-4">
                  <HiLightningBolt className="w-8 h-8 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Instant Processing</h3>
                </div>
                <p className="text-gray-700 mb-4">
                  Process emails in real-time as they arrive, enabling immediate responses and faster customer service.
                </p>
                <div className="text-sm text-blue-700 bg-blue-100 rounded-lg p-3">
                  <strong>Result:</strong> Reduce response times from hours to seconds
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-6 border border-purple-200">
                <div className="flex items-center gap-3 mb-4">
                  <HiCog className="w-8 h-8 text-purple-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Automation</h3>
                </div>
                <p className="text-gray-700 mb-4">
                  Automate repetitive email-based workflows without manual intervention or constant inbox monitoring.
                </p>
                <div className="text-sm text-purple-700 bg-purple-100 rounded-lg p-3">
                  <strong>Result:</strong> Save 10+ hours per week on manual email processing
                </div>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-6 border border-green-200">
                <div className="flex items-center gap-3 mb-4">
                  <HiChartBar className="w-8 h-8 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Scalability</h3>
                </div>
                <p className="text-gray-700 mb-4">
                  Handle thousands of emails without overwhelming your team or missing important messages.
                </p>
                <div className="text-sm text-green-700 bg-green-100 rounded-lg p-3">
                  <strong>Result:</strong> Process 10,000+ emails/day with consistent quality
                </div>
              </div>

              <div className="bg-gradient-to-br from-orange-50 to-yellow-50 rounded-lg p-6 border border-orange-200">
                <div className="flex items-center gap-3 mb-4">
                  <HiDatabase className="w-8 h-8 text-orange-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Data Integration</h3>
                </div>
                <p className="text-gray-700 mb-4">
                  Seamlessly integrate email data with your existing systems, databases, and workflows.
                </p>
                <div className="text-sm text-orange-700 bg-orange-100 rounded-lg p-3">
                  <strong>Result:</strong> Unified data across all business systems
                </div>
              </div>
            </div>
          </section>

          {/* Section 4: Use Cases */}
          <section id="use-cases" className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center">
                <HiCollection className="w-6 h-6 text-white" />
              </div>
              Common Use Cases
            </h2>
            
            <div className="space-y-6 mb-8">
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <HiMail className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Customer Support Automation</h3>
                    <p className="text-gray-700 mb-3">
                      Automatically create support tickets from customer emails, categorize issues, and route to appropriate teams.
                    </p>
                    <div className="text-sm text-gray-600">
                      <strong>Example flow:</strong> Email received → Parse content → Create ticket → Assign to team → Send confirmation
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <HiCube className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Order Processing</h3>
                    <p className="text-gray-700 mb-3">
                      Process order confirmations, shipping notifications, and return requests automatically.
                    </p>
                    <div className="text-sm text-gray-600">
                      <strong>Example flow:</strong> Order email → Extract order details → Update inventory → Send to fulfillment
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <HiFilter className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Lead Generation</h3>
                    <p className="text-gray-700 mb-3">
                      Capture leads from contact forms, newsletter signups, and inquiry emails automatically.
                    </p>
                    <div className="text-sm text-gray-600">
                      <strong>Example flow:</strong> Contact form email → Extract lead info → Add to CRM → Trigger nurture sequence
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <HiExclamationTriangle className="w-6 h-6 text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Alert & Monitoring Systems</h3>
                    <p className="text-gray-700 mb-3">
                      Process system alerts, error notifications, and monitoring reports from various services.
                    </p>
                    <div className="text-sm text-gray-600">
                      <strong>Example flow:</strong> Alert email → Parse severity → Create incident → Notify on-call team
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <HiCloudUpload className="w-6 h-6 text-yellow-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Document Processing</h3>
                    <p className="text-gray-700 mb-3">
                      Handle invoices, receipts, contracts, and other documents sent via email attachments.
                    </p>
                    <div className="text-sm text-gray-600">
                      <strong>Example flow:</strong> Invoice email → Extract attachment → OCR processing → Update accounting system
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 5: vs Traditional Email */}
          <section id="vs-traditional" className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
                <HiChartBar className="w-6 h-6 text-white" />
              </div>
              Inbound Email vs Traditional Email
            </h2>
            
            <div className="overflow-x-auto mb-8">
              <table className="w-full border border-gray-200 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Aspect</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Inbound Email Processing</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Traditional Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Processing Speed</td>
                    <td className="px-6 py-4 text-sm text-gray-700">⚡ Instant, automated</td>
                    <td className="px-6 py-4 text-sm text-gray-700">👤 Manual, delayed</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Scalability</td>
                    <td className="px-6 py-4 text-sm text-gray-700">✅ Unlimited volume</td>
                    <td className="px-6 py-4 text-sm text-gray-700">❌ Limited by human capacity</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Data Format</td>
                    <td className="px-6 py-4 text-sm text-gray-700">📊 Structured JSON</td>
                    <td className="px-6 py-4 text-sm text-gray-700">📧 Unstructured text</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Integration</td>
                    <td className="px-6 py-4 text-sm text-gray-700">🔗 Direct API integration</td>
                    <td className="px-6 py-4 text-sm text-gray-700">🔌 Manual copy/paste</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Error Rate</td>
                    <td className="px-6 py-4 text-sm text-gray-700">🎯 Consistent, low</td>
                    <td className="px-6 py-4 text-sm text-gray-700">⚠️ Variable, human error</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Availability</td>
                    <td className="px-6 py-4 text-sm text-gray-700">🕒 24/7 processing</td>
                    <td className="px-6 py-4 text-sm text-gray-700">⏰ Business hours only</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Cost</td>
                    <td className="px-6 py-4 text-sm text-gray-700">💰 Low operational cost</td>
                    <td className="px-6 py-4 text-sm text-gray-700">💸 High labor cost</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 6: Implementation */}
          <section id="implementation" className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                <HiCode className="w-6 h-6 text-white" />
              </div>
              Implementation Options
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-6 border border-blue-200">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">1. Email Service Providers</h3>
                <p className="text-gray-700 mb-4">
                  Use specialized services like Inbound, SendGrid, or Mailgun that offer inbound email processing as a service.
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-green-700">
                    <HiCheckCircle className="w-4 h-4" />
                    <span>Quick setup and deployment</span>
                  </div>
                  <div className="flex items-center gap-2 text-green-700">
                    <HiCheckCircle className="w-4 h-4" />
                    <span>Managed infrastructure</span>
                  </div>
                  <div className="flex items-center gap-2 text-green-700">
                    <HiCheckCircle className="w-4 h-4" />
                    <span>Built-in security and reliability</span>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-6 border border-purple-200">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">2. Self-Hosted Solutions</h3>
                <p className="text-gray-700 mb-4">
                  Build your own email processing infrastructure using mail servers and custom parsing logic.
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-blue-700">
                    <HiCheckCircle className="w-4 h-4" />
                    <span>Full control over processing</span>
                  </div>
                  <div className="flex items-center gap-2 text-blue-700">
                    <HiCheckCircle className="w-4 h-4" />
                    <span>Custom parsing logic</span>
                  </div>
                  <div className="flex items-center gap-2 text-red-600">
                    <HiExclamationTriangle className="w-4 h-4" />
                    <span>Complex setup and maintenance</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Implementation Steps */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Getting Started with Inbound Email Processing</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">1</div>
                  <div>
                    <div className="font-medium text-gray-900">Choose Your Domain</div>
                    <div className="text-sm text-gray-600">Decide which email addresses you want to process (e.g., support@yourapp.com)</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">2</div>
                  <div>
                    <div className="font-medium text-gray-900">Set Up Webhook Endpoint</div>
                    <div className="text-sm text-gray-600">Create an endpoint in your application to receive processed email data</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">3</div>
                  <div>
                    <div className="font-medium text-gray-900">Configure DNS Records</div>
                    <div className="text-sm text-gray-600">Update your domain's MX records to route emails to the processing service</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">4</div>
                  <div>
                    <div className="font-medium text-gray-900">Test & Deploy</div>
                    <div className="text-sm text-gray-600">Send test emails and verify your application receives the processed data</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 7: Security */}
          <section id="security" className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
                <HiShieldCheck className="w-6 h-6 text-white" />
              </div>
              Security Considerations
            </h2>
            
            <div className="bg-red-50 border-l-4 border-red-400 p-6 rounded-lg mb-8">
              <div className="flex items-start gap-3">
                <HiExclamationTriangle className="w-6 h-6 text-red-600 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-red-900 mb-2">Security is Critical</h3>
                  <p className="text-red-800">
                    Inbound email processing involves handling external data and exposing endpoints. 
                    Proper security measures are essential to protect your application and data.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-3 text-lg">Email Validation & Filtering</h3>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li>Validate sender authenticity using SPF, DKIM, and DMARC</li>
                  <li>Implement spam and malware filtering</li>
                  <li>Sanitize email content to prevent XSS attacks</li>
                  <li>Validate file attachments for security threats</li>
                </ul>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-3 text-lg">Webhook Security</h3>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li>Use HTTPS for all webhook endpoints</li>
                  <li>Verify webhook signatures to ensure authenticity</li>
                  <li>Implement rate limiting to prevent abuse</li>
                  <li>Use IP whitelisting when possible</li>
                </ul>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-3 text-lg">Data Protection</h3>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li>Encrypt sensitive data in transit and at rest</li>
                  <li>Implement proper access controls and authentication</li>
                  <li>Follow data retention policies and compliance requirements</li>
                  <li>Log and monitor all email processing activities</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 8: Best Practices */}
          <section id="best-practices" className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-600 rounded-lg flex items-center justify-center">
                <HiLightBulb className="w-6 h-6 text-white" />
              </div>
              Best Practices
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Technical Implementation</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                    <HiCheckCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-800">
                      <strong>Idempotency:</strong> Handle duplicate emails gracefully using unique message IDs
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                    <HiCheckCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-800">
                      <strong>Error Handling:</strong> Implement retry logic and dead letter queues
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                    <HiCheckCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-800">
                      <strong>Monitoring:</strong> Track processing metrics and set up alerts
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Business Considerations</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                    <HiCheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-green-800">
                      <strong>Clear Communication:</strong> Inform users about automated processing
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                    <HiCheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-green-800">
                      <strong>Fallback Options:</strong> Provide alternative contact methods
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                    <HiCheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-green-800">
                      <strong>Privacy Compliance:</strong> Follow GDPR, CCPA, and other regulations
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="bg-gradient-to-br from-emerald-600 to-blue-700 rounded-xl p-8 text-center text-white">
            <h2 className="text-2xl font-bold mb-4">Ready to Start Processing Inbound Emails?</h2>
            <p className="text-emerald-100 mb-6 max-w-2xl mx-auto">
              Transform your email workflow with Inbound. Turn any email address into a structured data stream 
              with webhooks, full type safety, and enterprise-grade reliability.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="/" 
                className="inline-flex items-center gap-2 bg-white text-emerald-600 px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Start Free Trial
                <HiArrowRight className="w-4 h-4" />
              </a>
              <a 
                href="/what-are-webhooks" 
                className="inline-flex items-center gap-2 border border-white/20 text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors"
              >
                Learn About Webhooks
              </a>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
            <img src="/inbound-logo-3.png" alt="Inbound Logo" className="w-6 h-6" />
            <span className="text-lg font-bold text-gray-900">inbound</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <a href="/privacy" className="hover:text-gray-700 transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-gray-700 transition-colors">Terms</a>
            <a href="/docs" className="hover:text-gray-700 transition-colors">Docs</a>
            <a href="mailto:support@inbound.exon.dev" className="hover:text-gray-700 transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  )
}