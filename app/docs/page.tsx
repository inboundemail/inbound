"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import Code2 from "@/components/icons/code-2"
import Clipboard2 from "@/components/icons/clipboard-2"
import CircleCheck from "@/components/icons/circle-check"
import BookOpen2 from "@/components/icons/book-open-2"
import Terminal from "@/components/icons/terminal"
import Key2 from "@/components/icons/key-2"
import Globe2 from "@/components/icons/globe-2"
import Envelope2 from "@/components/icons/envelope-2"
import Webhook from "@/components/icons/webhook"
import Refresh2 from "@/components/icons/refresh-2"
import CirclePlus from "@/components/icons/circle-plus"
import Magnifier2 from "@/components/icons/magnifier-2"
import Hashtag2 from "@/components/icons/hashtag-2"
import { toast } from 'sonner'
import { useSession } from '@/lib/auth/auth-client'
import Link from 'next/link'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

export default function DocsPage() {
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSection, setActiveSection] = useState('')
  const { data: session, isPending } = useSession()

  // Navigation sections
  const sections = [
    { id: 'quick-start', title: 'Quick Start', icon: Key2 },
    { id: 'authentication', title: 'Authentication', icon: Key2 },
    { id: 'domains', title: 'Domains', icon: Globe2 },
    { id: 'email-addresses', title: 'Email Addresses', icon: Envelope2 },
    { id: 'webhooks', title: 'Webhooks', icon: Webhook },
    { id: 'error-handling', title: 'Error Handling', icon: Code2 },
    { id: 'complete-example', title: 'Complete Example', icon: Terminal }
  ]

  // Filter sections based on search
  const filteredSections = sections.filter(section =>
    section.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Scroll to section
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
      setActiveSection(sectionId)
    }
  }

  // Track active section on scroll
  useEffect(() => {
    const handleScroll = () => {
      const sectionElements = sections.map(section => ({
        id: section.id,
        element: document.getElementById(section.id)
      }))

      const currentSection = sectionElements.find(({ element }) => {
        if (!element) return false
        const rect = element.getBoundingClientRect()
        return rect.top <= 100 && rect.bottom >= 100
      })

      if (currentSection) {
        setActiveSection(currentSection.id)
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [sections])

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedCode(id)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopiedCode(null), 2000)
    } catch (error) {
      toast.error('Failed to copy to clipboard')
    }
  }

  const CodeBlock = ({ 
    children, 
    language = 'bash', 
    copyId 
  }: { 
    children: string
    language?: string
    copyId: string 
  }) => (
    <div className="relative">
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: '0.5rem',
          fontSize: '0.875rem',
          lineHeight: '1.25rem'
        }}
        showLineNumbers={false}
        wrapLines={true}
        wrapLongLines={true}
      >
        {children}
      </SyntaxHighlighter>
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 h-8 w-8 p-0 text-slate-400 hover:text-slate-100 bg-slate-800/50 hover:bg-slate-700/50"
        onClick={() => copyToClipboard(children, copyId)}
      >
        {copiedCode === copyId ? (
          <CircleCheck width="16" height="16" />
        ) : (
          <Clipboard2 width="16" height="16" />
        )}
      </Button>
    </div>
  )

  return (
    <div className="flex flex-1 flex-col">
      {/* Header with Gradient */}
      <header className="px-6 py-6 border-b border-gray-100 sticky top-0 bg-white z-50">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <Link href="/" className="flex items-center gap-2">
            <img src="/inbound-logo-3.png" alt="Email" width={32} height={32} className="inline-block align-bottom" />
            <span className="text-2xl font-bold text-black">inbound</span>
          </Link>
          {/* Conditionally show Sign In or Go to Dashboard based on auth state */}
          {isPending ? (
            <div className="w-20 h-10 bg-gray-200 animate-pulse rounded"></div>
          ) : session ? (
            <Button variant="primary" asChild>
              <a href="/dashboard" className="text-white hover:text-gray-900">
                Go to Dashboard
              </a>
            </Button>
          ) : (
            <Button variant="primary" asChild>
              <a href="/login" className="text-white hover:text-gray-900">
                Sign In
              </a>
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-1 max-w-7xl mx-auto w-full">
        {/* Left Sidebar - Navigation */}
        <aside className="w-64 flex-shrink-0 border-r border-gray-200 bg-gray-50/50 p-6 sticky top-[89px] h-[calc(100vh-89px)] overflow-y-auto">
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Magnifier2 width="16" height="16" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search docs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-white"
              />
            </div>

            {/* Navigation */}
            <nav className="space-y-1">
              {filteredSections.map((section) => {
                const Icon = section.icon
                const isActive = activeSection === section.id
                return (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left ${
                      isActive
                        ? 'bg-purple-100 text-purple-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span>{section.title}</span>
                  </button>
                )
              })}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 px-6 py-8 min-w-0">
          <div className="max-w-4xl space-y-12">
            {/* Quick Start */}
            <section id="quick-start">
          <div className="flex items-center gap-2 mb-6">
            <Key2 width="24" height="24" className="text-purple-600" />
            <h2 className="text-3xl font-bold">SDK and API Docs</h2>
          </div>
          <p className="text-xl text-muted-foreground mb-8">
            Get started with the Inbound Email API in minutes
          </p>
          
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-semibold mb-4">1. Get Your API Key</h3>
              <p className="text-muted-foreground mb-4">
                Create an API key from your <a href="/settings" className="text-purple-600 hover:underline">Settings page</a>.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4">2. Install the SDK (Optional)</h3>
              <Tabs defaultValue="npm" className="w-full">
                <TabsList>
                  <TabsTrigger value="npm">npm</TabsTrigger>
                  <TabsTrigger value="yarn">yarn</TabsTrigger>
                  <TabsTrigger value="pnpm">pnpm</TabsTrigger>
                  <TabsTrigger value="bun">bun</TabsTrigger>
                </TabsList>
                <TabsContent value="npm">
                  <CodeBlock copyId="install-npm">npm install exon-inbound</CodeBlock>
                </TabsContent>
                <TabsContent value="yarn">
                  <CodeBlock copyId="install-yarn">yarn add exon-inbound</CodeBlock>
                </TabsContent>
                <TabsContent value="pnpm">
                  <CodeBlock copyId="install-pnpm">pnpm add exon-inbound</CodeBlock>
                </TabsContent>
                <TabsContent value="bun">
                  <CodeBlock copyId="install-bun">bun add exon-inbound</CodeBlock>
                </TabsContent>
              </Tabs>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4">3. Make Your First Request</h3>
              <Tabs defaultValue="typescript" className="w-full">
                <TabsList>
                  <TabsTrigger value="typescript">TypeScript</TabsTrigger>
                  <TabsTrigger value="curl">cURL</TabsTrigger>
                </TabsList>
                <TabsContent value="typescript">
                  <CodeBlock language="typescript" copyId="quick-start-ts">
{`import { createInboundClient } from 'exon-inbound'

const inbound = createInboundClient({
  apiKey: 'your_api_key_here'
})

// List your domains
const domains = await inbound.getDomains()
console.log('Your domains:', domains)

// Find a verified domain
const verifiedDomain = domains.find(d => 
  d.status === 'verified' && d.canReceiveEmails
)

if (verifiedDomain) {
  console.log('Ready to use:', verifiedDomain.domain)
}`}
                  </CodeBlock>
                </TabsContent>
                <TabsContent value="curl">
                  <CodeBlock language="bash" copyId="quick-start-curl">
{`curl -X GET https://your-domain.com/api/v1/domains \\
  -H "Authorization: Bearer your_api_key_here"`}
                  </CodeBlock>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </section>

            {/* Authentication */}
            <section id="authentication">
          <div className="flex items-center gap-2 mb-6">
            <Key2 width="24" height="24" className="text-purple-600" />
            <h2 className="text-3xl font-bold">Authentication</h2>
          </div>
          <p className="text-xl text-muted-foreground mb-8">
            All API requests require authentication using an API key
          </p>
          
          <div className="space-y-6">
            <p>Include your API key in the <code className="bg-slate-100 px-2 py-1 rounded">Authorization</code> header:</p>
            <CodeBlock language="bash" copyId="auth-header">Authorization: Bearer your_api_key_here</CodeBlock>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-amber-800 text-sm">
                <strong>Security:</strong> Keep your API keys secure and never expose them in client-side code.
              </p>
            </div>
          </div>
        </section>

            {/* Domains */}
            <section id="domains">
          <div className="flex items-center gap-2 mb-6">
            <Globe2 width="24" height="24" className="text-purple-600" />
            <h2 className="text-3xl font-bold">Domains</h2>
          </div>
          <p className="text-xl text-muted-foreground mb-8">
            Manage your email domains and get domain information for email operations
          </p>
          
          <div className="space-y-8">
            {/* List Domains */}
            <div>
              <h3 className="text-xl font-semibold mb-4">List Domains</h3>
              <p className="text-muted-foreground mb-6">Get all domains for your account with their IDs and status information.</p>
              
              <Tabs defaultValue="typescript" className="w-full">
                <TabsList>
                  <TabsTrigger value="typescript">TypeScript</TabsTrigger>
                  <TabsTrigger value="curl">cURL</TabsTrigger>
                </TabsList>
                <TabsContent value="typescript" className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-3">Request</h4>
                    <CodeBlock language="typescript" copyId="list-domains-ts">
{`// Get just the domains array
const domains = await inbound.getDomains()

// or use the explicit method
const domains = await inbound.listDomains()

// Find a specific domain by name
const myDomain = domains.find(d => d.domain === 'example.com')
console.log('Domain ID:', myDomain?.id) // Use this ID for email operations`}
                    </CodeBlock>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Response</h4>
                    <CodeBlock language="json" copyId="list-domains-response">
{`[
  {
    "id": "indm_abc123",
    "domain": "example.com",
    "status": "verified",
    "canReceiveEmails": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  {
    "id": "indm_def456",
    "domain": "myapp.com",
    "status": "pending",
    "canReceiveEmails": false,
    "createdAt": "2024-01-02T00:00:00.000Z",
    "updatedAt": "2024-01-02T00:00:00.000Z"
  }
]`}
                    </CodeBlock>
                  </div>
                </TabsContent>
                <TabsContent value="curl" className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-3">Request</h4>
                    <CodeBlock language="bash" copyId="list-domains-curl">
{`curl -X GET https://your-domain.com/api/v1/domains \\
  -H "Authorization: Bearer your_api_key"`}
                    </CodeBlock>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Response</h4>
                    <CodeBlock language="json" copyId="list-domains-curl-response">
{`{
  "success": true,
  "data": [
    {
      "id": "indm_abc123",
      "domain": "example.com",
      "status": "verified",
      "canReceiveEmails": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    {
      "id": "indm_def456",
      "domain": "myapp.com",
      "status": "pending",
      "canReceiveEmails": false,
      "createdAt": "2024-01-02T00:00:00.000Z",
      "updatedAt": "2024-01-02T00:00:00.000Z"
    }
  ]
}`}
                    </CodeBlock>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* Domain Status Information */}
            <div>
              <h3 className="text-xl font-semibold mb-4">Domain Status</h3>
              <p className="text-muted-foreground mb-6">Understanding domain status values and what they mean.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg border">
                    <Badge className="bg-green-100 text-green-800 border-green-200">verified</Badge>
                    <span className="text-sm">Domain is verified and can receive emails</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg border">
                    <Badge className="bg-amber-100 text-amber-800 border-amber-200">pending</Badge>
                    <span className="text-sm">Domain verification is in progress</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg border">
                    <Badge className="bg-red-100 text-red-800 border-red-200">failed</Badge>
                    <span className="text-sm">Domain verification failed</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg border">
                    <Badge className="bg-blue-100 text-blue-800 border-blue-200">ses_pending</Badge>
                    <span className="text-sm">Waiting for AWS SES verification</span>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-800 text-sm">
                  <strong>Note:</strong> Only domains with <code className="bg-blue-100 px-1 rounded">status: "verified"</code> and <code className="bg-blue-100 px-1 rounded">canReceiveEmails: true</code> can be used to create email addresses.
                </p>
              </div>
            </div>

            {/* Using Domain Information */}
            <div>
              <h3 className="text-xl font-semibold mb-4">Using Domain Information</h3>
              <p className="text-muted-foreground mb-6">How to use domain data for email address operations.</p>
              
              <CodeBlock language="typescript" copyId="using-domain-info">
{`// Complete workflow: List domains and create email addresses
async function setupEmailAddresses() {
  // 1. Get all domains
  const domains = await inbound.getDomains()
  
  // 2. Find verified domains that can receive emails
  const verifiedDomains = domains.filter(d => 
    d.status === 'verified' && d.canReceiveEmails
  )
  
  if (verifiedDomains.length === 0) {
    throw new Error('No verified domains available')
  }
  
  // 3. Use the first verified domain
  const domain = verifiedDomains[0]
  console.log(\`Using domain: \${domain.domain} (ID: \${domain.id})\`)
  
  // 4. Create email addresses on this domain
  const emails = [
    'support@' + domain.domain,
    'hello@' + domain.domain,
    'contact@' + domain.domain
  ]
  
  for (const emailAddress of emails) {
    const email = await inbound.addEmail(
      domain.domain,  // Use domain name
      emailAddress,   // Full email address
      'webhook_123'   // Optional webhook ID
    )
    console.log(\`Created: \${email.address}\`)
  }
  
  return { domain, emailsCreated: emails.length }
}`}
              </CodeBlock>
            </div>
          </div>
        </section>

            {/* Email Addresses */}
            <section id="email-addresses">
          <div className="flex items-center gap-2 mb-6">
            <Envelope2 width="24" height="24" className="text-purple-600" />
            <h2 className="text-3xl font-bold">Email Addresses</h2>
          </div>
          <p className="text-xl text-muted-foreground mb-8">
            Create and manage email addresses on your domains
          </p>
          
          <div className="space-y-12">
            {/* Create Email */}
            <div>
              <h3 className="text-xl font-semibold mb-4">Create Email Address</h3>
              <p className="text-muted-foreground mb-6">Add a new email address to a verified domain.</p>
              
              <Tabs defaultValue="typescript" className="w-full">
                <TabsList>
                  <TabsTrigger value="typescript">TypeScript</TabsTrigger>
                  <TabsTrigger value="curl">cURL</TabsTrigger>
                </TabsList>
                <TabsContent value="typescript" className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-3">Request</h4>
                    <CodeBlock language="typescript" copyId="create-email-ts">
{`// Method 1: Using createEmail
const email = await inbound.createEmail({
  domain: 'example.com',
  email: 'hello@example.com',
  webhookId: 'webhook_123' // optional
})

// Method 2: Using convenience method
const email = await inbound.addEmail(
  'example.com',
  'hello@example.com',
  'webhook_123' // optional
)`}
                    </CodeBlock>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Response</h4>
                    <CodeBlock language="json" copyId="create-email-response">
{`{
  "id": "email_abc123",
  "address": "hello@example.com",
  "domainId": "indm_abc123",
  "webhookId": "webhook_123",
  "isActive": true,
  "createdAt": "2024-01-01T00:00:00.000Z"
}`}
                    </CodeBlock>
                  </div>
                </TabsContent>
                <TabsContent value="curl" className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-3">Request</h4>
                    <CodeBlock language="bash" copyId="create-email-curl">
{`curl -X POST https://your-domain.com/api/v1/domains \\
  -H "Authorization: Bearer your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "domain": "example.com",
    "email": "hello@example.com",
    "webhookId": "webhook_123"
  }'`}
                    </CodeBlock>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Response</h4>
                    <CodeBlock language="json" copyId="create-email-curl-response">
{`{
  "success": true,
  "data": {
    "id": "email_abc123",
    "address": "hello@example.com",
    "domainId": "indm_abc123",
    "webhookId": "webhook_123",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}`}
                    </CodeBlock>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* List Emails */}
            <div>
              <h3 className="text-xl font-semibold mb-4">List Email Addresses</h3>
              <p className="text-muted-foreground mb-6">Get all email addresses for a specific domain.</p>
              
              <Tabs defaultValue="typescript" className="w-full">
                <TabsList>
                  <TabsTrigger value="typescript">TypeScript</TabsTrigger>
                  <TabsTrigger value="curl">cURL</TabsTrigger>
                </TabsList>
                <TabsContent value="typescript" className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-3">Request</h4>
                    <CodeBlock language="typescript" copyId="list-emails-ts">
{`// Get just the emails array
const emails = await inbound.getEmails('example.com')

// Get full response with domain info
const response = await inbound.listEmails('example.com')
console.log(response.domain) // 'example.com'
console.log(response.emails) // EmailAddress[]`}
                    </CodeBlock>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Response</h4>
                    <CodeBlock language="json" copyId="list-emails-response">
{`[
  {
    "id": "email_abc123",
    "address": "hello@example.com",
    "webhookId": "webhook_123",
    "isActive": true,
    "isReceiptRuleConfigured": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]`}
                    </CodeBlock>
                  </div>
                </TabsContent>
                <TabsContent value="curl" className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-3">Request</h4>
                    <CodeBlock language="bash" copyId="list-emails-curl">
{`curl -X GET https://your-domain.com/api/v1/domains/example.com/emails \\
  -H "Authorization: Bearer your_api_key"`}
                    </CodeBlock>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Response</h4>
                    <CodeBlock language="json" copyId="list-emails-curl-response">
{`{
  "success": true,
  "data": {
    "domain": "example.com",
    "emails": [
      {
        "id": "email_abc123",
        "address": "hello@example.com",
        "webhookId": "webhook_123",
        "isActive": true,
        "isReceiptRuleConfigured": true,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}`}
                    </CodeBlock>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* Delete Email */}
            <div>
              <h3 className="text-xl font-semibold mb-4">Delete Email Address</h3>
              <p className="text-muted-foreground mb-6">Remove an email address from a domain.</p>
              
              <Tabs defaultValue="typescript" className="w-full">
                <TabsList>
                  <TabsTrigger value="typescript">TypeScript</TabsTrigger>
                  <TabsTrigger value="curl">cURL</TabsTrigger>
                </TabsList>
                <TabsContent value="typescript" className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-3">Request</h4>
                    <CodeBlock language="typescript" copyId="delete-email-ts">
{`const result = await inbound.deleteEmail('example.com', 'hello@example.com')
// or
const result = await inbound.removeEmail('example.com', 'hello@example.com')

console.log(result.message)`}
                    </CodeBlock>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Response</h4>
                    <CodeBlock language="json" copyId="delete-email-response">
{`{
  "message": "Email address hello@example.com removed from domain example.com"
}`}
                    </CodeBlock>
                  </div>
                </TabsContent>
                <TabsContent value="curl" className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-3">Request</h4>
                    <CodeBlock language="bash" copyId="delete-email-curl">
{`curl -X DELETE https://your-domain.com/api/v1/domains/example.com/emails \\
  -H "Authorization: Bearer your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "hello@example.com"
  }'`}
                    </CodeBlock>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Response</h4>
                    <CodeBlock language="json" copyId="delete-email-curl-response">
{`{
  "success": true,
  "message": "Email address hello@example.com removed from domain example.com"
}`}
                    </CodeBlock>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </section>

            {/* Webhooks */}
            <section id="webhooks">
          <div className="flex items-center gap-2 mb-6">
            <Webhook width="24" height="24" className="text-purple-600" />
            <h2 className="text-3xl font-bold">Webhooks</h2>
          </div>
          <p className="text-xl text-muted-foreground mb-8">
            Create and manage webhook endpoints for email processing
          </p>
          
          <div className="space-y-12">
            {/* Create Webhook */}
            <div>
              <h3 className="text-xl font-semibold mb-4">Create Webhook</h3>
              <p className="text-muted-foreground mb-6">Create a new webhook endpoint to receive email notifications.</p>
              
              <Tabs defaultValue="typescript" className="w-full">
                <TabsList>
                  <TabsTrigger value="typescript">TypeScript</TabsTrigger>
                  <TabsTrigger value="curl">cURL</TabsTrigger>
                </TabsList>
                <TabsContent value="typescript" className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-3">Request</h4>
                    <CodeBlock language="typescript" copyId="create-webhook-ts">
{`// Method 1: Using createWebhook
const webhook = await inbound.createWebhook({
  name: 'Email Processor',
  endpoint: 'https://api.example.com/webhook',
  description: 'Processes incoming emails',
  retry: 3,
  timeout: 30
})

// Method 2: Using convenience method
const webhook = await inbound.addWebhook(
  'Email Processor',
  'https://api.example.com/webhook',
  {
    description: 'Processes incoming emails',
    retry: 3,
    timeout: 30
  }
)`}
                    </CodeBlock>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Response</h4>
                    <CodeBlock language="json" copyId="create-webhook-response">
{`{
  "id": "webhook_abc123",
  "name": "Email Processor",
  "url": "https://api.example.com/webhook",
  "secret": "webhook_secret_for_verification",
  "description": "Processes incoming emails",
  "isActive": true,
  "timeout": 30,
  "retryAttempts": 3,
  "createdAt": "2024-01-01T00:00:00.000Z"
}`}
                    </CodeBlock>
                  </div>
                </TabsContent>
                <TabsContent value="curl" className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-3">Request</h4>
                    <CodeBlock language="bash" copyId="create-webhook-curl">
{`curl -X POST https://your-domain.com/api/v1/webhooks \\
  -H "Authorization: Bearer your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Email Processor",
    "endpoint": "https://api.example.com/webhook",
    "description": "Processes incoming emails",
    "retry": 3,
    "timeout": 30
  }'`}
                    </CodeBlock>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Response</h4>
                    <CodeBlock language="json" copyId="create-webhook-curl-response">
{`{
  "success": true,
  "data": {
    "id": "webhook_abc123",
    "name": "Email Processor",
    "url": "https://api.example.com/webhook",
    "secret": "webhook_secret_for_verification",
    "description": "Processes incoming emails",
    "isActive": true,
    "timeout": 30,
    "retryAttempts": 3,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}`}
                    </CodeBlock>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* List Webhooks */}
            <div>
              <h3 className="text-xl font-semibold mb-4">List Webhooks</h3>
              <p className="text-muted-foreground mb-6">Get all webhooks for your account.</p>
              
              <Tabs defaultValue="typescript" className="w-full">
                <TabsList>
                  <TabsTrigger value="typescript">TypeScript</TabsTrigger>
                  <TabsTrigger value="curl">cURL</TabsTrigger>
                </TabsList>
                <TabsContent value="typescript" className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-3">Request</h4>
                    <CodeBlock language="typescript" copyId="list-webhooks-ts">
{`const webhooks = await inbound.getWebhooks()
// or
const webhooks = await inbound.listWebhooks()`}
                    </CodeBlock>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Response</h4>
                    <CodeBlock language="json" copyId="list-webhooks-response">
{`[
  {
    "id": "webhook_abc123",
    "name": "Email Processor",
    "url": "https://api.example.com/webhook",
    "description": "Processes incoming emails",
    "isActive": true,
    "timeout": 30,
    "retryAttempts": 3,
    "totalDeliveries": 150,
    "successfulDeliveries": 145,
    "failedDeliveries": 5,
    "lastUsed": "2024-01-01T00:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]`}
                    </CodeBlock>
                  </div>
                </TabsContent>
                <TabsContent value="curl" className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-3">Request</h4>
                    <CodeBlock language="bash" copyId="list-webhooks-curl">
{`curl -X GET https://your-domain.com/api/v1/webhooks \\
  -H "Authorization: Bearer your_api_key"`}
                    </CodeBlock>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Response</h4>
                    <CodeBlock language="json" copyId="list-webhooks-curl-response">
{`{
  "success": true,
  "data": [
    {
      "id": "webhook_abc123",
      "name": "Email Processor",
      "url": "https://api.example.com/webhook",
      "description": "Processes incoming emails",
      "isActive": true,
      "timeout": 30,
      "retryAttempts": 3,
      "totalDeliveries": 150,
      "successfulDeliveries": 145,
      "failedDeliveries": 5,
      "lastUsed": "2024-01-01T00:00:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}`}
                    </CodeBlock>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* Delete Webhook */}
            <div>
              <h3 className="text-xl font-semibold mb-4">Delete Webhook</h3>
              <p className="text-muted-foreground mb-6">Remove a webhook by name.</p>
              
              <Tabs defaultValue="typescript" className="w-full">
                <TabsList>
                  <TabsTrigger value="typescript">TypeScript</TabsTrigger>
                  <TabsTrigger value="curl">cURL</TabsTrigger>
                </TabsList>
                <TabsContent value="typescript" className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-3">Request</h4>
                    <CodeBlock language="typescript" copyId="delete-webhook-ts">
{`const result = await inbound.deleteWebhook('Email Processor')
// or
const result = await inbound.removeWebhook('Email Processor')

console.log(result.message)`}
                    </CodeBlock>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Response</h4>
                    <CodeBlock language="json" copyId="delete-webhook-response">
{`{
  "message": "Webhook 'Email Processor' has been removed"
}`}
                    </CodeBlock>
                  </div>
                </TabsContent>
                <TabsContent value="curl" className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-3">Request</h4>
                    <CodeBlock language="bash" copyId="delete-webhook-curl">
{`curl -X DELETE https://your-domain.com/api/v1/webhooks \\
  -H "Authorization: Bearer your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Email Processor"
  }'`}
                    </CodeBlock>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Response</h4>
                    <CodeBlock language="json" copyId="delete-webhook-curl-response">
{`{
  "success": true,
  "message": "Webhook 'Email Processor' has been removed"
}`}
                    </CodeBlock>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </section>

            {/* Error Handling */}
            <section id="error-handling">
          <div className="flex items-center gap-2 mb-6">
            <Code2 width="24" height="24" className="text-purple-600" />
            <h2 className="text-3xl font-bold">Error Handling</h2>
          </div>
          <p className="text-xl text-muted-foreground mb-8">
            Understanding API errors and how to handle them
          </p>
          
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-semibold mb-4">HTTP Status Codes</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="default">200</Badge>
                    <span>Success</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="default">201</Badge>
                    <span>Created</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">400</Badge>
                    <span>Bad Request</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">401</Badge>
                    <span>Unauthorized</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">404</Badge>
                    <span>Not Found</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">409</Badge>
                    <span>Conflict</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">500</Badge>
                    <span>Internal Server Error</span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4">Error Response Format</h3>
              <CodeBlock language="json" copyId="error-format">
{`{
  "error": "Error message describing what went wrong"
}`}
              </CodeBlock>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4">TypeScript Error Handling</h3>
              <CodeBlock language="typescript" copyId="error-handling-ts">
{`import { InboundError } from 'exon-inbound'

try {
  const email = await inbound.createEmail({
    domain: 'nonexistent.com',
    email: 'test@nonexistent.com'
  })
} catch (error) {
  if (error instanceof InboundError) {
    console.error('API Error:', error.message)
    console.error('Status:', error.status)
    console.error('Code:', error.code)
  } else {
    console.error('Unexpected error:', error)
  }
}`}
              </CodeBlock>
            </div>
          </div>
        </section>

            {/* Complete Example */}
            <section id="complete-example">
          <div className="flex items-center gap-2 mb-6">
            <Terminal width="24" height="24" className="text-purple-600" />
            <h2 className="text-3xl font-bold">Complete Example</h2>
          </div>
          <p className="text-xl text-muted-foreground mb-8">
            A full example showing how to set up email infrastructure
          </p>
          
          <CodeBlock language="typescript" copyId="complete-example">
{`import { createInboundClient, InboundError } from 'exon-inbound'

async function setupEmailInfrastructure() {
  const inbound = createInboundClient({
    apiKey: process.env.INBOUND_API_KEY!
  })

  try {
    // 1. List existing domains and find verified ones
    const domains = await inbound.getDomains()
    console.log('Available domains:', domains.map(d => \`\${d.domain} (\${d.status})\`))
    
    // Find a verified domain that can receive emails
    const verifiedDomain = domains.find(d => 
      d.status === 'verified' && d.canReceiveEmails
    )
    
    if (!verifiedDomain) {
      throw new Error('No verified domains available. Please verify a domain first.')
    }
    
    console.log(\`Using domain: \${verifiedDomain.domain} (ID: \${verifiedDomain.id})\`)

    // 2. Create a webhook
    const webhook = await inbound.addWebhook(
      'Email Processor',
      'https://api.myapp.com/process-email',
      {
        description: 'Processes all incoming emails',
        timeout: 30,
        retry: 3
      }
    )
    console.log('Created webhook:', webhook.name)
    console.log('Webhook secret:', webhook.secret)

    // 3. Create email addresses on the verified domain
    const emailPrefixes = ['support', 'hello', 'contact']
    const createdEmails = []

    for (const prefix of emailPrefixes) {
      const emailAddress = \`\${prefix}@\${verifiedDomain.domain}\`
      const email = await inbound.addEmail(
        verifiedDomain.domain,  // Use the domain name
        emailAddress,           // Full email address
        webhook.id              // Assign the webhook
      )
      createdEmails.push(email)
      console.log(\`Created email: \${email.address}\`)
    }

    // 4. List all emails for the domain
    const domainEmails = await inbound.getEmails(verifiedDomain.domain)
    console.log(\`Total emails for \${verifiedDomain.domain}: \${domainEmails.length}\`)

    // 5. List all webhooks
    const allWebhooks = await inbound.getWebhooks()
    console.log(\`Total webhooks: \${allWebhooks.length}\`)

    // 6. Summary
    console.log('\\n📊 Setup Summary:')
    console.log(\`✅ Domain: \${verifiedDomain.domain}\`)
    console.log(\`✅ Webhook: \${webhook.name}\`)
    console.log(\`✅ Email addresses: \${createdEmails.length}\`)
    
    return {
      domain: verifiedDomain,
      webhook,
      emails: createdEmails
    }

  } catch (error) {
    if (error instanceof InboundError) {
      console.error('Inbound API Error:', error.message)
      if (error.status) {
        console.error('HTTP Status:', error.status)
      }
    } else {
      console.error('Unexpected error:', error)
    }
    throw error
  }
}

setupEmailInfrastructure()`}
          </CodeBlock>
        </section>

            {/* Footer */}
            <div className="text-center py-8 border-t">
              <p className="text-muted-foreground">
                Need help? Check out our <a href="/settings" className="text-purple-600 hover:underline">Settings page</a> to create API keys or contact support.
              </p>
            </div>
          </div>
        </main>

        {/* Right Sidebar - Reserved for future use */}
        <aside className="w-64 flex-shrink-0 border-l border-gray-200 bg-gray-50/50 p-6 sticky top-[89px] h-[calc(100vh-89px)] overflow-y-auto">
          <div className="text-center text-gray-500 text-sm">
            {/* Reserved for future content */}
          </div>
        </aside>
      </div>
    </div>
  )
} 