import type { Metadata } from "next";
import { MarketingNav, MarketingFooter } from "@/components/marketing-nav";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How inbound collects, uses, and protects your data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#1c1917] selection:bg-[#8161FF]/20">
      <div className="max-w-2xl mx-auto px-6">
        <MarketingNav />

        {/* Hero */}
        <section className="pt-20 pb-12">
          <h1 className="font-heading text-[32px] leading-[1.2] tracking-tight mb-2">Privacy Policy</h1>
          <p className="text-[#52525b] leading-relaxed">
            <strong>Effective Date:</strong> January 1, 2025 · <strong>Last Updated:</strong> January 1, 2025
          </p>
        </section>

      {/* Content */}
        <section className="py-8 border-t border-[#e7e5e4]">
          <div className="space-y-10">
            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">1. Introduction</h2>
              <p className="text-[#3f3f46] leading-relaxed">
                EXON ENTERPRISE LLC ("we," "our," or "us") operates the Inbound email receiving service (the "Service"). 
                This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service.
              </p>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">2. Information We Collect</h2>
              <div className="space-y-6 text-[#3f3f46] leading-relaxed">
                <div>
                  <h3 className="font-medium text-[#1c1917] mb-2">2.1 Information You Provide</h3>
                  <ul className="list-disc pl-6 space-y-1.5">
                <li>Account information (email address, name)</li>
                <li>Domain information and DNS settings</li>
                <li>Webhook endpoint URLs</li>
                <li>Payment information (processed by third-party providers)</li>
              </ul>
                </div>

                <div>
                  <h3 className="font-medium text-[#1c1917] mb-2">2.2 Email Data</h3>
                  <ul className="list-disc pl-6 space-y-1.5">
                <li>Email content received through your configured domains</li>
                <li>Email metadata (sender, recipient, subject, timestamps)</li>
                <li>Email delivery status and processing information</li>
              </ul>
                </div>

                <div>
                  <h3 className="font-medium text-[#1c1917] mb-2">2.3 Automatically Collected Information</h3>
                  <ul className="list-disc pl-6 space-y-1.5">
                <li>Usage data and analytics</li>
                <li>IP addresses and device information</li>
                <li>Service performance metrics</li>
              </ul>
                </div>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">3. How We Use Your Information</h2>
              <ul className="list-disc pl-6 space-y-1.5 text-[#3f3f46] leading-relaxed">
                <li>To provide and maintain the email receiving service</li>
                <li>To process and deliver emails to your webhook endpoints</li>
                <li>To provide customer support and respond to inquiries</li>
                <li>To improve and optimize our services</li>
                <li>To prevent fraud and ensure security</li>
                <li>To comply with legal obligations</li>
              </ul>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">4. Data Sharing and Disclosure</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>We do not sell, trade, or otherwise transfer your personal information to third parties except as described below:</p>
                <ul className="list-disc pl-6 space-y-1.5">
                <li>With your explicit consent</li>
                <li>To service providers who assist in our operations (AWS, payment processors)</li>
                <li>When required by law or to protect our rights</li>
                <li>In connection with a business transfer or acquisition</li>
              </ul>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">5. Data Security</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>We implement appropriate technical and organizational security measures to protect your information:</p>
                <ul className="list-disc pl-6 space-y-1.5">
                <li>Encryption in transit and at rest</li>
                <li>Regular security audits and monitoring</li>
                <li>Access controls and authentication</li>
                <li>Secure cloud infrastructure (AWS)</li>
              </ul>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">6. Data Retention</h2>
              <p className="text-[#3f3f46] leading-relaxed">
                We retain your information for as long as necessary to provide our services and comply with legal obligations. 
                Email data is typically retained for 30 days unless you configure different retention settings. 
                You may request deletion of your data at any time.
              </p>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">7. Your Rights</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>Depending on your location, you may have the following rights:</p>
                <ul className="list-disc pl-6 space-y-1.5">
                <li>Access to your personal information</li>
                <li>Correction of inaccurate data</li>
                <li>Deletion of your personal information</li>
                <li>Data portability</li>
                <li>Objection to processing</li>
              </ul>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">8. Cookies and Tracking</h2>
              <p className="text-[#3f3f46] leading-relaxed">
                We use cookies and similar technologies to improve your experience, analyze usage, and provide personalized content. 
                You can control cookie preferences through your browser settings.
              </p>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">9. International Data Transfers</h2>
              <p className="text-[#3f3f46] leading-relaxed">
                Your information may be transferred to and processed in countries other than your own. 
                We ensure appropriate safeguards are in place for such transfers.
              </p>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">10. Changes to This Policy</h2>
              <p className="text-[#3f3f46] leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of material changes by email or through our service.
              </p>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">11. Contact Us</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>If you have questions about this Privacy Policy, please contact us at:</p>
                <div className="bg-white border border-[#e7e5e4] rounded-lg p-4">
                  <p className="font-medium text-[#1c1917]">EXON ENTERPRISE LLC</p>
                  <p className="text-sm mt-1">Email: privacy@inbound.new</p>
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
