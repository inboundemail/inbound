import type { Metadata } from "next";
import { MarketingNav, MarketingFooter } from "@/components/marketing-nav";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of inbound.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#1c1917] selection:bg-[#8161FF]/20">
      <div className="max-w-2xl mx-auto px-6">
        <MarketingNav />

        {/* Hero */}
        <section className="pt-20 pb-12">
          <h1 className="font-heading text-[32px] leading-[1.2] tracking-tight mb-2">Terms of Service</h1>
          <p className="text-[#52525b] leading-relaxed">
            <strong>Effective Date:</strong> January 1, 2025 · <strong>Last Updated:</strong> December 3, 2025
          </p>
        </section>

        {/* Content */}
        <section className="py-8 border-t border-[#e7e5e4]">
          <div className="space-y-10">
            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">1. Agreement to Terms</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>
                  These Terms of Service ("Terms") constitute a legally binding agreement between you ("User," "you," or "your") and EXON ENTERPRISE LLC, 
                  a Florida limited liability company ("Company," "we," "our," or "us") concerning your access to and use of the Inbound email infrastructure service (the "Service").
                </p>
                <p>
                  BY ACCESSING, BROWSING, OR USING THE SERVICE, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THESE TERMS. 
                  IF YOU DO NOT AGREE TO THESE TERMS IN THEIR ENTIRETY, YOU ARE NOT AUTHORIZED TO ACCESS OR USE THE SERVICE AND MUST IMMEDIATELY CEASE ALL USE.
                </p>
                <p>
                  Your use of the Service constitutes your acceptance of these Terms as of the date of first use ("Effective Date"). These Terms apply to all users of the Service, 
                  including without limitation users who are browsers, vendors, customers, merchants, and contributors of content.
                </p>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">2. Description of Service</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>Inbound is a programmable email infrastructure service that allows you to:</p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>Send and receive emails programmatically</li>
                  <li>Configure email receiving for your verified domains</li>
                  <li>Receive emails via webhook endpoints</li>
                  <li>Process, filter, and thread incoming emails</li>
                  <li>Access email analytics, logs, and delivery metrics</li>
                </ul>
                <p>
                  The Service is provided on an "as is" and "as available" basis. We reserve the right to modify, suspend, or discontinue the Service or any part thereof at any time, 
                  with or without notice, and without liability to you.
                </p>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">3. User Accounts and Registration</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>To access certain features of the Service, you must create an account. By creating an account, you represent, warrant, and covenant that:</p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>You are at least 18 years of age and have the legal capacity to enter into these Terms</li>
                  <li>All registration information you provide is truthful, accurate, current, and complete</li>
                  <li>You will maintain and promptly update your account information to keep it accurate and complete</li>
                  <li>You will maintain the confidentiality and security of your account credentials and will not share them with any third party</li>
                  <li>You accept full responsibility for all activities that occur under your account, whether or not authorized by you</li>
                  <li>You will immediately notify us of any unauthorized access to or use of your account</li>
                  <li>You will not create multiple accounts for the purpose of circumventing account limits, bans, or these Terms</li>
                </ul>
                <p>
                  We reserve the right to refuse registration, suspend, or terminate any account at our sole discretion, without prior notice or liability, 
                  for any reason whatsoever, including but not limited to a breach of these Terms.
                </p>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">4. Acceptable Use Policy and Prohibited Conduct</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>
                  You agree to use the Service only for lawful purposes and in accordance with these Terms. You expressly agree that you will NOT use the Service to:
                </p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>Send, receive, distribute, or facilitate spam, unsolicited commercial email, bulk email, or any form of unsolicited messages</li>
                  <li>Send phishing emails, malware, viruses, or other malicious content</li>
                  <li>Engage in email harvesting, scraping, or the collection of email addresses without consent</li>
                  <li>Impersonate any person or entity, or falsely state or misrepresent your affiliation with any person or entity</li>
                  <li>Violate the CAN-SPAM Act, GDPR, CCPA, or any other applicable anti-spam, privacy, or data protection laws and regulations</li>
                  <li>Send emails with forged headers, deceptive subject lines, or false sender information</li>
                  <li>Use the Service in connection with any illegal activity, fraud, or deceptive practices</li>
                  <li>Interfere with, disrupt, or place an undue burden on the Service or its infrastructure</li>
                  <li>Attempt to gain unauthorized access to any portion of the Service, other accounts, or any systems or networks connected to the Service</li>
                  <li>Use the Service to harass, abuse, threaten, or harm any person or entity</li>
                  <li>Transmit content that is defamatory, obscene, pornographic, or otherwise objectionable</li>
                  <li>Violate any third-party intellectual property rights, privacy rights, or other proprietary rights</li>
                  <li>Use the Service in any manner that could damage, disable, overburden, or impair the Service</li>
                  <li>Circumvent, disable, or interfere with any security-related features of the Service</li>
                  <li>Use automated means, including bots, scripts, or scrapers, to access the Service in violation of these Terms</li>
                </ul>
                <p className="font-medium text-[#1c1917]">
                  VIOLATION OF THIS ACCEPTABLE USE POLICY CONSTITUTES A MATERIAL BREACH OF THESE TERMS AND MAY RESULT IN IMMEDIATE TERMINATION OF YOUR ACCOUNT WITHOUT REFUND, 
                  AS WELL AS POTENTIAL CIVIL AND CRIMINAL LIABILITY.
                </p>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">5. Zero Tolerance Anti-Spam Policy</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>
                  We maintain a strict zero-tolerance policy against the use of our Service for sending spam or unsolicited messages. For purposes of these Terms, "spam" includes but is not limited to:
                </p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>Any email sent to recipients who have not explicitly opted in to receive communications from the sender</li>
                  <li>Bulk email sent to purchased, rented, or harvested email lists</li>
                  <li>Email with misleading or deceptive headers, subject lines, or content</li>
                  <li>Any email that violates applicable anti-spam laws</li>
                </ul>
                <p>
                  We actively monitor the Service for spam and abuse. If we determine, in our sole and absolute discretion, that you have used or are using the Service to send spam or 
                  engage in any other prohibited conduct:
                </p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>Your account will be immediately suspended or terminated without prior notice</li>
                  <li>You will forfeit all fees paid, and no refund will be provided</li>
                  <li>We may report your activities to relevant authorities, blacklist operators, and industry organizations</li>
                  <li>You may be held liable for all damages, costs, and expenses incurred by us as a result of your conduct</li>
                </ul>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">6. Domain Verification and Ownership</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>To use the Service, you must verify ownership or authorization of the domains you wish to configure. You represent, warrant, and covenant that:</p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>You own or have proper authorization to configure and use each domain with the Service</li>
                  <li>You will maintain proper DNS configurations as required by the Service</li>
                  <li>You will not configure or attempt to configure domains you do not own or have authorization to use</li>
                  <li>You will comply with all applicable domain registration and DNS requirements</li>
                </ul>
                <p>
                  Configuring domains you do not own or have authorization to use constitutes fraud and a material breach of these Terms, 
                  and will result in immediate termination without refund.
                </p>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">7. Payment Terms, Billing, and Refund Policy</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>Certain features of the Service require payment of fees. By subscribing to a paid plan, you agree to the following:</p>
                
                <p className="font-medium text-[#1c1917]">7.1 Payment Authorization</p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>You authorize us to charge your designated payment method for all fees associated with your selected plan</li>
                  <li>All payments are processed by third-party payment processors, and you agree to their terms of service</li>
                  <li>You are responsible for providing accurate and current payment information</li>
                  <li>Failed payments may result in suspension or termination of your account</li>
                </ul>

                <p className="font-medium text-[#1c1917]">7.2 Subscription and Automatic Renewal</p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>Paid subscriptions automatically renew at the end of each billing period unless cancelled prior to renewal</li>
                  <li>You may cancel your subscription at any time through your account dashboard</li>
                  <li>Cancellation will take effect at the end of the current billing period</li>
                  <li>We reserve the right to change pricing with 30 days' prior notice</li>
                </ul>

                <p className="font-medium text-[#1c1917]">7.3 Refund Policy and Service Usage Acknowledgment</p>
                <p className="uppercase text-sm tracking-wide font-medium">
                  YOU EXPRESSLY ACKNOWLEDGE AND AGREE THAT:
                </p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>
                    <strong>Service Consumption Forfeits Refund Rights:</strong> Once you have sent or received ANY emails through the Service, 
                    or consumed any portion of your plan's allocated resources (including but not limited to email sends, receives, API calls, or webhook deliveries), 
                    the Service has been rendered and you are NOT entitled to any refund, whether full or partial, under any circumstances.
                  </li>
                  <li>
                    <strong>No Refunds for Used Services:</strong> Due to the nature of email infrastructure services and the costs incurred by the Company 
                    in processing and delivering emails, ALL FEES ARE NON-REFUNDABLE once any service consumption has occurred.
                  </li>
                  <li>
                    <strong>Trial Period:</strong> If offered, any free trial period allows you to evaluate the Service before committing to a paid plan. 
                    Upgrading to a paid plan after or during a trial constitutes acknowledgment that the Service meets your needs.
                  </li>
                  <li>
                    <strong>Prorated Refunds Not Available:</strong> We do not provide prorated refunds for partial billing periods, downgrades, or early cancellation.
                  </li>
                </ul>

                <p className="font-medium text-[#1c1917]">7.4 Chargebacks and Payment Disputes</p>
                <p className="uppercase text-sm tracking-wide font-medium">
                  IMPORTANT: PLEASE READ THIS SECTION CAREFULLY.
                </p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>
                    <strong>Chargeback Prohibition:</strong> You agree not to initiate any chargeback, payment dispute, or reversal of payment for any fees 
                    properly charged under these Terms without first contacting us directly to resolve the issue.
                  </li>
                  <li>
                    <strong>Fraudulent Chargebacks:</strong> Initiating a chargeback or payment dispute for services that were properly rendered constitutes fraud 
                    and a material breach of these Terms. In such event, your account will be immediately terminated, and you will be liable to the Company for:
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                      <li>The full amount of the disputed charge</li>
                      <li>All chargeback fees, administrative fees, and penalties assessed by payment processors (typically $15-$100 per chargeback)</li>
                      <li>Collection costs, including reasonable attorney's fees</li>
                      <li>Liquidated damages in the amount of $500 per fraudulent chargeback to compensate for administrative burden and reputational harm</li>
                    </ul>
                  </li>
                  <li>
                    <strong>Dispute Resolution:</strong> Any billing disputes must be raised within 30 days of the charge by contacting billing@inbound.new. 
                    Failure to dispute a charge within this period constitutes acceptance of the charge.
                  </li>
                  <li>
                    <strong>Documentation:</strong> We maintain comprehensive logs of all service usage and account activity. In the event of a chargeback, 
                    we will provide full documentation to the payment processor demonstrating that services were properly rendered.
                  </li>
                </ul>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">8. Account Suspension, Termination, and Forfeiture</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p className="font-medium text-[#1c1917]">8.1 Termination by Company</p>
                <p>
                  We reserve the right, in our sole and absolute discretion, to suspend, restrict, or terminate your account and access to the Service, 
                  immediately and without prior notice or liability, for any reason whatsoever, including but not limited to:
                </p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>Violation or suspected violation of these Terms, including the Acceptable Use Policy</li>
                  <li>Engaging in spam, abuse, fraud, or any illegal activity</li>
                  <li>Non-payment or failed payment of fees</li>
                  <li>Initiating a chargeback or payment dispute</li>
                  <li>Creating multiple accounts to circumvent limits, bans, or these Terms</li>
                  <li>Conduct that we determine, in our sole discretion, to be harmful to the Service, other users, or third parties</li>
                  <li>Receipt of complaints from third parties regarding your use of the Service</li>
                  <li>Request by law enforcement or government agencies</li>
                  <li>Any other reason we deem necessary to protect the Service, our users, or our business interests</li>
                </ul>

                <p className="font-medium text-[#1c1917]">8.2 Effect of Termination for Cause</p>
                <p className="uppercase text-sm tracking-wide">
                  IF YOUR ACCOUNT IS TERMINATED FOR VIOLATION OF THESE TERMS:
                </p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>You will immediately lose access to the Service and all associated data</li>
                  <li>ALL FEES PAID ARE PERMANENTLY FORFEITED AND NON-REFUNDABLE</li>
                  <li>You remain liable for all fees incurred prior to termination</li>
                  <li>We may delete your data immediately without any obligation to retain or provide copies</li>
                  <li>You are prohibited from creating any new accounts</li>
                  <li>We may pursue any legal remedies available to us</li>
                </ul>

                <p className="font-medium text-[#1c1917]">8.3 Termination by User</p>
                <p>
                  You may terminate your account at any time through the Service dashboard. Upon voluntary termination:
                </p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>Your subscription will remain active until the end of the current billing period</li>
                  <li>No refunds will be provided for any remaining time in the billing period</li>
                  <li>You remain responsible for all fees incurred prior to termination</li>
                </ul>

                <p className="font-medium text-[#1c1917]">8.4 Survival</p>
                <p>
                  All provisions of these Terms which by their nature should survive termination shall survive termination, including without limitation: 
                  ownership provisions, warranty disclaimers, limitation of liability, indemnification, dispute resolution, and governing law.
                </p>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">9. Data and Privacy</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>Your use of the Service is also governed by our Privacy Policy, incorporated herein by reference. By using the Service, you acknowledge and agree that:</p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>We may process, store, and transmit emails received through your configured domains</li>
                  <li>We implement commercially reasonable security measures to protect your data</li>
                  <li>You are solely responsible for compliance with all applicable data protection laws, including GDPR and CCPA</li>
                  <li>We may retain email data and logs for up to 30 days by default, or longer as required by law or for legitimate business purposes</li>
                  <li>We may use aggregated, anonymized data for analytics, service improvement, and other business purposes</li>
                </ul>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">10. Service Availability and Support</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>While we strive to maintain high service availability:</p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>We do not guarantee 100% uptime or uninterrupted access to the Service</li>
                  <li>We may perform scheduled or emergency maintenance that temporarily affects service availability</li>
                  <li>Support response times and availability vary according to your plan level</li>
                  <li>We reserve the right to modify, update, or discontinue any features or functionality at any time</li>
                </ul>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">11. Intellectual Property</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>
                  The Service, including all content, features, functionality, software, code, user interfaces, and documentation, 
                  is owned by EXON ENTERPRISE LLC and is protected by United States and international intellectual property laws. You agree that:
                </p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>We retain all right, title, and interest in and to the Service and our technology</li>
                  <li>You may not copy, modify, distribute, sell, lease, or create derivative works based on the Service</li>
                  <li>You may not reverse engineer, decompile, or disassemble any aspect of the Service</li>
                  <li>You retain all rights to your own content and data transmitted through the Service</li>
                  <li>You grant us a non-exclusive, worldwide, royalty-free license to use, process, and transmit your data solely to provide the Service</li>
                </ul>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">12. Disclaimer of Warranties</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p className="uppercase text-sm tracking-wide font-medium">
                  THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.
                </p>
                <p>
                  TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:
                </p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT</li>
                  <li>WARRANTIES THAT THE SERVICE WILL BE UNINTERRUPTED, TIMELY, SECURE, OR ERROR-FREE</li>
                  <li>WARRANTIES THAT THE RESULTS OBTAINED FROM USE OF THE SERVICE WILL BE ACCURATE OR RELIABLE</li>
                  <li>WARRANTIES THAT ANY ERRORS IN THE SERVICE WILL BE CORRECTED</li>
                </ul>
                <p>
                  YOU ACKNOWLEDGE THAT YOUR USE OF THE SERVICE IS AT YOUR SOLE RISK. NO ADVICE OR INFORMATION, WHETHER ORAL OR WRITTEN, 
                  OBTAINED FROM US OR THROUGH THE SERVICE SHALL CREATE ANY WARRANTY NOT EXPRESSLY STATED HEREIN.
                </p>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">13. Limitation of Liability</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p className="uppercase text-sm tracking-wide font-medium">
                  TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:
                </p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>
                    IN NO EVENT SHALL EXON ENTERPRISE LLC, ITS OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, 
                    INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO DAMAGES FOR LOSS OF PROFITS, 
                    GOODWILL, USE, DATA, OR OTHER INTANGIBLE LOSSES, REGARDLESS OF WHETHER WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
                  </li>
                  <li>
                    OUR TOTAL CUMULATIVE LIABILITY TO YOU FOR ANY AND ALL CLAIMS ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE, 
                    WHETHER IN CONTRACT, TORT, OR OTHERWISE, SHALL NOT EXCEED THE GREATER OF: (A) THE TOTAL FEES PAID BY YOU TO US DURING THE 
                    THREE (3) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR (B) ONE HUNDRED DOLLARS ($100.00).
                  </li>
                  <li>
                    THE LIMITATIONS OF THIS SECTION SHALL APPLY TO ANY THEORY OF LIABILITY, WHETHER BASED ON WARRANTY, CONTRACT, STATUTE, TORT, 
                    OR OTHERWISE, AND WHETHER OR NOT WE HAVE BEEN INFORMED OF THE POSSIBILITY OF SUCH DAMAGE.
                  </li>
                </ul>
                <p>
                  SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN DAMAGES. IF THESE LAWS APPLY TO YOU, 
                  SOME OR ALL OF THE ABOVE EXCLUSIONS OR LIMITATIONS MAY NOT APPLY, AND YOU MAY HAVE ADDITIONAL RIGHTS.
                </p>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">14. Indemnification</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>
                  You agree to indemnify, defend, and hold harmless EXON ENTERPRISE LLC, its officers, directors, employees, agents, licensors, 
                  and suppliers from and against any and all claims, liabilities, damages, judgments, awards, losses, costs, expenses, and fees 
                  (including reasonable attorneys' fees) arising out of or relating to:
                </p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>Your use or misuse of the Service</li>
                  <li>Your violation of these Terms</li>
                  <li>Your violation of any applicable laws or regulations</li>
                  <li>Your violation of any third-party rights, including intellectual property, privacy, or publicity rights</li>
                  <li>Any content you transmit through the Service</li>
                  <li>Any spam, abuse, or other prohibited conduct engaged in by you</li>
                  <li>Any chargeback or payment dispute initiated by you</li>
                </ul>
                <p>
                  We reserve the right, at your expense, to assume the exclusive defense and control of any matter for which you are required to indemnify us, 
                  and you agree to cooperate with our defense of such claims.
                </p>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">15. Governing Law and Jurisdiction</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>
                  These Terms and any dispute or claim arising out of or in connection with them or their subject matter or formation 
                  (including non-contractual disputes or claims) shall be governed by and construed in accordance with the laws of the 
                  State of Florida, United States, without regard to its conflict of law provisions.
                </p>
                <p>
                  You irrevocably agree that the state and federal courts located in Florida shall have exclusive jurisdiction to settle 
                  any dispute or claim arising out of or in connection with these Terms or their subject matter or formation. 
                  You waive any objection to the exercise of jurisdiction over you by such courts and to venue in such courts.
                </p>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">16. Dispute Resolution and Arbitration</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p className="font-medium text-[#1c1917]">16.1 Informal Resolution</p>
                <p>
                  Before initiating any formal dispute resolution proceeding, you agree to first contact us at legal@inbound.new to attempt to resolve the dispute informally. 
                  We will attempt to resolve the dispute informally within 30 days.
                </p>

                <p className="font-medium text-[#1c1917]">16.2 Binding Arbitration</p>
                <p>
                  If informal resolution is unsuccessful, any dispute, controversy, or claim arising out of or relating to these Terms, 
                  or the breach, termination, or validity thereof, shall be finally settled by binding arbitration administered by the 
                  American Arbitration Association in accordance with its Commercial Arbitration Rules. The arbitration shall be conducted 
                  in Florida. The arbitrator's decision shall be final and binding, and judgment on the award may be entered in any court having jurisdiction.
                </p>

                <p className="font-medium text-[#1c1917]">16.3 Class Action Waiver</p>
                <p className="uppercase text-sm tracking-wide">
                  YOU AND THE COMPANY AGREE THAT EACH MAY BRING CLAIMS AGAINST THE OTHER ONLY IN YOUR OR ITS INDIVIDUAL CAPACITY AND NOT AS A PLAINTIFF 
                  OR CLASS MEMBER IN ANY PURPORTED CLASS OR REPRESENTATIVE PROCEEDING. Unless both you and the Company agree otherwise, 
                  the arbitrator may not consolidate more than one person's claims and may not otherwise preside over any form of a representative or class proceeding.
                </p>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">17. General Provisions</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p><strong>Entire Agreement:</strong> These Terms, together with our Privacy Policy, constitute the entire agreement between you and us regarding the Service.</p>
                <p><strong>Severability:</strong> If any provision of these Terms is found to be invalid or unenforceable, the remaining provisions shall remain in full force and effect.</p>
                <p><strong>Waiver:</strong> Our failure to enforce any right or provision of these Terms shall not be deemed a waiver of such right or provision.</p>
                <p><strong>Assignment:</strong> You may not assign or transfer these Terms without our prior written consent. We may assign these Terms without restriction.</p>
                <p><strong>Force Majeure:</strong> We shall not be liable for any failure or delay in performance due to circumstances beyond our reasonable control.</p>
                <p><strong>Headings:</strong> Section headings are for convenience only and shall not affect the interpretation of these Terms.</p>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">18. Changes to Terms</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>
                  We reserve the right to modify these Terms at any time in our sole discretion. Material changes will be communicated via email 
                  to the address associated with your account or through a prominent notice on the Service at least 30 days prior to the changes taking effect.
                </p>
                <p>
                  Your continued use of the Service after the effective date of any changes constitutes your acceptance of the modified Terms. 
                  If you do not agree to the modified Terms, you must discontinue use of the Service before the changes take effect.
                </p>
              </div>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">19. Contact Information</h2>
              <div className="space-y-3 text-[#3f3f46] leading-relaxed">
                <p>If you have any questions about these Terms, please contact us:</p>
                <div className="bg-white border border-[#e7e5e4] rounded-lg p-4">
                  <p className="font-medium text-[#1c1917]">EXON ENTERPRISE LLC</p>
                  <p className="text-sm mt-1">Legal Inquiries: legal@inbound.new</p>
                  <p className="text-sm">Billing Inquiries: billing@inbound.new</p>
                  <p className="text-sm">General Support: support@inbound.new</p>
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
