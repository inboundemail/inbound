"use client"

import { useState, useEffect } from 'react'
import { Highlighter } from "@/components/magicui/highlighter";
import Link from 'next/link'
import { VideoText } from "@/components/magicui/video-text";
import Image from 'next/image'
import { CustomInboundIcon } from "@/components/icons/customInbound"
import { Button } from "@/components/ui/button"
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { BackgroundBeams } from "@/components/ui/background-beams"
import { Boxes } from "@/components/ui/background-boxes"
import { TextGenerateEffect } from '@/components/ui/text-generate-effect';
import Copy2 from '@/components/icons/copy-2';
import Check2 from '@/components/icons/check-2';
import { ConnectingArrow } from '@/components/ui/connecting-arrow';
import InboxArrowDown from '@/components/icons/inbox-arrow-down';
import Settings3 from '@/components/icons/settings-3';
import PaperPlane2 from '@/components/icons/paper-plane-2';
import { SiteHeader } from "@/components/site-header";

// High-contrast Monokai theme with Monaspace Neon
const monokaiTheme = {
  ...tomorrow,
  'code[class*="language-"]': {
    ...tomorrow['code[class*="language-"]'],
    color: '#ffffff',
    background: '#1e1f20',
    fontFamily: '"Monaspace Neon", ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: '0.75rem',
    lineHeight: '1.5',
    fontWeight: '500'
  },
  'pre[class*="language-"]': {
    ...tomorrow['pre[class*="language-"]'],
    color: '#ffffff',
    background: '#1e1f20',
    margin: 0,
    padding: '1.5rem',
    overflow: 'auto',
    borderRadius: '0',
    fontFamily: '"Monaspace Neon", ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontWeight: '500'
  },
  'comment': { color: '#8a8a8a' },
  'prolog': { color: '#8a8a8a' },
  'doctype': { color: '#8a8a8a' },
  'cdata': { color: '#8a8a8a' },
  'punctuation': { color: '#ffffff' },
  'property': { color: '#ff6b9d' },
  'tag': { color: '#ff6b9d' },
  'constant': { color: '#c792ea' },
  'symbol': { color: '#c792ea' },
  'deleted': { color: '#c792ea' },
  'boolean': { color: '#c792ea' },
  'number': { color: '#c792ea' },
  'selector': { color: '#c3e88d' },
  'attr-name': { color: '#c3e88d' },
  'string': { color: '#ffcb6b' },
  'char': { color: '#ffcb6b' },
  'builtin': { color: '#c3e88d' },
  'inserted': { color: '#c3e88d' },
  'operator': { color: '#ff6b9d' },
  'entity': { color: '#ffffff' },
  'url': { color: '#ffffff' },
  'variable': { color: '#ffffff' },
  'atrule': { color: '#ffcb6b' },
  'attr-value': { color: '#ffcb6b' },
  'function': { color: '#82aaff' },
  'class-name': { color: '#82aaff' },
  'keyword': { color: '#ff6b9d' },
  'regex': { color: '#ffcb6b' },
  'important': { color: '#ff6b9d' }
}

export default function PSLandingPage() {
  const [animatedText, setAnimatedText] = useState('')
  const [copiedStates, setCopiedStates] = useState<Record<number, boolean>>({})

  const copyToClipboard = async (code: string, storyIndex: number) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedStates(prev => ({ ...prev, [storyIndex]: true }))

      // Reset the checkmark after 2 seconds
      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [storyIndex]: false }))
      }, 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  const problemStories = [
    {
      title: "the problem: email hell",
      type: "node.js",
      description: "you've been there. spending days configuring SMTP, parsing raw email headers, dealing with bounces...",
      code: `// You can't even get webhooks from existing providers 😢
const nodemailer = require('nodemailer')
const transporter = nodemailer.createTransporter({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: process.env.EMAIL, pass: process.env.PASSWORD },
  tls: { rejectUnauthorized: false }
})

// No webhook support - you're on your own
app.post('/webhook', (req, res) => {
  const rawEmail = req.body
  // Now what? Parse headers? Handle attachments? 
  // Good luck with that...
})`
    },
    {
      title: "the solution: inbound ✨ magic",
      description: "what if sending and receiving emails was as simple as making an API call?",
      code: `// With Inbound ✨
import { Inbound } from '@inboundemail/sdk'

const inbound = new Inbound(process.env.INBOUND_API_KEY!)

// Send email (Resend-compatible)
await inbound.emails.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<p>Thanks for signing up!</p>'
})

// That's it. No SMTP. No config. Just works.`
    },
    {
      title: "the superpower: auto-reply",
      description: "build AI agents that actually respond to emails. no more manual parsing or threading nightmares.",
      code: `const inbound = new Inbound(process.env.INBOUND_API_KEY!)

export async function POST(request: NextRequest) {
  try {
    const payload: InboundWebhookPayload = await request.json()
    
    const { email } = payload
    
    const { text } = await generateText({
      model: openai("o3-mini"),
      prompt: """
      You are a custom support agent for
      a company called "Inbound"
      The email is: \${email.subject}
      The email body is: \${email.html}
      """
    })

    await inbound.reply(email, {
      from: 'support@yourdomain.com',
      text: text,
      tags: [{ name: 'type', value: 'auto-reply' }]
    })
    
    return NextResponse.json({ success: true })
  } 
}`
    }
  ]

  const testimonials = [
    {
      company: "Cursor AI",
      person: "Sarah Chen, CTO",
      quote: "We were spending 2 weeks per feature just dealing with email infrastructure. Inbound eliminated that completely - our AI agents now handle customer emails in production.",
      logo: "C"
    },
    {
      company: "Anthropic",
      person: "Marcus Rodriguez, Lead Engineer",
      quote: "Before Inbound, we had 3 engineers just maintaining our email parsing pipeline. Now it's 3 lines of code and it actually works better.",
      logo: "A"
    },
    {
      company: "OpenAI",
      person: "Jessica Park, Product Lead",
      quote: "Our support bot went from 'maybe works sometimes' to 'handles 10k emails/day flawlessly' after switching to Inbound. Game changer.",
      logo: "O"
    },
    {
      company: "Vercel",
      person: "Alex Thompson, Developer",
      quote: "I was dreading the email integration sprint. Finished it in 20 minutes instead of 2 weeks. My manager thought I was joking.",
      logo: "V"
    }
  ]

  const painPoints = [
    {
      title: "No More SMTP Hell",
      description: "Skip the 47 environment variables and TLS certificate nightmares. Just works.",
      icon: "🔥",
      before: "2 weeks debugging SMTP",
      after: "2 minutes sending emails"
    },
    {
      title: "Webhook Parsing That Works",
      description: "Get clean JSON instead of raw email headers and MIME parsing disasters.",
      icon: "⚡",
      before: "500 lines of parsing code",
      after: "3 lines with perfect data"
    },
    {
      title: "Reply Threading Magic",
      description: "Automatic conversation threading. Your AI agents can actually have conversations.",
      icon: "💬",
      before: "Manual message-ID tracking",
      after: "Automatic conversation flow"
    },
    {
      title: "Domain Setup Simplified",
      description: "DNS records that actually make sense. Verification that works on the first try.",
      icon: "🌐",
      before: "DNS debugging for days",
      after: "One-click domain setup"
    },
    {
      title: "TypeScript Native",
      description: "IntelliSense that knows what you want before you type it. No more any types.",
      icon: "⚡",
      before: "Fighting with types",
      after: "Types that help you"
    },
    {
      title: "Production Ready",
      description: "Built for scale. Handle 10k emails/day or 10M. Same simple API.",
      icon: "🚀",
      before: "Scaling email is hard",
      after: "Scales automatically"
    }
  ]

  return (
    <div className="min-h-screen bg-[#1B1C1D] text-[#e5e5e5] font-['Outfit',sans-serif] relative">
      {/* CSS Variables for theme */}
      <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@100;200;300;400;500;600;700;800;900&display=swap');
                
                @font-face {
                font-family: 'Monaspace Neon';
                src: url('/MonaspaceNeon-Medium.woff') format('woff');
                font-weight: 500;
                font-style: normal;
                font-display: swap;
                }
                
            `}
      </style>

      <SiteHeader />

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20 relative z-10 overflow-hidden">
        <div className="text-center mb-16 relative z-20 flex flex-col items-center min-h-[60vh] sm:min-h-[75vh] justify-center">
          <div className="mb-6 sm:mb-8 bg-[#272822] rounded-lg overflow-hidden relative border-0.5 border-[#6C47FF]" style={{
            boxShadow: '0 0 0 1px #6C47FF, 0 0 20px rgba(108, 71, 255, 0.4), 0 0 40px rgba(108, 71, 255, 0.2)'
          }}>
            <img src="/vercel-oss.svg" alt="Vercel OSS" className="h-6 sm:h-8 p-2 sm:p-3 color-white" />
          </div>
          
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 sm:mb-6 leading-tight">
            <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
              <PaperPlane2 width={24} height={24} className="sm:w-[30px] sm:h-[30px] shrink-0" />
              <span>email platform for</span>
              <Settings3 width={24} height={24} className="sm:w-[30px] sm:h-[30px] shrink-0" />
              <Highlighter action="underline" color="#6C47FF">builders</Highlighter>
            </div>
            <TextGenerateEffect
              words="focus on your product, not configs"
              className="text-xl sm:text-2xl md:text-3xl font-bold leading-tight text-[#A18AFF] mt-1 sm:-mt-2"
              duration={0.5}
            />
          </h1>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-2xl mx-auto mb-4 leading-relaxed px-4">
            stop messing with multiple providers and ancient sdks
            <br className="hidden sm:block" />
            <span className="sm:hidden"> </span>
            inbound is the easiest way to send, receive, and reply to emails in your app
          </p>
          <div className="relative bg-[#272822] border border-[var(--border-primary)] rounded-md overflow-hidden mb-6 sm:mb-8 mx-auto" style={{ width: 'fit-content' }}>
            <div className="flex items-center pr-8 sm:pr-10">
              <pre className="px-2 py-1.5 sm:px-3 sm:py-2">
                <code className="text-[#ffffff] font-mono text-[10px] sm:text-xs whitespace-nowrap">npm i @inboundemail/sdk</code>
              </pre>
              <button
                onClick={() => copyToClipboard('npm i @inboundemail/sdk', -1)}
                className="absolute top-1/2 right-1.5 sm:right-2 -translate-y-1/2 p-1 sm:p-1.5 rounded hover:bg-[#3a3a3a] transition-colors duration-200 flex items-center justify-center"
                title={copiedStates[-1] ? "Copied!" : "Copy to clipboard"}
                aria-label="Copy to clipboard"
              >
                <div className={`transition-all duration-300 ease-in-out ${copiedStates[-1] ? 'scale-110' : 'scale-100'}`}>
                  {copiedStates[-1] ? (
                    <Check2 width={12} height={12} className="sm:w-3.5 sm:h-3.5 text-green-400" />
                  ) : (
                    <Copy2 width={12} height={12} className="sm:w-3.5 sm:h-3.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]" />
                  )}
                </div>
              </button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center w-full max-w-sm sm:max-w-none">
            <Button
              size="lg"
              className="bg-[var(--purple-primary)] hover:bg-[var(--purple-dark)] text-white border-0 px-6 sm:px-8 py-3 w-full sm:w-auto"
              asChild
            >
              <Link href="/logs" className="text-white">start building</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-[var(--purple-primary)] text-[var(--purple-primary)] hover:bg-[var(--purple-primary)] hover:text-white font-medium px-6 sm:px-8 py-3 w-full sm:w-auto"
              asChild
            >
              <Link href="https://docs.inbound.new">view docs</Link>
            </Button>
          </div>

          {/* Trusted by section */}
          <div className="mt-16 pt-8 border-t border-[var(--border-secondary)]">
            <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-6 font-medium text-center">
              trusted by builders at:
            </p>
            <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-4 text-[var(--text-muted)]">
              <span className="text-lg font-medium flex items-center gap-2 mr-1">
                <svg width="18" height="18" viewBox="0 0 58 57" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" clipRule="evenodd" d="M0 9.82759C0 4.39996 4.47705 0 9.99976 0H47.9989C53.5216 0 57.9986 4.39996 57.9986 9.82759V41.5893C57.9986 47.2045 50.7684 49.6414 47.2618 45.2082L36.2991 31.3488V48.1552C36.2991 53.04 32.2698 57 27.2993 57H9.99976C4.47705 57 0 52.6 0 47.1724V9.82759ZM9.99976 7.86207C8.89522 7.86207 7.99981 8.74206 7.99981 9.82759V47.1724C7.99981 48.2579 8.89522 49.1379 9.99976 49.1379H27.5993C28.1516 49.1379 28.2993 48.6979 28.2993 48.1552V25.6178C28.2993 20.0027 35.5295 17.5656 39.0361 21.9989L49.9988 35.8583V9.82759C49.9988 8.74206 50.1034 7.86207 48.9988 7.86207H9.99976Z" fill="var(--text-muted)" />
                  <path d="M48.0003 0C53.523 0 58 4.39996 58 9.82759V41.5893C58 47.2045 50.7699 49.6414 47.2633 45.2082L36.3006 31.3488V48.1552C36.3006 53.04 32.2712 57 27.3008 57C27.8531 57 28.3008 56.56 28.3008 56.0172V25.6178C28.3008 20.0027 35.5309 17.5656 39.0375 21.9989L50.0002 35.8583V1.96552C50.0002 0.879992 49.1048 0 48.0003 0Z" fill="var(--text-muted)" />
                </svg>

                neon
              </span>
              <span className="text-lg font-medium flex items-center gap-2">
                <svg height="24" width="24" viewBox="0 0 185 291" xmlns="http://www.w3.org/2000/svg"><g fill="none"><path d="M142.177 23.3423H173.437C179.612 23.3423 184.617 28.3479 184.617 34.5227V258.318C184.617 264.493 179.612 269.498 173.437 269.498H142.177V23.3423Z" fill="currentColor"></path><path d="M0 57.5604C0 52.8443 2.9699 48.6392 7.41455 47.0622L125.19 5.27404C132.441 2.70142 140.054 8.07871 140.054 15.7722V275.171C140.054 282.801 132.557 288.172 125.332 285.718L7.55682 245.715C3.03886 244.18 0 239.939 0 235.167V57.5604Z" fill="currentColor"></path></g></svg>
                churchspace
              </span>
              {/* <span className="text-sm font-medium">
                                <svg viewBox="0 0 2048 407" fill="none" xmlns="http://www.w3.org/2000/svg" width="80" height="17"><path fillRule="evenodd" clipRule="evenodd" d="M467.444 406.664L233.722 0.190918L0 406.664H467.444ZM703.186 388.161L898.51 18.668H814.024L679.286 287.007L544.547 18.668H460.061L655.385 388.161H703.186ZM2034.31 18.668V388.162H1964.37V18.668H2034.31ZM1644.98 250.25C1644.98 221.454 1650.99 196.127 1663.01 174.27C1675.03 152.412 1691.79 135.586 1713.28 123.79C1734.77 111.994 1759.91 106.095 1788.69 106.095C1814.19 106.095 1837.14 111.647 1857.54 122.749C1877.94 133.851 1894.15 150.331 1906.17 172.188C1918.19 194.046 1924.39 220.76 1924.75 252.332V268.465H1718.75C1720.2 291.363 1726.94 309.404 1738.96 322.588C1751.35 335.425 1767.93 341.843 1788.69 341.843C1801.8 341.843 1813.83 338.374 1824.75 331.435C1835.68 324.496 1843.88 315.129 1849.34 303.333L1920.93 308.537C1912.18 334.557 1895.79 355.374 1871.75 370.986C1847.7 386.599 1820.02 394.405 1788.69 394.405C1759.91 394.405 1734.77 388.507 1713.28 376.711C1691.79 364.915 1675.03 348.088 1663.01 326.231C1650.99 304.373 1644.98 279.047 1644.98 250.25ZM1852.62 224.23C1850.07 201.678 1842.97 185.199 1831.31 174.79C1819.65 164.035 1805.45 158.657 1788.69 158.657C1769.38 158.657 1753.72 164.382 1741.7 175.831C1729.67 187.28 1722.21 203.413 1719.29 224.23H1852.62ZM1526.96 174.79C1538.62 184.158 1545.9 197.168 1548.82 213.821L1620.94 210.178C1618.39 189.015 1610.93 170.627 1598.54 155.014C1586.15 139.402 1570.13 127.433 1550.45 119.106C1531.15 110.432 1509.84 106.095 1486.52 106.095C1457.74 106.095 1432.61 111.994 1411.11 123.79C1389.62 135.586 1372.86 152.412 1360.84 174.27C1348.82 196.127 1342.81 221.454 1342.81 250.25C1342.81 279.047 1348.82 304.373 1360.84 326.231C1372.86 348.088 1389.62 364.915 1411.11 376.711C1432.61 388.507 1457.74 394.405 1486.52 394.405C1510.56 394.405 1532.42 390.068 1552.09 381.395C1571.77 372.374 1587.79 359.711 1600.18 343.404C1612.57 327.098 1620.03 308.016 1622.58 286.159L1549.91 283.036C1547.36 301.424 1540.25 315.649 1528.6 325.71C1516.94 335.425 1502.91 340.282 1486.52 340.282C1463.94 340.282 1446.45 332.476 1434.06 316.863C1421.68 301.251 1415.49 279.047 1415.49 250.25C1415.49 221.454 1421.68 199.25 1434.06 183.637C1446.45 168.025 1463.94 160.219 1486.52 160.219C1502.19 160.219 1515.66 165.076 1526.96 174.79ZM1172.15 112.328H1237.24L1239.12 165.414C1243.74 150.388 1250.16 138.719 1258.39 130.407C1270.32 118.355 1286.96 112.328 1308.29 112.328H1334.87V169.148H1307.75C1292.56 169.148 1280.09 171.214 1270.32 175.346C1260.92 179.478 1253.69 186.021 1248.63 194.975C1243.93 203.928 1241.58 215.292 1241.58 229.066V388.161H1172.15V112.328ZM871.925 174.27C859.904 196.127 853.893 221.454 853.893 250.25C853.893 279.047 859.904 304.373 871.925 326.231C883.947 348.088 900.704 364.915 922.198 376.711C943.691 388.507 968.827 394.405 997.606 394.405C1028.93 394.405 1056.62 386.599 1080.66 370.986C1104.71 355.374 1121.1 334.557 1129.84 308.537L1058.26 303.333C1052.8 315.129 1044.6 324.496 1033.67 331.435C1022.74 338.374 1010.72 341.843 997.606 341.843C976.841 341.843 960.266 335.425 947.88 322.588C935.858 309.404 929.119 291.363 927.662 268.465H1133.67V252.332C1133.3 220.76 1127.11 194.046 1115.09 172.188C1103.07 150.331 1086.86 133.851 1066.46 122.749C1046.06 111.647 1023.11 106.095 997.606 106.095C968.827 106.095 943.691 111.994 922.198 123.79C900.704 135.586 883.947 152.412 871.925 174.27ZM1040.23 174.79C1051.88 185.199 1058.99 201.678 1061.54 224.23H928.208C931.123 203.413 938.591 187.28 950.612 175.831C962.634 164.382 978.298 158.657 997.606 158.657C1014.36 158.657 1028.57 164.035 1040.23 174.79Z" fill="currentColor"></path></svg>
                            </span> */}
              <span className="text-sm font-medium">
                <svg width="65" height="24" viewBox="0 0 77 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M35.1481 16.7381C34.7521 17.1486 34.2765 17.4741 33.7505 17.6947C33.2245 17.9154 32.659 18.0265 32.0886 18.0213C31.6069 18.0359 31.1273 17.9517 30.6794 17.7739C30.2315 17.5961 29.8247 17.3285 29.4841 16.9875C28.8654 16.3421 28.5093 15.4206 28.5093 14.3221C28.5093 12.1231 29.941 10.619 32.0886 10.619C32.6646 10.6109 33.2353 10.7301 33.7599 10.968C34.2845 11.206 34.7501 11.5568 35.1234 11.9955L36.9816 10.3525C35.7707 8.8827 33.8059 8.12305 31.9401 8.12305C28.2885 8.12305 25.6992 10.64 25.6992 14.343C25.6992 16.1745 26.3427 17.7167 27.4279 18.8057C28.5131 19.8947 30.0591 20.5344 31.843 20.5344C34.16 20.5344 36.0087 19.5939 37.0463 18.4116L35.1481 16.7381Z" fill="var(--text-muted)" />
                  <path d="M38.7266 3.42773H41.4929V20.3398H38.7266V3.42773Z" fill="var(--text-muted)" />
                  <path d="M54.8179 15.2828C54.8635 14.9145 54.8889 14.5439 54.894 14.1728C54.894 10.6659 52.5979 8.12611 49.0472 8.12611C48.2641 8.11071 47.4861 8.25581 46.7612 8.55246C46.0363 8.84911 45.3797 9.29104 44.832 9.85102C43.7944 10.94 43.1719 12.4822 43.1719 14.3213C43.1719 18.07 45.8144 20.5374 49.3176 20.5374C51.6688 20.5374 53.3614 19.5855 54.3762 18.2947L52.5637 16.6897L52.4742 16.6136C52.1146 17.0634 51.6561 17.4243 51.1344 17.6683C50.6127 17.9123 50.0419 18.0328 49.4661 18.0205C47.6879 18.0205 46.4046 16.9829 46.0391 15.2828H54.8179ZM46.0848 13.0628C46.2083 12.5269 46.4613 12.0295 46.8216 11.614C47.1214 11.2874 47.4883 11.0293 47.897 10.8574C48.3058 10.6856 48.7468 10.604 49.19 10.6183C50.7702 10.6183 51.7602 11.6064 52.101 13.0628H46.0848Z" fill="var(--text-muted)" />
                  <path d="M63.445 8.08984V11.1741C63.1251 11.1494 62.8034 11.1246 62.6073 11.1246C60.513 11.1246 59.325 12.6287 59.325 14.603V20.3394H56.5625V8.2612H59.325V10.0908H59.3498C60.2884 8.80761 61.6344 8.09366 63.1004 8.09366L63.445 8.08984Z" fill="var(--text-muted)" />
                  <path d="M69.8866 15.2812L67.8894 17.5031V20.3398H65.125V3.42773H67.8894V13.8019L72.8224 8.29975H76.1046L71.7638 13.1603L76.1808 20.3398H73.0718L69.938 15.2812H69.8866Z" fill="var(--text-muted)" />
                  <path d="M19.116 3.1608L16.2354 6.04135C16.1449 6.13177 16.0266 6.18918 15.8996 6.20437C15.7725 6.21956 15.6441 6.19165 15.5348 6.12513C14.4017 5.44155 13.0949 5.10063 11.7722 5.14354C10.4495 5.18645 9.16759 5.61134 8.08114 6.36692C7.41295 6.83202 6.83276 7.41221 6.36765 8.0804C5.61297 9.16751 5.18848 10.4495 5.14524 11.7722C5.10201 13.0949 5.44187 14.4019 6.12395 15.536C6.19 15.6451 6.21764 15.7731 6.20246 15.8998C6.18728 16.0264 6.13015 16.1443 6.04018 16.2347L3.15962 19.1152C3.10162 19.1736 3.03168 19.2188 2.95459 19.2476C2.87751 19.2765 2.79511 19.2883 2.71302 19.2824C2.63093 19.2764 2.5511 19.2528 2.479 19.2131C2.40689 19.1734 2.34422 19.1186 2.29527 19.0524C0.736704 16.9101 -0.0687588 14.3121 0.0046021 11.6639C0.077963 9.01568 1.02602 6.46625 2.70079 4.41354C3.21208 3.78549 3.78622 3.21134 4.41428 2.70006C6.46683 1.02574 9.01589 0.0779624 11.6637 0.00460332C14.3115 -0.0687557 16.9091 0.736432 19.0512 2.29453C19.1179 2.34332 19.1731 2.40598 19.2131 2.47818C19.2532 2.55038 19.2771 2.6304 19.2833 2.71274C19.2895 2.79508 19.2777 2.87778 19.2488 2.95513C19.2199 3.03248 19.1746 3.10265 19.116 3.1608Z" fill="var(--text-muted)" />
                  <path d="M19.1135 20.8289L16.2329 17.9483C16.1424 17.8579 16.0241 17.8005 15.8971 17.7853C15.7701 17.7701 15.6416 17.798 15.5323 17.8645C14.4639 18.509 13.2398 18.8497 11.9921 18.8497C10.7443 18.8497 9.52022 18.509 8.45181 17.8645C8.34252 17.798 8.21406 17.7701 8.08701 17.7853C7.95997 17.8005 7.84171 17.8579 7.75119 17.9483L4.87063 20.8289C4.81022 20.8869 4.76333 20.9576 4.73329 21.0358C4.70324 21.114 4.69078 21.1979 4.69678 21.2815C4.70277 21.3651 4.72708 21.4463 4.76799 21.5194C4.80889 21.5926 4.86538 21.6558 4.93346 21.7046C6.98391 23.1965 9.45442 24.0001 11.9902 24.0001C14.5259 24.0001 16.9964 23.1965 19.0469 21.7046C19.1152 21.6561 19.172 21.5931 19.2133 21.5201C19.2545 21.4471 19.2792 21.366 19.2856 21.2824C19.2919 21.1988 19.2798 21.1148 19.2501 21.0365C19.2203 20.9581 19.1737 20.8872 19.1135 20.8289V20.8289Z" fill="var(--text-muted)" />
                  <path d="M11.9973 15.4223C13.8899 15.4223 15.4243 13.888 15.4243 11.9953C15.4243 10.1027 13.8899 8.56836 11.9973 8.56836C10.1046 8.56836 8.57031 10.1027 8.57031 11.9953C8.57031 13.888 10.1046 15.4223 11.9973 15.4223Z" fill="var(--text-muted)" />
                  <defs>
                    <linearGradient id="paint0_linear_26568_214324" x1="16.4087" y1="-1.75881" x2="-7.88473" y2="22.5365" gradientUnits="userSpaceOnUse">
                      <stop stopColor="var(--text-muted)" />
                      <stop offset="0.5" stopColor="var(--text-muted)" />
                      <stop offset="1" stopColor="var(--text-muted)" />
                    </linearGradient>
                  </defs>
                </svg>

              </span>
            </div>
          </div>
        </div>

        {/* Problem-Solution Story */}
        <div className="space-y-8 relative z-20">
          {problemStories.map((story, i) => (
            <>
              <div key={i} className="grid md:grid-cols-4 gap-8 items-center">
                <div className={`space-y-4 md:col-span-2 ${i % 2 === 1 ? 'md:order-2' : ''}`}>
                  <h3 className="text-2xl font-bold text-[var(--text-primary)]">{story.title}</h3>
                  <p className="text-lg text-[var(--text-secondary)] leading-relaxed">{story.description}</p>
                </div>
                <div className={`md:col-span-2 ${i % 2 === 1 ? 'md:order-1' : ''}`}>
                  <div className="bg-[#1e1f20] border border-[var(--border-primary)] rounded-lg overflow-hidden">
                    <div className="py-1.5 px-4 bg-[#2a2b2c] border-b border-[var(--border-primary)] font-mono text-xs flex items-center gap-2 font-bold text-[var(--text-secondary)] justify-between">
                      <div className='flex items-center gap-2'>
                        <Image src="/nodejs.png" alt="node.js" width={16} height={16} />
                        <span>node.js</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(story.code, i)}
                        className="p-1 rounded hover:bg-[#3a3a3a] transition-colors duration-200 flex items-center justify-center"
                        title={copiedStates[i] ? "Copied!" : "Copy code"}
                      >
                        <div className={`transition-all duration-300 ease-in-out ${copiedStates[i] ? 'scale-110' : 'scale-100'}`}>
                          {copiedStates[i] ? (
                            <Check2 width={12} height={12} className="text-green-400" />
                          ) : (
                            <Copy2 width={12} height={12} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]" />
                          )}
                        </div>
                      </button>
                    </div>
                    <SyntaxHighlighter
                      language="javascript"
                      style={monokaiTheme}
                      customStyle={{
                        margin: 0,
                        borderRadius: 0,
                        background: '#1e1f20'
                      }}
                    >
                      {story.code}
                    </SyntaxHighlighter>
                  </div>
                </div>
              </div>

              {/* Connecting Arrow between stories */}
              {i < problemStories.length - 1 && (
                <div className={`hidden md:flex ${i % 2 === 0 ? 'justify-end pr-[15%]' : 'justify-start pl-[15%]'} py-4`}>
                  <ConnectingArrow
                    color="#FFFFFF"
                    width={100}
                    height={100}
                    className={`opacity-50 hover:opacity-70 transition-opacity duration-300 ${i % 2 === 0 ? '' : 'scale-x-[-1]'}`}
                  />
                </div>
              )}
            </>
          ))}
        </div>

        {/* Background Beams for Hero */}
        <div className="absolute inset-0 h-[100vh]">
          <BackgroundBeams className='' />
        </div>
      </section>

      {/* Pain Points & Solutions */}
      {/* <section id="features" className="max-w-6xl mx-auto px-6 py-20 relative z-10">
                <h2 className="text-3xl font-bold text-center mb-4">stop suffering with email</h2>
                <p className="text-[var(--text-secondary)] text-center mb-16 text-base">
                    We've all been there. Here's how Inbound fixes the pain.
                </p>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {painPoints.map((point, i) => (
                        <div
                            key={i}
                            className="bg-[var(--bg-card)] border border-[var(--border-secondary)] rounded-lg p-6 hover:bg-[var(--bg-card-hover)] hover:border-[var(--purple-primary)]/50 transition-all duration-200"
                        >
                            <div className="text-2xl mb-4">{point.icon}</div>
                            <h3 className="text-lg font-semibold mb-2 text-[var(--purple-primary)]">{point.title}</h3>
                            <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-4">{point.description}</p>
                            <div className="space-y-2">
                                <div className="text-xs text-red-400">❌ Before: {point.before}</div>
                                <div className="text-xs text-green-400">✅ After: {point.after}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </section> */}

      {/* Reality Check Section */}
      <section id="examples" className="bg-[#0f0f0f] py-20 relative z-10 overflow-hidden">
        {/* Background Boxes */}
        <div className="absolute inset-0 z-0">
          <Boxes />
        </div>
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <h2 className="text-3xl font-bold text-center mb-12">let's be honest about email</h2>

          <div className="grid md:grid-cols-4 gap-8 items-center">
            {/* What You're Probably Doing Now */}
            <div className="space-y-4 md:col-span-2">
              <h3 className="text-2xl font-bold text-red-400">What You're Probably Doing Now</h3>
              <div className="bg-[#2a2b2c] border border-[var(--border-secondary)] rounded-lg p-6 space-y-2 leading-relaxed">
                <p>• Googling "how to send email in Node.js" for the 17th time</p>
                <p>• Wrestling with nodemailer configuration that breaks in production</p>
                <p>• Manually parsing email headers like it's 1995</p>
                <p>• Building your own webhook endpoint and hoping it works</p>
                <p>• Spending more time on email than your actual product</p>
                <p>• <Highlighter action="underline" color="#6C47FF">inbound</Highlighter> to the rescue</p>
              </div>
            </div>

            {/* What You Could Be Doing */}
            <div className="md:col-span-2">
              <div className="space-y-4 mb-4">
                <h3 className="text-2xl font-bold text-green-400">What You Could Be Doing</h3>
              </div>
              <div className="bg-[#1e1f20] border border-[var(--border-primary)] rounded-lg overflow-hidden">
                <div className="py-1.5 px-4 bg-[#2a2b2c] border-b border-[var(--border-primary)] font-mono text-xs flex items-center gap-2 font-bold text-[var(--text-secondary)] justify-between">
                  <div className='flex items-center gap-2'>
                    <Image src="/nodejs.png" alt="node.js" width={16} height={16} />
                    <span>node.js</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(`// Install once
npm install @inboundemail/sdk

// Send emails forever  
await inbound.emails.send(emailData)

// That's it. Seriously.`, 999)}
                    className="p-1 rounded hover:bg-[#3a3a3a] transition-colors duration-200 flex items-center justify-center"
                    title={copiedStates[999] ? "Copied!" : "Copy code"}
                  >
                    <div className={`transition-all duration-300 ease-in-out ${copiedStates[999] ? 'scale-110' : 'scale-100'}`}>
                      {copiedStates[999] ? (
                        <Check2 width={12} height={12} className="text-green-400" />
                      ) : (
                        <Copy2 width={12} height={12} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]" />
                      )}
                    </div>
                  </button>
                </div>
                <SyntaxHighlighter
                  language="javascript"
                  style={monokaiTheme}
                  customStyle={{
                    margin: 0,
                    borderRadius: 0,
                    background: '#1e1f20'
                  }}
                >
                  {`// Install once
npm install @inboundemail/sdk

// Send emails forever ♾️
await inbound.emails.send(emailData)

// That's it. Seriously.`}
                </SyntaxHighlighter>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      {/* <section id="testimonials" className="max-w-6xl mx-auto px-6 py-20 relative z-10">
                <h2 className="text-3xl font-bold text-center mb-4">developers who escaped email hell</h2>
                <p className="text-[var(--text-secondary)] text-center mb-16 text-base">
                    Real stories from teams who got their time back
                </p>
                <div className="grid md:grid-cols-2 gap-8">
                    {testimonials.map((testimonial, i) => (
                        <div
                            key={i}
                            className="bg-[var(--bg-card)] border border-[var(--border-secondary)] rounded-lg p-6 hover:bg-[var(--bg-card-hover)] hover:border-[var(--purple-primary)]/50 transition-all duration-200"
                        >
                            <div className="flex items-center gap-4 mb-4">
                                <CustomInboundIcon
                                    size={48}
                                    backgroundColor="var(--purple-primary)"
                                    text={testimonial.logo}
                                    iconColor="white"
                                />
                                <div>
                                    <div className="font-semibold text-[var(--purple-primary)]">{testimonial.company}</div>
                                    <div className="text-sm text-[var(--text-muted)]">{testimonial.person}</div>
                                </div>
                            </div>
                            <p className="text-sm text-[var(--text-secondary)] leading-relaxed italic">
                                "{testimonial.quote}"
                            </p>
                        </div>
                    ))}
                </div>
            </section> */}

      {/* SDK Highlight */}
      <section className="bg-[#0f0f0f] py-20 relative z-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-8">
              <span className="font-mono p-2 bg-[#1a1a1a] rounded-lg">@inboundemail/sdk</span>
            </h2>
            <p className="text-lg text-[var(--text-secondary)] leading-relaxed">
              The simplest way to handle email in your applications.
              Send, receive, and reply with full TypeScript support.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {/* Send Email Example */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">
                <Highlighter action="underline" color="#6C47FF">
                  Send
                </Highlighter>
              </h3>
              <div className="bg-[#1e1f20] border border-[var(--border-primary)] rounded-lg overflow-hidden">
                <div className="py-1.5 px-4 bg-[#2a2b2c] border-b border-[var(--border-primary)] font-mono text-xs flex items-center gap-2 font-bold text-[var(--text-secondary)] justify-between">
                  <div className='flex items-center gap-2'>
                    <Image src="/nodejs.png" alt="node.js" width={16} height={16} />
                    <span>send.js</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(`await inbound.emails.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Thanks for signing up!</h1>'
})`, 1001)}
                    className="p-1 rounded hover:bg-[#3a3a3a] transition-colors duration-200 flex items-center justify-center"
                    title={copiedStates[1001] ? "Copied!" : "Copy code"}
                  >
                    <div className={`transition-all duration-300 ease-in-out ${copiedStates[1001] ? 'scale-110' : 'scale-100'}`}>
                      {copiedStates[1001] ? (
                        <Check2 width={12} height={12} className="text-green-400" />
                      ) : (
                        <Copy2 width={12} height={12} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]" />
                      )}
                    </div>
                  </button>
                </div>
                <SyntaxHighlighter
                  language="javascript"
                  style={monokaiTheme}
                  customStyle={{
                    margin: 0,
                    borderRadius: 0,
                    background: '#1e1f20',
                    fontSize: '0.7rem',
                    padding: '1rem'
                  }}
                >
                  {`await inbound.emails.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Thanks for signing up!</h1>'
})`}
                </SyntaxHighlighter>
              </div>
            </div>

            {/* Receive Example */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">
                <Highlighter action="underline" color="#6C47FF">
                  Receive
                </Highlighter>
              </h3>
              <div className="bg-[#1e1f20] border border-[var(--border-primary)] rounded-lg overflow-hidden">
                <div className="py-1.5 px-4 bg-[#2a2b2c] border-b border-[var(--border-primary)] font-mono text-xs flex items-center gap-2 font-bold text-[var(--text-secondary)] justify-between">
                  <div className='flex items-center gap-2'>
                    <Image src="/nodejs.png" alt="node.js" width={16} height={16} />
                    <span>receive.js</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(`export async function POST(req: Request) {
  const { email } = await req.json()
  
  // Email parsed & ready to use
  console.log(email.subject, email.html)
  
  return Response.json({ success: true })
}`, 1002)}
                    className="p-1 rounded hover:bg-[#3a3a3a] transition-colors duration-200 flex items-center justify-center"
                    title={copiedStates[1002] ? "Copied!" : "Copy code"}
                  >
                    <div className={`transition-all duration-300 ease-in-out ${copiedStates[1002] ? 'scale-110' : 'scale-100'}`}>
                      {copiedStates[1002] ? (
                        <Check2 width={12} height={12} className="text-green-400" />
                      ) : (
                        <Copy2 width={12} height={12} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]" />
                      )}
                    </div>
                  </button>
                </div>
                <SyntaxHighlighter
                  language="javascript"
                  style={monokaiTheme}
                  customStyle={{
                    margin: 0,
                    borderRadius: 0,
                    background: '#1e1f20',
                    fontSize: '0.7rem',
                    padding: '1rem'
                  }}
                >
                  {`export async function POST(req: Request) {
  const { email } = await req.json()
  
  // Email parsed & ready to use
  console.log(email.subject, email.html)
  
  return Response.json({ success: true })
}`}
                </SyntaxHighlighter>
              </div>
            </div>

            {/* Reply Example */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">
                <Highlighter action="underline" color="#6C47FF">
                  Reply
                </Highlighter>
              </h3>
              <div className="bg-[#1e1f20] border border-[var(--border-primary)] rounded-lg overflow-hidden">
                <div className="py-1.5 px-4 bg-[#2a2b2c] border-b border-[var(--border-primary)] font-mono text-xs flex items-center gap-2 font-bold text-[var(--text-secondary)] justify-between">
                  <div className='flex items-center gap-2'>
                    <Image src="/nodejs.png" alt="node.js" width={16} height={16} />
                    <span>reply.js</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(`await inbound.reply(email, {
  from: 'support@yourdomain.com',
  text: 'Thanks for your message!',
  tags: [{ name: 'type', value: 'auto-reply' }]
})`, 1003)}
                    className="p-1 rounded hover:bg-[#3a3a3a] transition-colors duration-200 flex items-center justify-center"
                    title={copiedStates[1003] ? "Copied!" : "Copy code"}
                  >
                    <div className={`transition-all duration-300 ease-in-out ${copiedStates[1003] ? 'scale-110' : 'scale-100'}`}>
                      {copiedStates[1003] ? (
                        <Check2 width={12} height={12} className="text-green-400" />
                      ) : (
                        <Copy2 width={12} height={12} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]" />
                      )}
                    </div>
                  </button>
                </div>
                <SyntaxHighlighter
                  language="javascript"
                  style={monokaiTheme}
                  customStyle={{
                    margin: 0,
                    borderRadius: 0,
                    background: '#1e1f20',
                    fontSize: '0.7rem',
                    padding: '1rem'
                  }}
                >
                  {`await inbound.reply(email, {
  from: 'support@yourdomain.com',
  text: 'Thanks for your message!',
  tags: [{ name: 'type', value: 'auto-reply' }]
})`}
                </SyntaxHighlighter>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center relative z-10">
        <h2 className="text-3xl font-bold mb-4">ready to escape email hell?</h2>
        <p className="text-lg text-[var(--text-secondary)] mb-12">
          Stop wasting time on email infrastructure. Start building features that matter.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            asChild
          >
            <Link href="/login">start free</Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            asChild
          >
            <Link href="https://docs.inbound.new">read docs</Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border-secondary)] bg-[#0a0a0a] py-12 relative z-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <Image src="/inbound-logo-3.png" alt="inbound" width={32} height={32} />
              <span className="text-xl font-semibold text-[var(--text-primary)]">inbound</span>
            </div>
            <div className="flex gap-8 text-sm text-[var(--text-muted)]">
              <Link href="https://docs.inbound.new" className="hover:text-[var(--purple-primary)] transition-colors">docs</Link>
              <Link href="https://inbound.new/privacy" className="hover:text-[var(--purple-primary)] transition-colors">privacy</Link>
              <Link href="https://inbound.new/terms" className="hover:text-[var(--purple-primary)] transition-colors">terms</Link>
              <a href="mailto:support@inbound.new" className="hover:text-[var(--purple-primary)] transition-colors">support</a>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-[var(--border-secondary)] text-center text-sm text-[var(--text-muted)]">
            © {new Date().getFullYear()} inbound (by exon). The all-in-one email toolkit for developers.
          </div>
        </div>
      </footer>
    </div>
  )
}
