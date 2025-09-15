import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

export default function PasswordResetSecure({
  name = "John Doe",
  email = "john@example.com",
  appName = "SecureApp",
  resetUrl = "https://app.secureapp.com/reset-password?token=abc123",
  logoUrl = "https://placehold.co/120x36?text=SecureApp",
  expirationMinutes = 30,
}: {
  name: string;
  email: string;
  appName: string;
  resetUrl: string;
  logoUrl: string;
  expirationMinutes?: number;
}) {
  return (
    <Html>
      <Head />
      <Preview>Reset your {appName} password</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white font-sans">
          <Container className="mx-auto my-10 max-w-[600px] rounded border border-solid border-neutral-200 px-10 py-5">
            <Section className="mt-8">
              <Img src={logoUrl} height="36" alt={appName} className="mx-auto" />
            </Section>
            
            <Heading className="mx-0 my-7 p-0 text-xl font-semibold text-black">
              Reset Your Password
            </Heading>
            
            <Text className="mb-6 text-sm leading-6 text-gray-600">
              Hi {name},
            </Text>
            
            <Text className="mb-6 text-sm leading-6 text-gray-600">
              We received a request to reset the password for your {appName} account ({email}).
            </Text>

            <Text className="mb-6 text-sm leading-6 text-gray-600">
              Click the button below to create a new password. This link will expire in {expirationMinutes} minutes for security reasons.
            </Text>

            <Section className="mb-8 text-center">
              <Link
                className="inline-block rounded-lg bg-red-600 px-6 py-3 text-center text-sm font-semibold text-white no-underline"
                href={resetUrl}
              >
                Reset Password
              </Link>
            </Section>

            <Text className="mb-4 text-sm leading-6 text-gray-600">
              If the button doesn't work, copy and paste this link into your browser:
            </Text>
            
            <Text className="mb-6 break-all rounded bg-gray-100 p-3 text-xs text-gray-800">
              {resetUrl}
            </Text>

            <Section className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <Text className="mb-2 text-sm font-semibold text-amber-800">
                🔒 Security Notice
              </Text>
              <Text className="text-sm leading-5 text-amber-700">
                If you didn't request a password reset, please ignore this email. Your account remains secure.
                For additional security, consider enabling two-factor authentication.
              </Text>
            </Section>

            <Text className="mb-4 text-sm leading-6 text-gray-600">
              Need help? Reply to this email or contact our support team.
            </Text>

            <Text className="mb-4 text-xs leading-5 text-gray-500">
              This password reset was requested from IP address 192.168.1.100 at {new Date().toLocaleString()}.
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
