import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Tailwind,
  Text,
} from "@react-email/components";

interface WelcomeSignupEmailProps {
  userFirstname?: string;
}

export const WelcomeSignupEmail = ({
  userFirstname,
}: WelcomeSignupEmailProps) => (
  <Html>
    <Head />
    <Preview>thanks for signing up — reply if you have any questions</Preview>
    <Tailwind>
      <Body
        className="bg-white font-sans text-neutral-800"
        style={{ margin: "32px" }}
      >
        <Container style={{ maxWidth: "480px", margin: "0", padding: "0 16px" }}>
          <Text className="text-base leading-7">
            hey{userFirstname ? ` ${userFirstname}` : ""} — my name is ryan. i
            built inbound.
          </Text>

          <Text className="text-base leading-7">
            thanks for signing up. if you have any questions, hit a wall, or
            just want to tell me what you're building, reply to this email and
            i will most likely be the one who reads it and responds. this is my
            real email.
          </Text>

          <Text className="mt-8 text-base leading-7">— ryan</Text>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

export default WelcomeSignupEmail;
