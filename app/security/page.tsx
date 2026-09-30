import type { Metadata } from "next";
import { MarketingNav, MarketingFooter } from "@/components/marketing-nav";

export const metadata: Metadata = {
  title: "Security",
  description: "How to report a security vulnerability in inbound and how we handle disclosures.",
  alternates: { canonical: "/security" },
};

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#1c1917] selection:bg-[#8161FF]/20">
      <div className="max-w-2xl mx-auto px-6">
        <MarketingNav />

        {/* Hero */}
        <section className="pt-20 pb-12">
          <h1 className="font-heading text-[32px] leading-[1.2] tracking-tight mb-2">Security</h1>
          <p className="text-[#52525b] leading-relaxed">
            <strong>Last Updated:</strong> December 10, 2025
          </p>
        </section>

        {/* Content */}
        <section className="py-8 border-t border-[#e7e5e4]">
          <div className="space-y-10">
            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">Vulnerability Disclosure</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>
                  At Inbound, we consider the security of our systems a top priority. But no matter how much effort we put into system security, 
                  there can still be vulnerabilities present.
                </p>
                <p>
                  If you discover a vulnerability, we would like to know about it so we can take steps to address it as quickly as possible. 
                  We would like to ask you to help us better protect our clients and our systems.
                </p>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">Out of Scope Vulnerabilities</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>
                  The following vulnerability types are <strong>out of scope</strong> and will not be considered for review. 
                  Reports submitted for these issues will not receive a response.
                </p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>Clickjacking on pages without sensitive actions</li>
                  <li>Cross-Site Request Forgery (CSRF) on forms without sensitive actions</li>
                  <li>Attacks requiring MITM or physical access to a user's device</li>
                  <li>Any activity that could lead to the disruption of our service (DoS/DDoS)</li>
                  <li>Content spoofing and text injection issues without showing an attack vector or ability to modify HTML/CSS</li>
                  <li>SPF/DKIM/DMARC email spoofing issues</li>
                  <li>Missing DNSSEC, CAA, CSP, X-Frame-Options, or other security headers</li>
                  <li>Lack of Secure or HTTP-only flag on non-sensitive cookies</li>
                  <li>Dead links or broken pages</li>
                  <li>Anything related to DNS configuration or email authentication records</li>
                  <li>Rate limiting issues or lack thereof</li>
                  <li>Self-XSS (Cross-Site Scripting that only affects the user themselves)</li>
                  <li>Reflected XSS without demonstrable impact</li>
                  <li>Missing best practices without demonstrable security impact</li>
                  <li>Theoretical vulnerabilities without working proof of concept</li>
                  <li>Vulnerabilities in third-party services or dependencies we don't control</li>
                  <li>Issues discovered through automated scanning tools without manual verification</li>
                  <li>Open redirects without demonstrable security impact</li>
                  <li>Username/email enumeration</li>
                  <li>Information disclosure with minimal security impact (e.g., stack traces, server version headers)</li>
                  <li>SSL/TLS configuration issues unless directly exploitable</li>
                  <li>Missing cookie attributes on non-session cookies</li>
                  <li>Logout CSRF</li>
                  <li>Reports from automated tools or scanners without manual validation</li>
                </ul>
                <p className="text-sm text-[#71717a] italic mt-4">
                  Note: Inbound reserves the right to designate any reported vulnerability as out of scope at our sole discretion.
                </p>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">What We Ask of You</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p className="font-medium text-[#1c1917]">Please Do:</p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>Provide sufficient information to reproduce the problem, including steps, URLs, and screenshots</li>
                  <li>Give us reasonable time to respond and address the issue before any public disclosure</li>
                  <li>Make a good faith effort to avoid privacy violations, destruction of data, and disruption of service</li>
                  <li>Only interact with accounts you own or have explicit permission to test</li>
                </ul>

                <p className="font-medium text-[#1c1917] mt-6">Please Do Not:</p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>Run automated scanners on our infrastructure or dashboard without prior authorization</li>
                  <li>Take advantage of the vulnerability beyond what is necessary to demonstrate the issue</li>
                  <li>Download, modify, or delete data that does not belong to you</li>
                  <li>Reveal the problem to others until it has been resolved</li>
                  <li>Use attacks on physical security, social engineering, distributed denial of service, spam, or applications of third parties</li>
                  <li>Demand payment or threaten disclosure before we have had time to investigate</li>
                </ul>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">How to Report a Vulnerability</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>
                  You can report security vulnerabilities by emailing us at:
                </p>
                <div className="bg-white border border-[#e7e5e4] rounded-lg p-4">
                  <p className="font-medium text-[#1c1917]">security@inbound.new</p>
                </div>
                <p className="mt-4">
                  Please include the following information in your report:
                </p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>Description of the vulnerability and its potential impact</li>
                  <li>Step-by-step instructions to reproduce the issue</li>
                  <li>Affected URLs, endpoints, or components</li>
                  <li>Any proof-of-concept code or screenshots</li>
                  <li>Your contact information for follow-up questions</li>
                </ul>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">Our Commitment</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>If you follow the guidelines above:</p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>We will not take legal action against you regarding the report</li>
                  <li>We will handle your report with strict confidentiality and not share your personal details with third parties without your permission</li>
                  <li>We will keep you informed of the progress towards resolving the issue</li>
                  <li>We strive to resolve all issues as quickly as possible</li>
                </ul>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">Security Practices</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>We implement reasonable security measures to protect your data:</p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>Data encryption in transit (TLS) and at rest</li>
                  <li>Secure cloud infrastructure hosted on AWS</li>
                  <li>Access controls and authentication</li>
                  <li>Regular security monitoring</li>
                </ul>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">Contact</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>For security-related inquiries, please contact us at:</p>
                <div className="bg-white border border-[#e7e5e4] rounded-lg p-4">
                  <p className="font-medium text-[#1c1917]">EXON ENTERPRISE LLC</p>
                  <p className="text-sm mt-1">Security: security@inbound.new</p>
                  <p className="text-sm">Website: inbound.new</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <MarketingFooter />
      </div>
    </div>
  );
}
