import {
  Body,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Tailwind,
  Text,
} from "@react-email/components";

interface DomainVerifiedEmailProps {
  userFirstname?: string;
  domain?: string;
  verifiedAt?: string;
}

export const DomainVerifiedEmail = ({
  userFirstname = "User",
  domain = "example.com",
  verifiedAt = new Date().toLocaleDateString(),
}: DomainVerifiedEmailProps) => (
  <Html>
    <Head />
    <Preview>Domain verified: {domain}</Preview>
    <Tailwind>
      <Body className="bg-white font-sans text-neutral-800" style={{ margin: "32px" }}>
        <Container style={{ maxWidth: "480px", margin: "0", padding: "0 16px" }}>
          <Text className="text-base leading-7">
            Hi {userFirstname}, your domain <strong>{domain}</strong> is now verified and ready to receive emails through inbound.
          </Text>
          <Text className="m-0 mt-4 text-sm leading-6">- Verified on {verifiedAt}</Text>
          <Text className="m-0 text-sm leading-6">- Email receiving active</Text>
          <Text className="m-0 text-sm leading-6">- Email sending active</Text>

          <Text className="my-6">
            <Link
              href="https://inbound.new/dashboard"
              className="text-violet-600 underline"
            >
              Open Dashboard →
            </Link>
          </Text>

          <Text className="text-base leading-7">
            Visit your{" "}
            <Link href="https://inbound.new/dashboard" className="text-violet-600 underline">
              dashboard
            </Link>{" "}
            or read the{" "}
            <Link href="https://inbound.new/docs" className="text-violet-600 underline">
              docs
            </Link>{" "}
            to get started. Reply to this email if you have any questions.
          </Text>

          <Text className="mt-8 text-sm text-neutral-500">
            — inbound
          </Text>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

export default DomainVerifiedEmail;
