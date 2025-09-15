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

export default function TrialExpirationWarning({
  userName = "David Kim",
  companyName = "StartupXYZ",
  appName = "GrowthSuite",
  daysLeft = 3,
  trialEndDate = "2024-02-20",
  currentUsage = {
    projects: 8,
    projectLimit: 10,
    teamMembers: 5,
    memberLimit: 10,
    storageUsed: "2.1 GB",
    storageLimit: "5 GB"
  },
  upgradeUrl = "https://app.growthsuite.com/upgrade",
  planPrice = "$29",
  logoUrl = "https://placehold.co/120x36?text=GrowthSuite",
}: {
  userName: string;
  companyName?: string;
  appName: string;
  daysLeft: number;
  trialEndDate: string;
  currentUsage: {
    projects: number;
    projectLimit: number;
    teamMembers: number;
    memberLimit: number;
    storageUsed: string;
    storageLimit: string;
  };
  upgradeUrl: string;
  planPrice: string;
  logoUrl: string;
}) {
  const endDateFormatted = new Date(trialEndDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const urgencyColor = daysLeft <= 1 ? "red" : daysLeft <= 3 ? "amber" : "blue";
  const urgencyBg = daysLeft <= 1 ? "bg-red-50 border-red-200" : daysLeft <= 3 ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200";
  const urgencyText = daysLeft <= 1 ? "text-red-800" : daysLeft <= 3 ? "text-amber-800" : "text-blue-800";
  
  return (
    <Html>
      <Head />
      <Preview>Your {appName} trial expires in {daysLeft.toString()} days</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white font-sans">
          <Container className="mx-auto my-10 max-w-[600px] rounded border border-solid border-neutral-200 px-10 py-5">
            <Section className="mt-8">
              <Img src={logoUrl} height="36" alt={appName} className="mx-auto" />
            </Section>
            
            <Heading className="mx-0 my-7 p-0 text-xl font-semibold text-black">
              Your trial expires in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}
            </Heading>
            
            <Text className="mb-6 text-sm leading-6 text-gray-600">
              Hi {userName},
            </Text>
            
            <Text className="mb-6 text-sm leading-6 text-gray-600">
              {companyName ? `${companyName}'s ` : "Your "}{appName} free trial ends on <strong className="font-semibold text-black">{endDateFormatted}</strong>. 
              Don't lose access to your projects and data!
            </Text>

            {/* Trial Status Alert */}
            <Section className={`mb-6 rounded-lg border p-4 ${urgencyBg}`}>
              <Text className={`mb-2 text-sm font-semibold ${urgencyText}`}>
                {daysLeft <= 1 ? "⚠️ Trial expires tomorrow!" : daysLeft <= 3 ? "⏰ Trial ending soon" : "📅 Trial reminder"}
              </Text>
              <Text className={`text-sm leading-5 ${urgencyText.replace('800', '700')}`}>
                {daysLeft <= 1 
                  ? "Your trial expires in less than 24 hours. Upgrade now to maintain access to all your data and projects."
                  : `You have ${daysLeft} days left to upgrade. Keep everything you've built by choosing a plan.`
                }
              </Text>
            </Section>

            {/* Current Usage */}
            <Section className="mb-6">
              <Text className="mb-3 text-base font-semibold text-black">
                What you've accomplished during your trial
              </Text>
              
              <div className="mb-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Text className="text-sm text-gray-600">Projects created:</Text>
                  <div className="flex items-center">
                    <Text className="text-sm font-semibold text-black">{currentUsage.projects}</Text>
                    <Text className="text-sm text-gray-500">/{currentUsage.projectLimit}</Text>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <Text className="text-sm text-gray-600">Team members:</Text>
                  <div className="flex items-center">
                    <Text className="text-sm font-semibold text-black">{currentUsage.teamMembers}</Text>
                    <Text className="text-sm text-gray-500">/{currentUsage.memberLimit}</Text>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <Text className="text-sm text-gray-600">Storage used:</Text>
                  <div className="flex items-center">
                    <Text className="text-sm font-semibold text-black">{currentUsage.storageUsed}</Text>
                    <Text className="text-sm text-gray-500">/{currentUsage.storageLimit}</Text>
                  </div>
                </div>
              </div>
            </Section>

            {/* What happens if they don't upgrade */}
            <Section className="mb-6 rounded-lg border border-gray-200 p-4">
              <Text className="mb-2 text-sm font-semibold text-gray-800">
                What happens if I don't upgrade?
              </Text>
              <ul className="space-y-1">
                <li className="text-sm text-gray-600">• Your account will be suspended after the trial ends</li>
                <li className="text-sm text-gray-600">• You'll lose access to all projects and data</li>
                <li className="text-sm text-gray-600">• Team members will be removed from your workspace</li>
                <li className="text-sm text-gray-600">• Data will be permanently deleted after 30 days</li>
              </ul>
            </Section>

            {/* Upgrade CTA */}
            <Section className="mb-8 text-center">
              <Text className="mb-4 text-lg font-semibold text-black">
                Continue with {appName} for just {planPrice}/month
              </Text>
              <Link
                className="inline-block rounded-lg bg-green-600 px-8 py-3 text-center text-sm font-semibold text-white no-underline"
                href={upgradeUrl}
              >
                Upgrade Now
              </Link>
            </Section>

            {/* Benefits reminder */}
            <Section className="mb-6">
              <Text className="mb-3 text-base font-semibold text-black">
                Why teams love {appName}
              </Text>
              
              <ul className="mb-4 space-y-2">
                <li className="text-sm text-gray-600">
                  <span className="text-green-600">✓</span> <strong className="font-medium text-black">Unlimited projects</strong> - No limits on what you can build
                </li>
                <li className="text-sm text-gray-600">
                  <span className="text-green-600">✓</span> <strong className="font-medium text-black">Advanced collaboration</strong> - Real-time editing and comments
                </li>
                <li className="text-sm text-gray-600">
                  <span className="text-green-600">✓</span> <strong className="font-medium text-black">Priority support</strong> - Get help when you need it
                </li>
                <li className="text-sm text-gray-600">
                  <span className="text-green-600">✓</span> <strong className="font-medium text-black">Advanced integrations</strong> - Connect with your favorite tools
                </li>
              </ul>
            </Section>

            <Hr className="mx-0 my-6 w-full border-t border-solid border-neutral-200" />

            <Text className="mb-4 text-sm leading-6 text-gray-600">
              Have questions about pricing or need help with your account? 
              Reply to this email or contact our support team - we're here to help!
            </Text>

            <Text className="mb-4 text-xs leading-5 text-gray-500">
              Your {appName} trial for {companyName || "your account"} expires on {endDateFormatted}.
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
