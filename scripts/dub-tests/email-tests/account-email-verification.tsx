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

export default function AccountEmailVerification({
  userName = "Emma Rodriguez",
  email = "emma@newstartup.com",
  verificationUrl = "https://app.cloudbase.com/verify-email?token=abc123def456",
  appName = "CloudBase",
  logoUrl = "https://placehold.co/120x36?text=CloudBase",
  expirationHours = 24,
}: {
  userName: string;
  email: string;
  verificationUrl: string;
  appName: string;
  logoUrl: string;
  expirationHours?: number;
}) {
  return (
    <Html>
      <Head />
      <Preview>Verify your email address for {appName}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white font-sans">
          <Container className="mx-auto my-10 max-w-[600px] rounded border border-solid border-neutral-200 px-10 py-5">
            <Section className="mt-8">
              <Img src={logoUrl} height="36" alt={appName} className="mx-auto" />
            </Section>
            
            <Heading className="mx-0 my-7 p-0 text-xl font-semibold text-black">
              Please verify your email address
            </Heading>
            
            <Text className="mb-6 text-sm leading-6 text-gray-600">
              Hi {userName},
            </Text>
            
            <Text className="mb-6 text-sm leading-6 text-gray-600">
              Thanks for signing up for {appName}! To complete your account setup and ensure you receive important updates, 
              please verify your email address by clicking the button below.
            </Text>

            <Section className="mb-8 text-center">
              <Link
                className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-center text-sm font-semibold text-white no-underline"
                href={verificationUrl}
              >
                Verify Email Address
              </Link>
            </Section>

            <Text className="mb-4 text-sm leading-6 text-gray-600">
              If the button doesn't work, copy and paste this link into your browser:
            </Text>
            
            <Text className="mb-6 break-all rounded bg-gray-100 p-3 text-xs text-gray-800">
              {verificationUrl}
            </Text>

            {/* Why verify */}
            <Section className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <Text className="mb-2 text-sm font-semibold text-blue-800">
                🔒 Why verify your email?
              </Text>
              <ul className="space-y-1 text-sm leading-5 text-blue-700">
                <li>• Secure your account and prevent unauthorized access</li>
                <li>• Receive important security and product notifications</li>
                <li>• Enable password recovery if you ever get locked out</li>
                <li>• Get the latest features and updates from {appName}</li>
              </ul>
            </Section>

            {/* What's next */}
            <Section className="mb-6">
              <Text className="mb-3 text-base font-semibold text-black">
                What's next?
              </Text>
              
              <Text className="mb-3 text-sm leading-6 text-gray-600">
                <strong className="font-medium text-black">1. Verify your email</strong>
                <br />
                Click the verification button above to confirm your email address.
              </Text>
              
              <Text className="mb-3 text-sm leading-6 text-gray-600">
                <strong className="font-medium text-black">2. Complete your profile</strong>
                <br />
                Add your preferences and get {appName} personalized for you.
              </Text>
              
              <Text className="mb-3 text-sm leading-6 text-gray-600">
                <strong className="font-medium text-black">3. Start exploring</strong>
                <br />
                Dive into all the powerful features {appName} has to offer.
              </Text>
            </Section>

            <Hr className="mx-0 my-6 w-full border-t border-solid border-neutral-200" />

            {/* Security notice */}
            <Section className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <Text className="mb-2 text-sm font-semibold text-amber-800">
                ⚠️ Security Notice
              </Text>
              <Text className="text-sm leading-5 text-amber-700">
                This verification link expires in {expirationHours} hours for security. 
                If you didn't create an account with {appName}, please ignore this email.
              </Text>
            </Section>

            {/* Troubleshooting */}
            <Text className="mb-4 text-sm leading-6 text-gray-600">
              <strong className="font-medium text-black">Having trouble?</strong>
              <br />
              If you're having issues with verification, try these steps:
            </Text>

            <ul className="mb-6 space-y-1 text-sm text-gray-600">
              <li>• Make sure you're clicking from the same device/browser you signed up with</li>
              <li>• Check that the link hasn't expired (it's valid for {expirationHours} hours)</li>
              <li>• Try copying and pasting the full URL instead of clicking</li>
              <li>• Contact our support team if you continue having issues</li>
            </ul>

            <Text className="mb-4 text-sm leading-6 text-gray-600">
              Need help? Reply to this email and our support team will get back to you quickly.
            </Text>

            <Text className="mb-4 text-xs leading-5 text-gray-500">
              This verification email was sent to {email}. 
              If this wasn't you, you can safely ignore this message.
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
