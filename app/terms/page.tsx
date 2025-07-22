export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="px-6 py-6 border-b border-gray-100">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-2">
            <img
              src="/inbound-logo-3.png"
              alt="Inbound Logo"
              width={32}
              height={32}
              className="inline-block align-bottom"
            />
            <span className="text-2xl font-bold text-black">inbound</span>
          </div>
          <a
            href="/"
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            ← Back to Home
          </a>
        </div>
      </header>

      {/* Content */}
      <main className="px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-gray-900 mb-8">
            Terms of Service
          </h1>

          <div className="prose prose-lg max-w-none">
            <p className="text-gray-600 mb-8">
              <strong>Effective Date:</strong> January 1, 2025
              <br />
              <strong>Last Updated:</strong> January 1, 2025
            </p>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                1. Agreement to Terms
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                These Terms of Service ("Terms") constitute a legally binding
                agreement between you and EXON ENTERPRISE LLC ("Company," "we,"
                "our," or "us") concerning your access to and use of the Inbound
                email receiving service (the "Service").
              </p>
              <p className="text-gray-700 leading-relaxed">
                By accessing or using our Service, you agree to be bound by
                these Terms. If you do not agree to these Terms, you may not
                access or use the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                2. Description of Service
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Inbound is an email receiving service that allows you to:
              </p>
              <ul className="list-disc pl-6 text-gray-700">
                <li>Configure email receiving for your domains</li>
                <li>Receive emails via webhook endpoints</li>
                <li>Process and filter incoming emails</li>
                <li>Access email analytics and logs</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                3. User Accounts and Registration
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                To access certain features of the Service, you must create an
                account. You agree to:
              </p>
              <ul className="list-disc pl-6 text-gray-700">
                <li>Provide accurate and complete registration information</li>
                <li>Maintain the security of your account credentials</li>
                <li>
                  Promptly update your account information when it changes
                </li>
                <li>
                  Accept responsibility for all activities under your account
                </li>
                <li>Notify us immediately of any unauthorized access</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                4. Acceptable Use Policy
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                You agree not to use the Service to:
              </p>
              <ul className="list-disc pl-6 text-gray-700">
                <li>Violate any applicable laws or regulations</li>
                <li>
                  Send or receive spam, unsolicited emails, or malicious content
                </li>
                <li>Impersonate others or provide false information</li>
                <li>
                  Interfere with the Service's operation or other users' access
                </li>
                <li>Use the Service for illegal or unauthorized purposes</li>
                <li>Attempt to gain unauthorized access to our systems</li>
                <li>
                  Use the Service to collect personal information without
                  consent
                </li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                5. Domain Verification and Ownership
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                To use the Service, you must verify ownership of the domains you
                wish to configure. You represent and warrant that:
              </p>
              <ul className="list-disc pl-6 text-gray-700">
                <li>You own or have authorization to configure the domains</li>
                <li>You will maintain proper DNS configurations</li>
                <li>
                  You will not configure domains you do not own or control
                </li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                6. Payment Terms
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Certain features of the Service require payment. By purchasing a
                paid plan:
              </p>
              <ul className="list-disc pl-6 text-gray-700">
                <li>
                  You agree to pay all charges associated with your account
                </li>
                <li>Payments are processed by third-party payment providers</li>
                <li>Subscriptions automatically renew unless cancelled</li>
                <li>Refunds are provided according to our refund policy</li>
                <li>We may change pricing with 30 days' notice</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                7. Data and Privacy
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Your use of the Service is also governed by our Privacy Policy.
                By using the Service, you acknowledge that:
              </p>
              <ul className="list-disc pl-6 text-gray-700">
                <li>We may process emails received through your domains</li>
                <li>We implement security measures to protect your data</li>
                <li>
                  You are responsible for compliance with data protection laws
                </li>
                <li>We may retain email data for up to 30 days by default</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                8. Service Availability and Support
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We strive to maintain high service availability, but:
              </p>
              <ul className="list-disc pl-6 text-gray-700">
                <li>We do not guarantee 100% uptime</li>
                <li>
                  We may perform maintenance that temporarily affects service
                </li>
                <li>Support is provided according to your plan level</li>
                <li>We reserve the right to modify or discontinue features</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                9. Intellectual Property
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                The Service and its content are owned by EXON ENTERPRISE LLC and
                protected by intellectual property laws. You agree that:
              </p>
              <ul className="list-disc pl-6 text-gray-700">
                <li>We retain all rights to the Service and our technology</li>
                <li>You may not copy, modify, or create derivative works</li>
                <li>You retain rights to your own content and data</li>
                <li>
                  You grant us a license to process your data to provide the
                  Service
                </li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                10. Limitation of Liability
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW:
              </p>
              <ul className="list-disc pl-6 text-gray-700">
                <li>
                  WE ARE NOT LIABLE FOR INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
                  DAMAGES
                </li>
                <li>
                  OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT PAID FOR THE
                  SERVICE
                </li>
                <li>WE DO NOT WARRANT THAT THE SERVICE WILL BE ERROR-FREE</li>
                <li>YOU USE THE SERVICE AT YOUR OWN RISK</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                11. Indemnification
              </h2>
              <p className="text-gray-700 leading-relaxed">
                You agree to indemnify and hold harmless EXON ENTERPRISE LLC
                from any claims, damages, or expenses arising from your use of
                the Service, violation of these Terms, or infringement of any
                rights.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                12. Termination
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We may terminate or suspend your account:
              </p>
              <ul className="list-disc pl-6 text-gray-700">
                <li>For violation of these Terms</li>
                <li>For non-payment of fees</li>
                <li>If required by law</li>
                <li>At our discretion with reasonable notice</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                You may terminate your account at any time through the Service
                dashboard.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                13. Governing Law
              </h2>
              <p className="text-gray-700 leading-relaxed">
                These Terms are governed by the laws of the State of Delaware,
                United States, without regard to conflict of law principles.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                14. Changes to Terms
              </h2>
              <p className="text-gray-700 leading-relaxed">
                We may modify these Terms at any time. Material changes will be
                communicated via email or through the Service. Continued use of
                the Service after changes constitutes acceptance.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                15. Contact Information
              </h2>
              <p className="text-gray-700 leading-relaxed">
                If you have questions about these Terms, please contact us:
              </p>
              <div className="bg-gray-50 p-4 rounded-lg mt-4">
                <p className="text-gray-700">
                  <strong>EXON ENTERPRISE LLC</strong>
                  <br />
                  Email: legal@inbound.exon.dev
                  <br />
                  Website: inbound.exon.dev
                </p>
              </div>
            </section>
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
