"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { SiteHeader } from "@/components/site-header"
import InboundIcon from '@/components/icons/inbound'
import CircleCheck from '@/components/icons/circle-check'
import CircleXmark from '@/components/icons/circle-xmark'
import { useAutumn } from "autumn-js/react"
import { useSession } from "@/lib/auth/auth-client"
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getAutumnCustomer } from '@/app/actions/primary'

export default function PricingPage() {
  const plans = [
    {
      name: 'Free',
      price: 0,
      description: 'Perfect for getting started',
      emails: '5,000',
      domains: '2',
      aliases: 'Unlimited',
      retention: '7 days',
      support: 'Ticket',
      features: {
        core: ['5,000 emails/month', '2 domains', 'Unlimited aliases', 'TypeScript SDK', 'REST API access', 'Basic webhooks'],
        sending: ['Basic sending', 'Email templates', 'Attachment support', 'Bounce handling'],
        receiving: ['Inbound processing', 'Email parsing', 'Webhook delivery', 'Basic routing'],
        deliverability: ['99.5% uptime SLA', 'Basic monitoring'],
        security: ['HTTPS endpoints', 'Basic authentication', 'Spam filtering'],
        support: ['Ticket support', 'Documentation', 'Community discord']
      },
      cta: 'Start Free',
      ctaVariant: 'outline' as const,
      popular: false,
      autumn_id: 'free'
    },
    {
      name: 'Pro',
      price: 15,
      description: 'For growing applications',
      emails: '50,000',
      domains: '50',
      aliases: 'Unlimited',
      retention: '30 days',
      support: 'Ticket + email',
      features: {
        core: ['50,000 emails/month', '50 domains', 'Unlimited aliases', 'TypeScript SDK', 'REST API access', 'Advanced webhooks'],
        sending: ['Priority sending', 'Email templates', 'Attachment support', 'Bounce handling'],
        receiving: ['Inbound processing', 'Email parsing', 'Webhook delivery', 'Advanced routing', 'Email threading'],
        deliverability: ['99.9% uptime SLA', 'Advanced monitoring', 'Reputation tracking'],
        security: ['HTTPS endpoints', 'API key authentication', 'Spam filtering', 'HMAC signatures'],
        support: ['Email support', 'Priority tickets', 'Documentation', 'Community discord']
      },
      cta: 'Start Pro',
      ctaVariant: 'primary' as const,
      popular: true,
      autumn_id: 'pro'
    },
    {
      name: 'Growth',
      price: 39,
      description: 'For scaling businesses',
      emails: '100,000',
      domains: '200',
      aliases: 'Unlimited',
      retention: '45 days',
      support: 'Priority email',
      features: {
        core: ['100,000 emails/month', '200 domains', 'Unlimited aliases', 'TypeScript SDK', 'REST API access', 'Advanced webhooks'],
        sending: ['Priority sending', 'Email templates', 'Attachment support', 'Bounce handling'],
        receiving: ['Inbound processing', 'Email parsing', 'Webhook delivery', 'Advanced routing', 'Email threading', 'AI classification'],
        deliverability: ['99.9% uptime SLA', 'Advanced monitoring', 'Reputation tracking', 'Delivery optimization'],
        security: ['HTTPS endpoints', 'API key authentication', 'Spam filtering', 'HMAC signatures', 'Rate limiting'],
        support: ['Priority email support', 'Priority tickets', 'Documentation', 'Community discord', 'Setup assistance']
      },
      cta: 'Start Growth',
      ctaVariant: 'primary' as const,
      popular: false,
      autumn_id: 'growth'
    },
    {
      name: 'Scale',
      price: 79,
      description: 'For enterprise applications',
      emails: '200,000',
      domains: '500',
      aliases: 'Unlimited',
      retention: '60 days',
      support: 'Priority + Slack',
      features: {
        core: ['200,000 emails/month', '500 domains', 'Unlimited aliases', 'TypeScript SDK', 'REST API access', 'Advanced webhooks'],
        sending: ['Priority sending', 'Email templates', 'Attachment support', 'Bounce handling'],
        receiving: ['Inbound processing', 'Email parsing', 'Webhook delivery', 'Advanced routing', 'Email threading', 'AI classification', 'Custom parsing'],
        deliverability: ['99.9% uptime SLA', 'Advanced monitoring', 'Reputation tracking', 'Delivery optimization', 'Dedicated IP option'],
        security: ['HTTPS endpoints', 'API key authentication', 'Spam filtering', 'HMAC signatures', 'Rate limiting', 'Custom security rules'],
        support: ['Slack channel', 'Priority email support', 'Priority tickets', 'Documentation', 'Community discord', 'Setup assistance', 'Custom integrations']
      },
      cta: 'Start Scale',
      ctaVariant: 'primary' as const,
      popular: false,
      autumn_id: 'scale'
    }
  ]

  const { data: session } = useSession()
  const { attach } = useAutumn()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [currentPlan, setCurrentPlan] = useState<string | null>(null)

  const handlePlanSelection = async (plan: typeof plans[0]) => {
    // If user is not logged in, redirect to login
    if (!session?.user) {
      router.push('/login')
      return
    }

    // Don't process free plan - it should just redirect to dashboard
    if (plan.autumn_id === 'free') {
      router.push('/logs')
      return
    }

    setIsLoading(plan.autumn_id)

    try {
      await attach({ 
        productId: plan.autumn_id,
        successUrl: `${window.location.origin}/logs?upgrade=true&product=${plan.autumn_id}`,
      })
      
      // If we reach here, the plan change was successful
      toast.success(`Successfully upgraded to ${plan.name} plan!`)
      router.push('/logs')
    } catch (error) {
      console.error('Plan selection error:', error)
      toast.error('Failed to process plan change. Please try again.')
    } finally {
      setIsLoading(null)
    }
  }

  const getButtonText = (plan: typeof plans[0]) => {
    if (!session?.user) {
      return `Start with ${plan.name}`
    }
    
    // If we're still loading current plan info
    if (currentPlan === null) {
      return `Select ${plan.name}`
    }
    
    // If this is their current plan
    if (currentPlan === plan.autumn_id) {
      return 'Current Plan'
    }
    
    // Define plan hierarchy for upgrade/downgrade detection
    const planHierarchy = {
      'free': 0,
      'pro': 1, 
      'growth': 2,
      'scale': 3
    }
    
    const currentLevel = planHierarchy[currentPlan as keyof typeof planHierarchy] ?? 0
    const targetLevel = planHierarchy[plan.autumn_id as keyof typeof planHierarchy] ?? 0
    
    if (targetLevel > currentLevel) {
      return `Upgrade to ${plan.name}`
    } else if (targetLevel < currentLevel) {
      return `Downgrade to ${plan.name}`
    } else {
      return `Change to ${plan.name}`
    }
  }
  
  const isCurrentPlan = (plan: typeof plans[0]) => {
    return currentPlan === plan.autumn_id
  }


  // Fetch customer subscription data to detect current plan
  useEffect(() => {
    const fetchCustomer = async () => {
      if (!session?.user) {
        setCurrentPlan(null)
        return
      }
      
      try {
        const response = await getAutumnCustomer()
        if (response.customer) {
          // Find the main subscription (non-add-on)
          const mainProduct = response.customer.products?.find(
            (product: any) => product.status === "active" && !product.is_add_on
          )
          
          if (mainProduct) {
            setCurrentPlan(mainProduct.id)
          } else {
            // User is on free plan
            setCurrentPlan('free')
          }
        } else {
          setCurrentPlan('free')
        }
      } catch (error) {
        console.error('Error fetching customer data:', error)
        setCurrentPlan('free')
      }
    }
    
    fetchCustomer()
  }, [session?.user])

  return (
    <div className="min-h-screen bg-background text-foreground relative">

      <SiteHeader />

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-20 text-center">
        <h1 className="text-4xl md:text-5xl mb-6 leading-tight">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
          Choose the plan that fits your needs. Start free, upgrade when you're ready.
          <br />
          All plans include our core email platform features.
        </p>


        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto mb-20">
          {plans.map((plan, index) => (
            <div
              key={plan.name}
              className={`bg-card border rounded-xl p-8 relative ${
                isCurrentPlan(plan) 
                  ? 'border-green-500 shadow-lg ring-2 ring-green-500/20' 
                  : plan.popular 
                    ? 'border-primary shadow-lg scale-105' 
                    : 'border-border'
              }`}
            >
              {isCurrentPlan(plan) ? (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-green-500 text-white text-sm font-medium px-4 py-1 rounded-full">
                    Current Plan
                  </span>
                </div>
              ) : plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground text-sm font-medium px-4 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}
              
              <div className="text-center mb-8">
                <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>
                
                <div className="mb-4">
                  <span className="text-4xl font-bold">
                    ${plan.price}
                  </span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div>{plan.emails} emails/month</div>
                  <div>{plan.domains} domains</div>
                  <div>{plan.aliases} aliases</div>
                  <div>{plan.retention} data retention</div>
                </div>
              </div>

              <Button
                className="w-full mb-6"
                variant={isCurrentPlan(plan) ? 'secondary' : plan.ctaVariant}
                onClick={() => handlePlanSelection(plan)}
                disabled={isLoading === plan.autumn_id || isCurrentPlan(plan)}
              >
                {isLoading === plan.autumn_id ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {getButtonText(plan)}
                    {isCurrentPlan(plan) && (
                      <CircleCheck width="16" height="16" className="text-green-500" />
                    )}
                  </div>
                )}
              </Button>

              <div className="space-y-3">
                {plan.features.core.map((feature, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 shrink-0" />
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Feature Comparison Tables */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        
        {/* Email Sending Features */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-8 text-center">Email Sending</h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-4 font-medium text-muted-foreground">Feature</th>
                  <th className="text-center p-4 font-medium">Free</th>
                  <th className="text-center p-4 font-medium">Pro</th>
                  <th className="text-center p-4 font-medium">Growth</th>
                  <th className="text-center p-4 font-medium">Scale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="p-4 font-medium">Monthly send limit</td>
                  <td className="text-center p-4">5,000</td>
                  <td className="text-center p-4">50,000</td>
                  <td className="text-center p-4">100,000</td>
                  <td className="text-center p-4">200,000</td>
                </tr>
                <tr className="bg-muted/20">
                  <td className="p-4">Email templates</td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="p-4">Attachment support</td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Inbound Email Processing */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-8 text-center">Inbound Email Processing</h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-4 font-medium text-muted-foreground">Feature</th>
                  <th className="text-center p-4 font-medium">Free</th>
                  <th className="text-center p-4 font-medium">Pro</th>
                  <th className="text-center p-4 font-medium">Growth</th>
                  <th className="text-center p-4 font-medium">Scale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="p-4 font-medium">Monthly receive limit</td>
                  <td className="text-center p-4">5,000</td>
                  <td className="text-center p-4">50,000</td>
                  <td className="text-center p-4">100,000</td>
                  <td className="text-center p-4">200,000</td>
                </tr>
                <tr className="bg-muted/20">
                  <td className="p-4">Webhook delivery</td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="p-4">Email parsing</td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                </tr>
                <tr className="bg-muted/20">
                  <td className="p-4">Email threading</td>
                  <td className="text-center p-4"><CircleXmark width="16" height="16" className="text-red-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="p-4">AI email classification</td>
                  <td className="text-center p-4"><CircleXmark width="16" height="16" className="text-red-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleXmark width="16" height="16" className="text-red-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                </tr>
                <tr className="bg-muted/20">
                  <td className="p-4">Custom email parsing</td>
                  <td className="text-center p-4"><CircleXmark width="16" height="16" className="text-red-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleXmark width="16" height="16" className="text-red-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleXmark width="16" height="16" className="text-red-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Deliverability & Reliability */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-8 text-center">Deliverability & Reliability</h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-4 font-medium text-muted-foreground">Feature</th>
                  <th className="text-center p-4 font-medium">Free</th>
                  <th className="text-center p-4 font-medium">Pro</th>
                  <th className="text-center p-4 font-medium">Growth</th>
                  <th className="text-center p-4 font-medium">Scale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="p-4 font-medium">Uptime SLA</td>
                  <td className="text-center p-4">99.5%</td>
                  <td className="text-center p-4">99.9%</td>
                  <td className="text-center p-4">99.9%</td>
                  <td className="text-center p-4">99.9%</td>
                </tr>
                <tr className="bg-muted/20">
                  <td className="p-4">Webhook retries</td>
                  <td className="text-center p-4">3 attempts</td>
                  <td className="text-center p-4">5 attempts</td>
                  <td className="text-center p-4">10 attempts</td>
                  <td className="text-center p-4">Custom</td>
                </tr>
                <tr>
                  <td className="p-4">Bounce handling</td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                </tr>
                <tr className="bg-muted/20">
                  <td className="p-4">Reputation monitoring</td>
                  <td className="text-center p-4"><CircleXmark width="16" height="16" className="text-red-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="p-4">Delivery optimization</td>
                  <td className="text-center p-4"><CircleXmark width="16" height="16" className="text-red-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleXmark width="16" height="16" className="text-red-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                </tr>
                <tr className="bg-muted/20">
                  <td className="p-4">Dedicated IP option</td>
                  <td className="text-center p-4"><CircleXmark width="16" height="16" className="text-red-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleXmark width="16" height="16" className="text-red-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleXmark width="16" height="16" className="text-red-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="p-4">Custom sending domains</td>
                  <td className="text-center p-4">2</td>
                  <td className="text-center p-4">50</td>
                  <td className="text-center p-4">200</td>
                  <td className="text-center p-4">500</td>
                </tr>
                <tr className="bg-muted/20">
                  <td className="p-4">DKIM signing</td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="p-4">Open & click tracking (powered by dub.co)</td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>


        {/* Customer Support */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-8 text-center">Customer Support</h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-4 font-medium text-muted-foreground">Feature</th>
                  <th className="text-center p-4 font-medium">Free</th>
                  <th className="text-center p-4 font-medium">Pro</th>
                  <th className="text-center p-4 font-medium">Growth</th>
                  <th className="text-center p-4 font-medium">Scale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="p-4 font-medium">Support channel</td>
                  <td className="text-center p-4">Ticket</td>
                  <td className="text-center p-4">Ticket + Email</td>
                  <td className="text-center p-4">Priority Email</td>
                  <td className="text-center p-4">Priority + Slack</td>
                </tr>
                <tr className="bg-muted/20">
                  <td className="p-4">Response time</td>
                  <td className="text-center p-4">48 hours</td>
                  <td className="text-center p-4">24 hours</td>
                  <td className="text-center p-4">12 hours</td>
                  <td className="text-center p-4">4 hours</td>
                </tr>
                <tr>
                  <td className="p-4">Setup assistance</td>
                  <td className="text-center p-4"><CircleXmark width="16" height="16" className="text-red-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleXmark width="16" height="16" className="text-red-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                </tr>
                <tr className="bg-muted/20">
                  <td className="p-4">Custom integrations</td>
                  <td className="text-center p-4"><CircleXmark width="16" height="16" className="text-red-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleXmark width="16" height="16" className="text-red-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleXmark width="16" height="16" className="text-red-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="p-4">Dedicated Slack channel</td>
                  <td className="text-center p-4"><CircleXmark width="16" height="16" className="text-red-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleXmark width="16" height="16" className="text-red-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleXmark width="16" height="16" className="text-red-500 mx-auto" /></td>
                  <td className="text-center p-4"><CircleCheck width="16" height="16" className="text-green-500 mx-auto" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>


        {/* All Features Summary */}
        <div className="bg-muted/30 rounded-2xl p-12 text-center">
          <h2 className="text-3xl font-bold mb-4">Need more emails or custom features?</h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Our Scale plan can handle millions of emails per month. 
            Contact us for enterprise pricing and custom solutions.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="primary" size="lg" asChild>
              <Link href="mailto:sales@inbound.new">Contact Sales</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/docs">View Documentation</Link>
            </Button>
          </div>
        </div>

      </section>

      {/* FAQ Section */}
      <section className="bg-card py-20">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl text-center mb-4 text-foreground">Frequently asked questions</h2>
          <p className="text-muted-foreground text-center mb-12">
            Got questions? We've got answers.
          </p>
          
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-2">What counts as an email?</h3>
              <p className="text-muted-foreground">
                Both sent and received emails count toward your monthly limit. Each individual recipient counts as one email (so sending to 3 people = 3 emails).
              </p>
            </div>
            
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-2">Can I change plans anytime?</h3>
              <p className="text-muted-foreground">
                Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately and we'll prorate any billing differences.
              </p>
            </div>
            
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-2">What happens if I exceed my limit?</h3>
              <p className="text-muted-foreground">
                We'll notify you when you're approaching your limit. If you exceed it, we'll pause email sending until you upgrade or the next billing cycle starts.
              </p>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-2">Do you offer refunds?</h3>
              <p className="text-muted-foreground">
                We offer a 30-day money-back guarantee on all paid plans. If you're not satisfied, we'll refund your payment in full.
              </p>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-2">What's included in data retention?</h3>
              <p className="text-muted-foreground">
                We store email metadata, parsed content, webhook delivery logs, and analytics for the specified retention period. Raw email content is stored securely in AWS S3.
              </p>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-2">How does billing work for overages?</h3>
              <p className="text-muted-foreground">
                Additional emails beyond your plan limit are billed at competitive rates. We'll notify you before charging any overages and recommend upgrading to a higher plan for better value.
              </p>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-2">Is there an enterprise plan?</h3>
              <p className="text-muted-foreground">
                Yes! For high-volume applications (1M+ emails/month) or custom requirements, contact our sales team for enterprise pricing and features.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="bg-linear-to-br from-primary/10 via-primary/5 to-background rounded-3xl p-12 text-center">
          <h2 className="text-4xl font-bold mb-6 text-foreground">Ready to build better email experiences?</h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join thousands of developers who trust inbound for reliable, modern email infrastructure. 
            Start free and scale as you grow.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Button
              size="lg"
              variant="primary"
              className="font-medium px-8 py-4 text-lg"
              asChild
            >
              <Link href="/login">Start Free - No Credit Card Required</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="font-medium px-8 py-4 text-lg"
              asChild
            >
              <Link href="mailto:sales@inbound.new">Talk to Sales</Link>
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto text-left">
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground mb-1">5,000</div>
              <div className="text-sm text-muted-foreground">emails/month free</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground mb-1">2 min</div>
              <div className="text-sm text-muted-foreground">setup time</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground mb-1">99.9%</div>
              <div className="text-sm text-muted-foreground">deliverability</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-sidebar py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <InboundIcon width={32} height={32} />
              <span className="text-xl font-semibold text-foreground">inbound</span>
            </div>
            <div className="flex gap-8 text-sm text-muted-foreground">
              <Link href="https://docs.inbound.new" className="hover:text-foreground transition-colors">docs</Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">privacy</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">terms</Link>
              <a href="mailto:support@inbound.new" className="hover:text-foreground transition-colors">support</a>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} inbound (by exon). The all-in-one email toolkit for developers.
          </div>
        </div>
      </footer>
    </div>
  )
}
