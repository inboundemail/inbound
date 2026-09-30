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

interface CheckinWeek1EmailProps {
  userFirstname?: string;
  emailsProcessed?: number;
}

export const CheckinWeek1Email = ({
  userFirstname = "there",
  emailsProcessed = 0,
}: CheckinWeek1EmailProps) => (
  <Html>
    <Head />
    <Preview>One week with inbound — need a hand?</Preview>
    <Tailwind>
      <Body className="bg-white font-sans text-neutral-800" style={{ margin: "32px" }}>
        <Container style={{ maxWidth: "480px", margin: "0", padding: "0 16px" }}>
          <Text className="text-base leading-7">
            Hi {userFirstname}, just checking in. You've processed {(emailsProcessed || 0).toLocaleString()} email(s) so far.
          </Text>
          <Text className="text-base leading-7">
            Popular next steps:
          </Text>
          <Text className="m-0 text-base leading-7">- Add webhook delivery for events</Text>
          <Text className="m-0 text-base leading-7">- Create rules to route emails to teams</Text>
          <Text className="m-0 mb-4 text-base leading-7">- Enable replies API to respond from threads</Text>
          <Text className="my-6">
            <Link
              href="https://inbound.new/dashboard"
              className="text-violet-600 underline"
            >
              Open Dashboard →
            </Link>
          </Text>
          <Text className="text-base leading-7">
            Questions? Reply to this email or browse the{" "}
            <Link href="https://inbound.new/docs" className="text-violet-600 underline">
              docs
            </Link>.
          </Text>
          <Text className="mt-8 text-sm text-neutral-500">
            — inbound
          </Text>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

export default CheckinWeek1Email;
