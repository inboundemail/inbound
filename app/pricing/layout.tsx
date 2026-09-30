import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing - Affordable Email Infrastructure for Developers | inbound',
  description: 'Simple pricing for email infrastructure. Plans start at $4/month for 5,000 emails; Pro is $15/month for 50,000 emails and 50 domains.',
  keywords: [
    'email pricing',
    'email API pricing',
    'inbound email pricing',
    'email infrastructure cost',
    'email service pricing',
    'developer email pricing',
    'email platform pricing',
    'affordable email service',
    'email webhook pricing',
    'email processing pricing'
  ],
  openGraph: {
    title: 'Pricing - Affordable Email Infrastructure for Developers',
    description: 'Simple pricing for email infrastructure. Plans start at $4/month for 5,000 emails; Pro is $15/month for 50,000 emails and 50 domains.',
    url: 'https://inbound.new/pricing',
    siteName: 'inbound',
    images: [
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: 'inbound - Pricing Plans'
      }
    ],
    locale: 'en_US',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pricing - Affordable Email Infrastructure for Developers',
    description: 'Simple pricing for email infrastructure. Plans start at $4/month for 5,000 emails; Pro is $15/month for 50,000 emails and 50 domains.',
    images: ['/twitter-image.png']
  },
  alternates: {
    canonical: 'https://inbound.new/pricing'
  }
}

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
