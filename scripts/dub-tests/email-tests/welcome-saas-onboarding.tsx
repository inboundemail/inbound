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

export default function WelcomeSaaSOnboarding({
  name = "Sarah Johnson",
  email = "sarah@acme.com", 
  companyName = "Acme Corp",
  appName = "TaskFlow",
  dashboardUrl = "https://app.taskflow.com",
  helpUrl = "https://help.taskflow.com",
  logoUrl = "https://placehold.co/120x40?text=TaskFlow",
}: {
  name: string;
  email: string;
  companyName?: string;
  appName: string;
  dashboardUrl: string;
  helpUrl: string;
  logoUrl: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to {appName} - Get started in minutes!</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white font-sans">
          <Container className="mx-auto my-10 max-w-[600px] rounded border border-solid border-neutral-200 px-10 py-5">
            <Section className="mt-8">
              <Img src={logoUrl} height="40" alt={appName} className="mx-auto" />
            </Section>
            
            <Heading className="mx-0 my-7 p-0 text-xl font-semibold text-black">
              Welcome to {appName}, {name}! 🎉
            </Heading>
            
            <Text className="mb-6 text-sm leading-6 text-gray-600">
              Thanks for signing up! We're excited to help {companyName || "your team"} streamline workflows and boost productivity.
            </Text>

            <Text className="mb-6 text-sm leading-6 text-gray-600">
              Your account is ready to go. Here's how to get the most out of {appName}:
            </Text>

            <Section className="mb-6">
              <Text className="mb-4 text-sm leading-6 text-gray-600">
                <strong className="font-semibold text-black">1. Complete your profile</strong>
                <br />
                Add your team details and preferences to customize your experience.
              </Text>
              
              <Text className="mb-4 text-sm leading-6 text-gray-600">
                <strong className="font-semibold text-black">2. Invite your team</strong>
                <br />
                Collaboration works best when everyone's involved. Invite colleagues to join your workspace.
              </Text>
              
              <Text className="mb-4 text-sm leading-6 text-gray-600">
                <strong className="font-semibold text-black">3. Create your first project</strong>
                <br />
                Use our guided setup to create your first project and see the power of {appName}.
              </Text>
            </Section>

            <Section className="mb-8 text-center">
              <Link
                className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-center text-sm font-semibold text-white no-underline"
                href={dashboardUrl}
              >
                Go to Dashboard
              </Link>
            </Section>

            <Hr className="mx-0 my-6 w-full border-t border-solid border-neutral-200" />

            <Text className="mb-4 text-sm leading-6 text-gray-600">
              Need help getting started? Our{" "}
              <Link
                href={helpUrl}
                className="font-semibold text-blue-600 underline underline-offset-4"
              >
                help center
              </Link>{" "}
              has step-by-step guides and video tutorials.
            </Text>

            <Text className="mb-4 text-xs leading-5 text-gray-500">
              You received this email because you signed up for {appName} with {email}. 
              If you didn't sign up, you can safely ignore this email.
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
