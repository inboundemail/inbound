import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

export default function SubscriptionRenewalReminder({
  customerName = "Michael Chen",
  companyName = "TechStart Inc",
  planName = "Business Plan",
  monthlyPrice = "$49",
  annualPrice = "$490",
  annualSavings = "$98",
  renewalDate = "2024-03-01",
  daysUntilRenewal = 7,
  currentFeatures = ["Up to 50 team members", "Advanced analytics", "Priority support", "Custom integrations"],
  manageUrl = "https://app.example.com/billing",
  upgradeUrl = "https://app.example.com/upgrade",
  logoUrl = "https://placehold.co/120x36?text=TeamFlow",
  appName = "TeamFlow",
}: {
  customerName: string;
  companyName?: string;
  planName: string;
  monthlyPrice: string;
  annualPrice: string;
  annualSavings: string;
  renewalDate: string;
  daysUntilRenewal: number;
  currentFeatures: string[];
  manageUrl: string;
  upgradeUrl: string;
  logoUrl: string;
  appName: string;
}) {
  const renewalDateFormatted = new Date(renewalDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <Html>
      <Head />
      <Preview>Your {planName} renews in {daysUntilRenewal} days</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white font-sans">
          <Container className="mx-auto my-10 max-w-[600px] rounded border border-solid border-neutral-200 px-10 py-5">
            <Section className="mt-8">
              <Img src={logoUrl} height="36" alt={appName} className="mx-auto" />
            </Section>
            
            <Heading className="mx-0 my-7 p-0 text-xl font-semibold text-black">
              Your subscription renews soon
            </Heading>
            
            <Text className="mb-6 text-sm leading-6 text-gray-600">
              Hi {customerName},
            </Text>
            
            <Text className="mb-6 text-sm leading-6 text-gray-600">
              Just a friendly reminder that {companyName ? `${companyName}'s ` : "your "}{planName} subscription will automatically renew in {daysUntilRenewal} days on {renewalDateFormatted}.
            </Text>

            {/* Current Plan Summary */}
            <Section className="mb-6 rounded-lg border border-gray-200 p-4">
              <Text className="mb-3 text-base font-semibold text-black">
                Current Plan: {planName}
              </Text>
              
              <Text className="mb-3 text-2xl font-bold text-black">
                {monthlyPrice}<span className="text-base font-normal text-gray-600">/month</span>
              </Text>
              
              <Text className="mb-3 text-sm font-medium text-gray-700">
                What's included:
              </Text>
              
              <ul className="mb-4 space-y-1">
                {currentFeatures.map((feature, index) => (
                  <li key={index} className="text-sm text-gray-600">
                    <span className="text-green-600">✓</span> {feature}
                  </li>
                ))}
              </ul>
            </Section>

            {/* Annual Savings CTA */}
            <Section className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
              <Text className="mb-2 text-sm font-semibold text-green-800">
                💡 Save {annualSavings} with Annual Billing
              </Text>
              <Text className="mb-3 text-sm leading-5 text-green-700">
                Switch to annual billing and save 2 months! Pay {annualPrice}/year instead of {monthlyPrice}/month.
              </Text>
              <Link
                className="inline-block rounded-lg bg-green-600 px-4 py-2 text-center text-sm font-semibold text-white no-underline"
                href={upgradeUrl}
              >
                Switch to Annual
              </Link>
            </Section>

            <Text className="mb-6 text-sm leading-6 text-gray-600">
              Your subscription will automatically renew using the payment method on file. 
              No action needed unless you want to make changes.
            </Text>

            <Section className="mb-8 text-center">
              <Link
                className="mb-3 mr-3 inline-block rounded-lg border border-gray-300 bg-white px-6 py-3 text-center text-sm font-semibold text-gray-700 no-underline"
                href={manageUrl}
              >
                Manage Subscription
              </Link>
            </Section>

            <Hr className="mx-0 my-6 w-full border-t border-solid border-neutral-200" />

            {/* Usage Stats (Optional) */}
            <Section className="mb-6">
              <Text className="mb-3 text-base font-semibold text-black">
                Your {appName} this month
              </Text>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <Text className="text-2xl font-bold text-blue-600">847</Text>
                  <Text className="text-xs text-gray-600">Tasks completed</Text>
                </div>
                <div className="text-center">
                  <Text className="text-2xl font-bold text-green-600">23</Text>
                  <Text className="text-xs text-gray-600">Team members</Text>
                </div>
                <div className="text-center">
                  <Text className="text-2xl font-bold text-purple-600">5</Text>
                  <Text className="text-xs text-gray-600">Projects active</Text>
                </div>
              </div>
            </Section>

            <Text className="mb-4 text-sm leading-6 text-gray-600">
              Questions about your subscription? We're here to help! Reply to this email or contact support.
            </Text>

            <Text className="mb-4 text-xs leading-5 text-gray-500">
              You're receiving this because your {planName} subscription renews on {renewalDateFormatted}.
            </Text>

            <Text className="mb-4 text-xs leading-5 text-gray-500">
              © 2024 {appName}. All rights reserved.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
