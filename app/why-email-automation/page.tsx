import { Metadata } from 'next'
import { HiMail, HiLightningBolt, HiGlobeAlt, HiCog, HiCheckCircle, HiArrowRight, HiShieldCheck, HiCube, HiCollection, HiLightBulb, HiChartBar, HiClock, HiExclamationTriangle, HiCode, HiFilter, HiDatabase, HiCloudUpload, HiUsers, HiTrendingUp, HiStar } from "react-icons/hi"

export const metadata: Metadata = {
  title: 'Why Email Automation? Benefits, Use Cases & Best Practices | Inbound',
  description: 'Discover why email automation is essential for modern businesses. Learn about benefits, use cases, implementation strategies, and ROI of automated email workflows.',
  keywords: 'email automation, automated emails, email workflows, email marketing automation, business automation, email triggers, drip campaigns',
  openGraph: {
    title: 'Why Email Automation? Benefits, Use Cases & Best Practices',
    description: 'Discover why email automation is essential for modern businesses. Learn about benefits, use cases, implementation strategies, and ROI of automated email workflows.',
    type: 'article',
    url: 'https://inbound.exon.dev/why-email-automation',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Why Email Automation? Benefits, Use Cases & Best Practices',
    description: 'Discover why email automation is essential for modern businesses. Learn about benefits, use cases, implementation strategies.',
  }
}

export default function WhyEmailAutomationPage() {
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
      <section className="px-6 py-12 bg-gradient-to-br from-purple-50 to-indigo-50">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Why Email Automation?
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
            Email automation transforms how businesses communicate, saving time, increasing engagement, 
            and driving revenue through intelligent, triggered workflows that work 24/7.
          </p>
          <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <HiClock className="w-4 h-4" />
              12 min read
            </span>
            <span>•</span>
            <span>Updated January 2025</span>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="px-6 py-12">
        <div className="max-w-4xl mx-auto">
          
          {/* Quick Stats */}
          <div className="grid md:grid-cols-3 gap-6 mb-16">
            <div className="bg-blue-50 rounded-lg p-6 text-center border border-blue-200">
              <div className="text-3xl font-bold text-blue-600 mb-2">320%</div>
              <div className="text-sm text-blue-800">Higher revenue from automated emails</div>
            </div>
            <div className="bg-green-50 rounded-lg p-6 text-center border border-green-200">
              <div className="text-3xl font-bold text-green-600 mb-2">75%</div>
              <div className="text-sm text-green-800">Time saved on manual email tasks</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-6 text-center border border-purple-200">
              <div className="text-3xl font-bold text-purple-600 mb-2">50%</div>
              <div className="text-sm text-purple-800">Higher engagement rates</div>
            </div>
          </div>

          {/* What is Email Automation */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                <HiCog className="w-6 h-6 text-white" />
              </div>
              What is Email Automation?
            </h2>
            
            <div className="prose prose-lg max-w-none mb-8">
              <p className="text-gray-700 leading-relaxed mb-6">
                <strong>Email automation</strong> is the process of sending targeted emails to subscribers based on specific triggers, behaviors, or schedules without manual intervention. It's like having a smart assistant that knows exactly when and what to send to each person on your email list.
              </p>
              
              <div className="bg-purple-50 border-l-4 border-purple-400 p-6 rounded-lg mb-6">
                <div className="flex items-start gap-3">
                  <HiLightBulb className="w-6 h-6 text-purple-600 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-purple-900 mb-2">Simple Example</h3>
                    <p className="text-purple-800">
                      When someone signs up for your newsletter, they automatically receive a welcome email. 
                      Three days later, they get a helpful guide. A week later, they receive a special offer. 
                      All without you lifting a finger.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Why Businesses Need Email Automation */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <HiTrendingUp className="w-6 h-6 text-white" />
              </div>
              Why Businesses Need Email Automation
            </h2>
            
            <div className="space-y-6 mb-8">
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-6 border border-blue-200">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <HiClock className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Scale Without Scaling Team</h3>
                    <p className="text-gray-700 mb-3">
                      Handle thousands of customer interactions simultaneously without hiring additional staff. 
                      Automation scales infinitely while maintaining personal touch.
                    </p>
                    <div className="text-sm text-blue-700 bg-blue-100 rounded-lg p-3">
                      <strong>Impact:</strong> Send 10,000 personalized emails with the same effort as sending 10
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-6 border border-green-200">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <HiChartBar className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Improve Customer Experience</h3>
                    <p className="text-gray-700 mb-3">
                      Deliver timely, relevant content based on customer behavior and preferences. 
                      Never miss important touchpoints in the customer journey.
                    </p>
                    <div className="text-sm text-green-700 bg-green-100 rounded-lg p-3">
                      <strong>Impact:</strong> 67% of customers expect immediate responses to their actions
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-6 border border-purple-200">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <HiDatabase className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Increase Revenue</h3>
                    <p className="text-gray-700 mb-3">
                      Automated emails generate 320% more revenue than non-automated emails. 
                      Nurture leads, recover abandoned carts, and drive repeat purchases.
                    </p>
                    <div className="text-sm text-purple-700 bg-purple-100 rounded-lg p-3">
                      <strong>Impact:</strong> Average ROI of $42 for every $1 spent on email automation
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-orange-50 to-yellow-50 rounded-lg p-6 border border-orange-200">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-orange-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <HiLightningBolt className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Reduce Human Error</h3>
                    <p className="text-gray-700 mb-3">
                      Eliminate forgotten follow-ups, typos in manual emails, and inconsistent messaging. 
                      Automation ensures quality and consistency every time.
                    </p>
                    <div className="text-sm text-orange-700 bg-orange-100 rounded-lg p-3">
                      <strong>Impact:</strong> 95% reduction in email-related errors and omissions
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Types of Email Automation */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                <HiCollection className="w-6 h-6 text-white" />
              </div>
              Types of Email Automation
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-3 text-lg flex items-center gap-2">
                  <HiUsers className="w-5 h-5 text-blue-600" />
                  Welcome Series
                </h3>
                <p className="text-gray-700 mb-4">
                  Onboard new subscribers with a series of emails that introduce your brand, 
                  set expectations, and provide value.
                </p>
                <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                  <strong>Typical sequence:</strong> Welcome → Company story → Best resources → Social proof → Special offer
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-3 text-lg flex items-center gap-2">
                  <HiCube className="w-5 h-5 text-green-600" />
                  Abandoned Cart Recovery
                </h3>
                <p className="text-gray-700 mb-4">
                  Recover lost sales by reminding customers about items they left in their cart 
                  and providing incentives to complete purchase.
                </p>
                <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                  <strong>Recovery rate:</strong> 15-25% of abandoned carts can be recovered
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-3 text-lg flex items-center gap-2">
                  <HiLightBulb className="w-5 h-5 text-purple-600" />
                  Lead Nurturing
                </h3>
                <p className="text-gray-700 mb-4">
                  Guide prospects through your sales funnel with educational content, 
                  case studies, and targeted offers based on their interests.
                </p>
                <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                  <strong>Conversion lift:</strong> 50% higher conversion rates vs. non-nurtured leads
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-3 text-lg flex items-center gap-2">
                  <HiStar className="w-5 h-5 text-yellow-600" />
                  Re-engagement Campaigns
                </h3>
                <p className="text-gray-700 mb-4">
                  Win back inactive subscribers with special offers, surveys, 
                  or content designed to reignite their interest.
                </p>
                <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                  <strong>Win-back rate:</strong> 12-15% of inactive subscribers can be re-engaged
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-3 text-lg flex items-center gap-2">
                  <HiMail className="w-5 h-5 text-red-600" />
                  Transactional Emails
                </h3>
                <p className="text-gray-700 mb-4">
                  Automate order confirmations, shipping notifications, password resets, 
                  and other service-related communications.
                </p>
                <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                  <strong>Open rates:</strong> 80-85% higher than promotional emails
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-3 text-lg flex items-center gap-2">
                  <HiChartBar className="w-5 h-5 text-indigo-600" />
                  Behavioral Triggers
                </h3>
                <p className="text-gray-700 mb-4">
                  Send emails based on specific actions like website visits, 
                  content downloads, or product views.
                </p>
                <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                  <strong>Relevance boost:</strong> 3x higher click-through rates than broadcast emails
                </div>
              </div>
            </div>
          </section>

          {/* ROI and Business Impact */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
                <HiTrendingUp className="w-6 h-6 text-white" />
              </div>
              ROI and Business Impact
            </h2>
            
            <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-lg p-8 border border-emerald-200 mb-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-6">Email Automation by the Numbers</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center text-white text-sm font-bold">1</div>
                    <div>
                      <div className="font-semibold text-gray-900">Revenue Impact</div>
                      <div className="text-sm text-gray-600">Automated emails drive 320% more revenue than non-automated campaigns</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center text-white text-sm font-bold">2</div>
                    <div>
                      <div className="font-semibold text-gray-900">Time Savings</div>
                      <div className="text-sm text-gray-600">Businesses save 75% of time previously spent on manual email tasks</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center text-white text-sm font-bold">3</div>
                    <div>
                      <div className="font-semibold text-gray-900">Engagement Rates</div>
                      <div className="text-sm text-gray-600">50% higher open rates and 100% higher click-through rates</div>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center text-white text-sm font-bold">4</div>
                    <div>
                      <div className="font-semibold text-gray-900">Customer Lifetime Value</div>
                      <div className="text-sm text-gray-600">30% increase in customer lifetime value through nurturing</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center text-white text-sm font-bold">5</div>
                    <div>
                      <div className="font-semibold text-gray-900">Lead Quality</div>
                      <div className="text-sm text-gray-600">50% improvement in lead quality through automated scoring</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center text-white text-sm font-bold">6</div>
                    <div>
                      <div className="font-semibold text-gray-900">Sales Cycle</div>
                      <div className="text-sm text-gray-600">23% reduction in average sales cycle length</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Getting Started */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
                <HiCode className="w-6 h-6 text-white" />
              </div>
              Getting Started with Email Automation
            </h2>
            
            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">1</div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Define Your Goals</h3>
                    <p className="text-gray-700 mb-3">
                      Identify what you want to achieve: increase sales, improve onboarding, reduce churn, or enhance engagement.
                    </p>
                    <div className="text-sm text-gray-600">
                      <strong>Common goals:</strong> Lead nurturing, customer retention, sales acceleration, support automation
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">2</div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Map Customer Journey</h3>
                    <p className="text-gray-700 mb-3">
                      Understand your customer's path from awareness to purchase and beyond. Identify key touchpoints for automation.
                    </p>
                    <div className="text-sm text-gray-600">
                      <strong>Key stages:</strong> Awareness → Interest → Consideration → Purchase → Retention → Advocacy
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">3</div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Choose Your Platform</h3>
                    <p className="text-gray-700 mb-3">
                      Select an email automation platform that integrates with your existing tools and supports your workflow needs.
                    </p>
                    <div className="text-sm text-gray-600">
                      <strong>Consider:</strong> Integration capabilities, automation features, scalability, analytics, support
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">4</div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Start Simple</h3>
                    <p className="text-gray-700 mb-3">
                      Begin with basic automations like welcome emails or abandoned cart recovery before building complex workflows.
                    </p>
                    <div className="text-sm text-gray-600">
                      <strong>Best first automation:</strong> Welcome series (high impact, easy to implement)
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">5</div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Test and Optimize</h3>
                    <p className="text-gray-700 mb-3">
                      Continuously monitor performance, A/B test subject lines and content, and refine your automations based on data.
                    </p>
                    <div className="text-sm text-gray-600">
                      <strong>Key metrics:</strong> Open rates, click rates, conversion rates, unsubscribe rates, revenue per email
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Best Practices */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-600 rounded-lg flex items-center justify-center">
                <HiLightBulb className="w-6 h-6 text-white" />
              </div>
              Email Automation Best Practices
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Content & Messaging</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
                    <HiCheckCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-yellow-800">
                      <strong>Personalization:</strong> Use subscriber data to personalize subject lines and content
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
                    <HiCheckCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-yellow-800">
                      <strong>Value-First:</strong> Always provide value before asking for anything
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
                    <HiCheckCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-yellow-800">
                      <strong>Mobile-Friendly:</strong> Optimize for mobile devices (60% of emails are opened on mobile)
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Technical Implementation</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                    <HiCheckCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-800">
                      <strong>Segmentation:</strong> Create targeted segments based on behavior and preferences
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                    <HiCheckCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-800">
                      <strong>Timing:</strong> Test send times and frequency for optimal engagement
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                    <HiCheckCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-800">
                      <strong>Analytics:</strong> Track performance and continuously optimize based on data
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-xl p-8 text-center text-white">
            <h2 className="text-2xl font-bold mb-4">Ready to Automate Your Email Workflows?</h2>
            <p className="text-purple-100 mb-6 max-w-2xl mx-auto">
              Start with Inbound's email automation platform. Turn any email address into an automated workflow 
              with webhooks, triggers, and intelligent routing.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="/" 
                className="inline-flex items-center gap-2 bg-white text-purple-600 px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Start Automating
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