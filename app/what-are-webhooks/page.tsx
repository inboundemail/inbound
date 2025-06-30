import { Metadata } from 'next'
import { HiCode, HiLightningBolt, HiGlobeAlt, HiCog, HiCheckCircle, HiArrowRight, HiMail, HiShieldCheck, HiCube, HiCollection, HiLightBulb, HiChartBar, HiClock, HiExclamationTriangle } from "react-icons/hi"

export const metadata: Metadata = {
  title: 'What are Webhooks? Complete Guide to Real-Time API Communication | Inbound',
  description: 'Learn everything about webhooks - what they are, how they work, and why they\'re essential for modern applications. Complete guide with examples and best practices.',
  keywords: 'webhooks, API, real-time communication, HTTP callbacks, webhook integration, API automation, event-driven architecture',
  openGraph: {
    title: 'What are Webhooks? Complete Guide to Real-Time API Communication',
    description: 'Learn everything about webhooks - what they are, how they work, and why they\'re essential for modern applications. Complete guide with examples and best practices.',
    type: 'article',
    url: 'https://inbound.exon.dev/what-are-webhooks',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'What are Webhooks? Complete Guide to Real-Time API Communication',
    description: 'Learn everything about webhooks - what they are, how they work, and why they\'re essential for modern applications.',
  }
}

export default function WhatAreWebhooksPage() {
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
      <section className="px-6 py-12 bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            What are Webhooks?
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
            Webhooks are HTTP callbacks that enable real-time communication between applications. 
            Think of them as automated messengers that instantly notify your app when something important happens.
          </p>
          <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <HiClock className="w-4 h-4" />
              8 min read
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
              <li><a href="#definition" className="hover:text-blue-600 transition-colors">1. Webhook Definition</a></li>
              <li><a href="#how-they-work" className="hover:text-blue-600 transition-colors">2. How Webhooks Work</a></li>
              <li><a href="#vs-apis" className="hover:text-blue-600 transition-colors">3. Webhooks vs APIs</a></li>
              <li><a href="#use-cases" className="hover:text-blue-600 transition-colors">4. Common Use Cases</a></li>
              <li><a href="#benefits" className="hover:text-blue-600 transition-colors">5. Benefits & Advantages</a></li>
              <li><a href="#security" className="hover:text-blue-600 transition-colors">6. Security Best Practices</a></li>
              <li><a href="#implementation" className="hover:text-blue-600 transition-colors">7. Implementation Guide</a></li>
              <li><a href="#troubleshooting" className="hover:text-blue-600 transition-colors">8. Troubleshooting</a></li>
            </ul>
          </div>

          {/* Section 1: Definition */}
          <section id="definition" className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <HiCode className="w-6 h-6 text-white" />
              </div>
              What is a Webhook?
            </h2>
            
            <div className="prose prose-lg max-w-none mb-8">
              <p className="text-gray-700 leading-relaxed mb-6">
                A <strong>webhook</strong> is an HTTP-based callback function that allows one application to send real-time data to another application when a specific event occurs. Unlike traditional APIs where you have to repeatedly ask "Is there anything new?" (polling), webhooks work on a "push" model where the source application automatically notifies your application when something happens.
              </p>
              
              <div className="bg-blue-50 border-l-4 border-blue-400 p-6 rounded-lg mb-6">
                <div className="flex items-start gap-3">
                  <HiLightBulb className="w-6 h-6 text-blue-600 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-2">Simple Analogy</h3>
                    <p className="text-blue-800">
                      Think of webhooks like a doorbell. Instead of constantly checking if someone is at your door (polling), 
                      the doorbell rings automatically when someone arrives (webhook notification).
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Example */}
            <div className="bg-gradient-to-br from-gray-50 to-slate-50 rounded-xl p-6 border border-gray-200 mb-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Webhook in Action</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <HiMail className="w-6 h-6 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">1. Event Occurs</div>
                    <div className="text-sm text-gray-600">New email arrives at support@yourapp.com</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <HiLightningBolt className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">2. Webhook Triggered</div>
                    <div className="text-sm text-gray-600">Email service sends HTTP POST to your endpoint</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <HiCog className="w-6 h-6 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">3. Your App Responds</div>
                    <div className="text-sm text-gray-600">Creates support ticket, sends notification, updates database</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: How They Work */}
          <section id="how-they-work" className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                <HiCog className="w-6 h-6 text-white" />
              </div>
              How Do Webhooks Work?
            </h2>
            
            <div className="prose prose-lg max-w-none mb-8">
              <p className="text-gray-700 leading-relaxed mb-6">
                Webhooks follow a simple but powerful pattern. Here's the step-by-step process:
              </p>
            </div>

            {/* Technical Flow */}
            <div className="space-y-6 mb-8">
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">1</div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Event Registration</h3>
                    <p className="text-gray-700">You configure the source application to send webhooks to your endpoint URL when specific events occur.</p>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">2</div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Event Occurs</h3>
                    <p className="text-gray-700">Something happens in the source application (new user signup, payment completed, email received, etc.).</p>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">3</div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">HTTP Request Sent</h3>
                    <p className="text-gray-700">The source application immediately sends an HTTP POST request to your webhook URL with event data.</p>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">4</div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Your App Processes</h3>
                    <p className="text-gray-700">Your application receives the webhook, processes the data, and takes appropriate action.</p>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">5</div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Response Sent</h3>
                    <p className="text-gray-700">Your application sends back an HTTP 200 status code to confirm successful receipt.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Code Example */}
            <div className="bg-gray-900 rounded-lg p-6 mb-8">
              <h3 className="text-lg font-semibold text-white mb-4">Example Webhook Payload</h3>
              <pre className="text-sm text-gray-300 overflow-x-auto">
{`{
  "event": "email.received",
  "timestamp": "2025-01-15T12:00:00Z",
  "data": {
    "id": "email_123",
    "from": "customer@example.com",
    "to": "support@yourapp.com",
    "subject": "Need help with integration",
    "body": "Hi, I'm having trouble..."
  }
}`}
              </pre>
            </div>
          </section>

          {/* Section 3: Webhooks vs APIs */}
          <section id="vs-apis" className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                <HiChartBar className="w-6 h-6 text-white" />
              </div>
              Webhooks vs APIs: What's the Difference?
            </h2>
            
            <div className="overflow-x-auto mb-8">
              <table className="w-full border border-gray-200 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Aspect</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Webhooks</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Traditional APIs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Communication Model</td>
                    <td className="px-6 py-4 text-sm text-gray-700">Push (event-driven)</td>
                    <td className="px-6 py-4 text-sm text-gray-700">Pull (request-response)</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Real-time Updates</td>
                    <td className="px-6 py-4 text-sm text-gray-700">✅ Instant</td>
                    <td className="px-6 py-4 text-sm text-gray-700">❌ Requires polling</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Resource Usage</td>
                    <td className="px-6 py-4 text-sm text-gray-700">✅ Low (event-based)</td>
                    <td className="px-6 py-4 text-sm text-gray-700">❌ High (constant requests)</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Setup Complexity</td>
                    <td className="px-6 py-4 text-sm text-gray-700">⚠️ Moderate (endpoint required)</td>
                    <td className="px-6 py-4 text-sm text-gray-700">✅ Simple (client requests)</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Reliability</td>
                    <td className="px-6 py-4 text-sm text-gray-700">⚠️ Requires retry logic</td>
                    <td className="px-6 py-4 text-sm text-gray-700">✅ Immediate error handling</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 4: Use Cases */}
          <section id="use-cases" className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center">
                <HiCollection className="w-6 h-6 text-white" />
              </div>
              Common Webhook Use Cases
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-6 border border-blue-200">
                <div className="flex items-center gap-3 mb-4">
                  <HiMail className="w-8 h-8 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Email Processing</h3>
                </div>
                <p className="text-gray-700 mb-4">
                  Automatically process incoming emails, create support tickets, or trigger workflows when emails arrive.
                </p>
                <div className="text-sm text-gray-600">
                  <strong>Example:</strong> New email → Create ticket → Notify team
                </div>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-6 border border-green-200">
                <div className="flex items-center gap-3 mb-4">
                  <HiCube className="w-8 h-8 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900">E-commerce</h3>
                </div>
                <p className="text-gray-700 mb-4">
                  Update inventory, send order confirmations, or trigger fulfillment processes when purchases are made.
                </p>
                <div className="text-sm text-gray-600">
                  <strong>Example:</strong> Payment completed → Update inventory → Send confirmation
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-6 border border-purple-200">
                <div className="flex items-center gap-3 mb-4">
                  <HiShieldCheck className="w-8 h-8 text-purple-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Security & Monitoring</h3>
                </div>
                <p className="text-gray-700 mb-4">
                  Get instant alerts for security events, failed logins, or system anomalies.
                </p>
                <div className="text-sm text-gray-600">
                  <strong>Example:</strong> Failed login → Security alert → Block IP
                </div>
              </div>

              <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-lg p-6 border border-yellow-200">
                <div className="flex items-center gap-3 mb-4">
                  <HiGlobeAlt className="w-8 h-8 text-yellow-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Integration & Automation</h3>
                </div>
                <p className="text-gray-700 mb-4">
                  Connect different services and automate workflows between applications.
                </p>
                <div className="text-sm text-gray-600">
                  <strong>Example:</strong> New user signup → Add to CRM → Send welcome email
                </div>
              </div>
            </div>
          </section>

          {/* Section 5: Benefits */}
          <section id="benefits" className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
                <HiCheckCircle className="w-6 h-6 text-white" />
              </div>
              Benefits of Using Webhooks
            </h2>
            
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-4 p-4 bg-green-50 rounded-lg border border-green-200">
                <HiLightningBolt className="w-6 h-6 text-green-600 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-green-900 mb-1">Real-time Communication</h3>
                  <p className="text-green-800">Get instant notifications when events occur, enabling immediate responses and better user experiences.</p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <HiCog className="w-6 h-6 text-blue-600 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-blue-900 mb-1">Reduced Server Load</h3>
                  <p className="text-blue-800">Eliminate the need for constant polling, reducing server resources and API call limits.</p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                <HiChartBar className="w-6 h-6 text-purple-600 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-purple-900 mb-1">Better Scalability</h3>
                  <p className="text-purple-800">Handle high-volume events efficiently without overwhelming your infrastructure.</p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-orange-50 rounded-lg border border-orange-200">
                <HiLightBulb className="w-6 h-6 text-orange-600 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-orange-900 mb-1">Simplified Architecture</h3>
                  <p className="text-orange-800">Build event-driven architectures that are easier to maintain and understand.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 6: Security */}
          <section id="security" className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
                <HiShieldCheck className="w-6 h-6 text-white" />
              </div>
              Webhook Security Best Practices
            </h2>
            
            <div className="bg-red-50 border-l-4 border-red-400 p-6 rounded-lg mb-8">
              <div className="flex items-start gap-3">
                <HiExclamationTriangle className="w-6 h-6 text-red-600 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-red-900 mb-2">Security Warning</h3>
                  <p className="text-red-800">
                    Webhooks expose your application to external requests. Always implement proper security measures to prevent unauthorized access and attacks.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-3">1. Verify Webhook Signatures</h3>
                <p className="text-gray-700 mb-4">Always verify that webhooks are coming from the expected source by checking cryptographic signatures.</p>
                <div className="bg-gray-900 rounded-lg p-4">
                  <pre className="text-sm text-gray-300 overflow-x-auto">
{`// Example signature verification
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}`}
                  </pre>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-3">2. Use HTTPS Only</h3>
                <p className="text-gray-700">Always use HTTPS for webhook endpoints to encrypt data in transit and prevent man-in-the-middle attacks.</p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-3">3. Implement Rate Limiting</h3>
                <p className="text-gray-700">Protect your endpoints from abuse by implementing rate limiting and request throttling.</p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-3">4. Validate Input Data</h3>
                <p className="text-gray-700">Always validate and sanitize incoming webhook data to prevent injection attacks and ensure data integrity.</p>
              </div>
            </div>
          </section>

          {/* Section 7: Implementation */}
          <section id="implementation" className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
                <HiCode className="w-6 h-6 text-white" />
              </div>
              Implementation Guide
            </h2>
            
            <div className="space-y-8">
              <div className="bg-gradient-to-br from-gray-50 to-slate-50 rounded-lg p-6 border border-gray-200">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Step 1: Create a Webhook Endpoint</h3>
                <div className="bg-gray-900 rounded-lg p-4 mb-4">
                  <pre className="text-sm text-gray-300 overflow-x-auto">
{`// Express.js example
app.post('/webhook', (req, res) => {
  try {
    // Verify the webhook signature
    if (!verifySignature(req.body, req.headers['x-signature'], secret)) {
      return res.status(401).send('Unauthorized');
    }
    
    // Process the webhook data
    const event = req.body;
    console.log('Received event:', event.type);
    
    // Handle different event types
    switch (event.type) {
      case 'email.received':
        handleEmailReceived(event.data);
        break;
      case 'payment.completed':
        handlePaymentCompleted(event.data);
        break;
      default:
        console.log('Unknown event type:', event.type);
    }
    
    // Always respond with 200 OK
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
});`}
                  </pre>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-6 border border-blue-200">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Step 2: Handle Failures Gracefully</h3>
                <p className="text-gray-700 mb-4">Implement proper error handling and retry logic for failed webhook deliveries.</p>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li>Always return appropriate HTTP status codes</li>
                  <li>Implement idempotency to handle duplicate deliveries</li>
                  <li>Log webhook events for debugging and monitoring</li>
                  <li>Set up dead letter queues for failed events</li>
                </ul>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-6 border border-green-200">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Step 3: Test Your Implementation</h3>
                <p className="text-gray-700 mb-4">Use tools like ngrok for local testing and webhook testing services for validation.</p>
                <div className="bg-gray-900 rounded-lg p-4">
                  <pre className="text-sm text-gray-300 overflow-x-auto">
{`# Expose local server for testing
ngrok http 3000

# Test with curl
curl -X POST https://your-app.ngrok.io/webhook \\
  -H "Content-Type: application/json" \\
  -d '{"event": "test", "data": {"message": "Hello webhook!"}}'`}
                  </pre>
                </div>
              </div>
            </div>
          </section>

          {/* Section 8: Troubleshooting */}
          <section id="troubleshooting" className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-600 rounded-lg flex items-center justify-center">
                <HiExclamationTriangle className="w-6 h-6 text-white" />
              </div>
              Common Issues & Troubleshooting
            </h2>
            
            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-3 text-lg">Webhook Not Receiving Events</h3>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li>Check if your endpoint URL is publicly accessible</li>
                  <li>Verify the webhook is properly configured in the source application</li>
                  <li>Ensure your endpoint returns HTTP 200 status codes</li>
                  <li>Check firewall and security group settings</li>
                </ul>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-3 text-lg">Duplicate Events</h3>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li>Implement idempotency using unique event IDs</li>
                  <li>Store processed event IDs to prevent reprocessing</li>
                  <li>Handle network timeouts that may cause retries</li>
                </ul>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-3 text-lg">Performance Issues</h3>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li>Process webhooks asynchronously using queues</li>
                  <li>Implement proper database indexing for event lookups</li>
                  <li>Monitor webhook processing times and optimize bottlenecks</li>
                  <li>Scale horizontally to handle high event volumes</li>
                </ul>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="bg-gradient-to-br from-blue-600 to-purple-700 rounded-xl p-8 text-center text-white">
            <h2 className="text-2xl font-bold mb-4">Ready to Implement Webhooks?</h2>
            <p className="text-blue-100 mb-6 max-w-2xl mx-auto">
              Start receiving emails as webhooks with Inbound. Turn any email address into a webhook endpoint with full type safety and real-time processing.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="/" 
                className="inline-flex items-center gap-2 bg-white text-blue-600 px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Try Inbound Free
                <HiArrowRight className="w-4 h-4" />
              </a>
              <a 
                href="/docs" 
                className="inline-flex items-center gap-2 border border-white/20 text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors"
              >
                View Documentation
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