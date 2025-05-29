"use client"

import { useState } from "react"
import { FaCopy, FaCheck, FaCode, FaLink, FaLock, FaClock, FaDatabase } from "react-icons/fa"

export default function DocsPage() {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const webhookPayload = `{
  "id": "em_1o2jaosd8daks",
  "messageId": "0000014a-deb8-4e72-9e83-123456789012",
  "from": "sender@example.com",
  "to": ["user@yourdomain.com", "team@yourdomain.com"],
  "recipient": "user@yourdomain.com",
  "subject": "Welcome to our platform!",
  "receivedAt": "2025-01-28T12:00:00.000Z",
  "status": "received",
  "sesVerdict": {
    "spamVerdict": "PASS",
    "virusVerdict": "PASS",
    "spfVerdict": "PASS",
    "dkimVerdict": "PASS",
    "dmarcVerdict": "PASS"
  },
  "processingTimeMillis": 127,
  "metadata": {
    "userId": "usr_1o2jaosd8daks",
    "domainId": "dom_1o2jaosd8daks",
    "s3BucketName": "inbound-emails-prod",
    "s3ObjectKey": "emails/2025/01/0000014a-deb8-4e72.txt"
  }
}`

  const typeDefinitions = `interface WebhookPayload {
  id: string;                    // Unique email identifier
  messageId: string;             // AWS SES message ID
  from: string;                  // Sender email address
  to: string[];                  // Array of recipient addresses
  recipient: string;             // Primary recipient (your domain)
  subject: string;               // Email subject line
  receivedAt: string;            // ISO 8601 timestamp
  status: "received" | "processing" | "delivered" | "failed";
  sesVerdict: SESVerdict;        // Security verification results
  processingTimeMillis: number;  // Processing time in milliseconds
  metadata: EmailMetadata;       // Additional metadata
}

interface SESVerdict {
  spamVerdict: "PASS" | "FAIL" | "GRAY" | "PROCESSING_FAILED";
  virusVerdict: "PASS" | "FAIL" | "GRAY" | "PROCESSING_FAILED";
  spfVerdict: "PASS" | "FAIL" | "GRAY" | "PROCESSING_FAILED";
  dkimVerdict: "PASS" | "FAIL" | "GRAY" | "PROCESSING_FAILED";
  dmarcVerdict: "PASS" | "FAIL" | "GRAY" | "PROCESSING_FAILED";
}

interface EmailMetadata {
  userId: string;          // Your user ID in our system
  domainId: string;        // Domain configuration ID
  s3BucketName: string;    // S3 bucket containing email content
  s3ObjectKey: string;     // S3 object key for full email content
}`

  const curlExample = `curl -X POST https://your-webhook-endpoint.com/emails \\
  -H "Content-Type: application/json" \\
  -H "X-Inbound-Signature: sha256=..." \\
  -d '${webhookPayload.replace(/\n/g, '\\n').replace(/"/g, '\\"')}'`

  const nodeExample = `// Express.js webhook handler
app.post('/webhooks/inbound', express.json(), (req, res) => {
  const email = req.body;
  
  // Verify webhook signature (recommended)
  const signature = req.headers['x-inbound-signature'];
  if (!verifySignature(signature, req.body)) {
    return res.status(401).send('Invalid signature');
  }
  
  // Process the email
  console.log(\`New email from \${email.from}: \${email.subject}\`);
  
  // Check security verdicts
  if (email.sesVerdict.spamVerdict === 'PASS') {
    // Email passed spam check
    await processLegitimateEmail(email);
  }
  
  // Download full email content from S3 (optional)
  const emailContent = await downloadFromS3(
    email.metadata.s3BucketName, 
    email.metadata.s3ObjectKey
  );
  
  res.status(200).send('OK');
});`

  const pythonExample = `# Flask webhook handler
from flask import Flask, request, jsonify
import hmac
import hashlib

@app.route('/webhooks/inbound', methods=['POST'])
def handle_inbound_email():
    email_data = request.json
    
    # Verify webhook signature
    signature = request.headers.get('X-Inbound-Signature', '')
    if not verify_signature(signature, request.data):
        return 'Invalid signature', 401
    
    # Extract email information
    sender = email_data['from']
    subject = email_data['subject']
    recipient = email_data['recipient']
    
    # Check if email passed security checks
    verdicts = email_data['sesVerdict']
    if all(v == 'PASS' for v in verdicts.values()):
        print(f"Secure email from {sender}: {subject}")
        
    # Process based on recipient
    if recipient == 'support@yourdomain.com':
        create_support_ticket(email_data)
    elif recipient == 'orders@yourdomain.com':
        process_order_email(email_data)
    
    return jsonify({'status': 'processed'}), 200`

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

      {/* Content */}
      <main className="px-6 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="mb-16">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">API Documentation</h1>
            <p className="text-xl text-gray-600 max-w-3xl">
              Learn how to integrate with Inbound's webhook system to receive and process emails for your domains.
            </p>
          </div>

          {/* Quick Overview */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">How it Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-blue-50 p-6 rounded-xl border border-blue-200">
                <FaLink className="w-8 h-8 text-blue-600 mb-4" />
                <h3 className="text-lg font-semibold text-blue-900 mb-2">1. Configure Webhook</h3>
                <p className="text-blue-700">Set up your webhook endpoint URL in the Inbound dashboard to receive email notifications.</p>
              </div>
              <div className="bg-green-50 p-6 rounded-xl border border-green-200">
                <FaLock className="w-8 h-8 text-green-600 mb-4" />
                <h3 className="text-lg font-semibold text-green-900 mb-2">2. Email Processing</h3>
                <p className="text-green-700">We automatically process incoming emails, run security checks, and prepare the payload.</p>
              </div>
              <div className="bg-purple-50 p-6 rounded-xl border border-purple-200">
                <FaCode className="w-8 h-8 text-purple-600 mb-4" />
                <h3 className="text-lg font-semibold text-purple-900 mb-2">3. Webhook Delivery</h3>
                <p className="text-purple-700">Receive structured JSON data with email details, security verdicts, and metadata.</p>
              </div>
            </div>
          </section>

          {/* Webhook Payload */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Webhook Payload Structure</h2>
            <p className="text-gray-600 mb-6">
              When an email is received for your domain, we'll send a POST request to your webhook endpoint with the following JSON payload:
            </p>
            
            <div className="relative">
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                  <span className="text-white font-semibold">Example Webhook Payload</span>
                  <button
                    onClick={() => copyToClipboard(webhookPayload)}
                    className="flex items-center gap-2 px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded-md text-sm transition-colors"
                  >
                    {copied ? <FaCheck className="w-4 h-4" /> : <FaCopy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="p-6 text-sm text-gray-300 overflow-x-auto">
                  <code>{webhookPayload}</code>
                </pre>
              </div>
            </div>
          </section>

          {/* Type Definitions */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">TypeScript Definitions</h2>
            <p className="text-gray-600 mb-6">
              Use these TypeScript interfaces to ensure type safety in your webhook handlers:
            </p>
            
            <div className="relative">
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                  <span className="text-white font-semibold">TypeScript Types</span>
                  <button
                    onClick={() => copyToClipboard(typeDefinitions)}
                    className="flex items-center gap-2 px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded-md text-sm transition-colors"
                  >
                    <FaCopy className="w-4 h-4" />
                    Copy Types
                  </button>
                </div>
                <pre className="p-6 text-sm text-gray-300 overflow-x-auto">
                  <code>{typeDefinitions}</code>
                </pre>
              </div>
            </div>
          </section>

          {/* Field Descriptions */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Field Descriptions</h2>
            <div className="overflow-hidden bg-white border border-gray-200 rounded-xl">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Field</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">id</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">string</td>
                    <td className="px-6 py-4 text-sm text-gray-900">Unique identifier for this email (prefixed with "em_")</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">messageId</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">string</td>
                    <td className="px-6 py-4 text-sm text-gray-900">AWS SES message ID for tracking and debugging</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">from</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">string</td>
                    <td className="px-6 py-4 text-sm text-gray-900">Email address of the sender</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">to</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">string[]</td>
                    <td className="px-6 py-4 text-sm text-gray-900">Array of all recipient email addresses</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">recipient</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">string</td>
                    <td className="px-6 py-4 text-sm text-gray-900">Primary recipient address (from your domain)</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">subject</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">string</td>
                    <td className="px-6 py-4 text-sm text-gray-900">Email subject line</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">receivedAt</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">string</td>
                    <td className="px-6 py-4 text-sm text-gray-900">ISO 8601 timestamp when email was received</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">status</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">string</td>
                    <td className="px-6 py-4 text-sm text-gray-900">Processing status: "received", "processing", "delivered", or "failed"</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">sesVerdict</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">object</td>
                    <td className="px-6 py-4 text-sm text-gray-900">Security verification results from AWS SES</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">processingTimeMillis</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">number</td>
                    <td className="px-6 py-4 text-sm text-gray-900">Time taken to process the email (in milliseconds)</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">metadata</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">object</td>
                    <td className="px-6 py-4 text-sm text-gray-900">Additional metadata including S3 storage information</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Security Verdicts */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Security Verdict Explanations</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-blue-50 p-6 rounded-xl border border-blue-200">
                <h3 className="text-lg font-semibold text-blue-900 mb-3">Spam Verdict</h3>
                <p className="text-blue-700 text-sm mb-3">Determines if the email is likely spam based on content analysis and sender reputation.</p>
                <ul className="text-blue-700 text-sm space-y-1">
                  <li><strong>PASS:</strong> Not spam</li>
                  <li><strong>FAIL:</strong> Likely spam</li>
                  <li><strong>GRAY:</strong> Uncertain</li>
                </ul>
              </div>
              
              <div className="bg-green-50 p-6 rounded-xl border border-green-200">
                <h3 className="text-lg font-semibold text-green-900 mb-3">Virus Verdict</h3>
                <p className="text-green-700 text-sm mb-3">Scans attachments and content for malicious software and viruses.</p>
                <ul className="text-green-700 text-sm space-y-1">
                  <li><strong>PASS:</strong> No viruses found</li>
                  <li><strong>FAIL:</strong> Virus detected</li>
                  <li><strong>GRAY:</strong> Scan inconclusive</li>
                </ul>
              </div>
              
              <div className="bg-purple-50 p-6 rounded-xl border border-purple-200">
                <h3 className="text-lg font-semibold text-purple-900 mb-3">SPF Verdict</h3>
                <p className="text-purple-700 text-sm mb-3">Sender Policy Framework authentication check to verify sender authorization.</p>
                <ul className="text-purple-700 text-sm space-y-1">
                  <li><strong>PASS:</strong> SPF record valid</li>
                  <li><strong>FAIL:</strong> SPF check failed</li>
                  <li><strong>GRAY:</strong> No SPF record</li>
                </ul>
              </div>
              
              <div className="bg-orange-50 p-6 rounded-xl border border-orange-200">
                <h3 className="text-lg font-semibold text-orange-900 mb-3">DKIM/DMARC Verdicts</h3>
                <p className="text-orange-700 text-sm mb-3">Domain-based authentication checks for email integrity and sender verification.</p>
                <ul className="text-orange-700 text-sm space-y-1">
                  <li><strong>PASS:</strong> Authentication successful</li>
                  <li><strong>FAIL:</strong> Authentication failed</li>
                  <li><strong>GRAY:</strong> No policy found</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Code Examples */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Implementation Examples</h2>
            
            {/* Node.js Example */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Node.js / Express</h3>
              <div className="relative">
                <div className="bg-gray-900 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                    <span className="text-white font-medium">Webhook Handler</span>
                    <button
                      onClick={() => copyToClipboard(nodeExample)}
                      className="flex items-center gap-2 px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded-md text-sm transition-colors"
                    >
                      <FaCopy className="w-4 h-4" />
                      Copy
                    </button>
                  </div>
                  <pre className="p-6 text-sm text-gray-300 overflow-x-auto">
                    <code>{nodeExample}</code>
                  </pre>
                </div>
              </div>
            </div>

            {/* Python Example */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Python / Flask</h3>
              <div className="relative">
                <div className="bg-gray-900 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                    <span className="text-white font-medium">Webhook Handler</span>
                    <button
                      onClick={() => copyToClipboard(pythonExample)}
                      className="flex items-center gap-2 px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded-md text-sm transition-colors"
                    >
                      <FaCopy className="w-4 h-4" />
                      Copy
                    </button>
                  </div>
                  <pre className="p-6 text-sm text-gray-300 overflow-x-auto">
                    <code>{pythonExample}</code>
                  </pre>
                </div>
              </div>
            </div>
          </section>

          {/* Best Practices */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Best Practices</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <FaLock className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Verify Webhook Signatures</h3>
                    <p className="text-gray-600 text-sm">Always verify the X-Inbound-Signature header to ensure webhooks are from Inbound.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <FaClock className="w-5 h-5 text-blue-600 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Respond Quickly</h3>
                    <p className="text-gray-600 text-sm">Return a 200 status code within 10 seconds to avoid webhook timeouts.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <FaDatabase className="w-5 h-5 text-purple-600 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Handle Duplicates</h3>
                    <p className="text-gray-600 text-sm">Use the email ID to implement idempotent processing and avoid duplicate handling.</p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Check Security Verdicts</h3>
                    <p className="text-gray-600 text-sm">Always check sesVerdict fields before processing emails to ensure security.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <FaCode className="w-5 h-5 text-orange-600 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Implement Retry Logic</h3>
                    <p className="text-gray-600 text-sm">Handle temporary failures gracefully with exponential backoff retry mechanisms.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <FaDatabase className="w-5 h-5 text-indigo-600 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Download Full Content</h3>
                    <p className="text-gray-600 text-sm">Use S3 metadata to download full email content including attachments when needed.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Support */}
          <section className="bg-gray-50 rounded-xl p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Need Help?</h2>
            <p className="text-gray-600 mb-6">
              If you have questions about implementing webhooks or need assistance with your integration, 
              we're here to help.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a 
                href="mailto:support@inbound.exon.dev" 
                className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Contact Support
              </a>
              <a 
                href="/dashboard" 
                className="inline-flex items-center px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Go to Dashboard
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