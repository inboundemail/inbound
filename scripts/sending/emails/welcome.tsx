import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface WelcomeEmailProps {
  userFirstname?: string;
  domain?: string;
}

export const WelcomeEmail = ({
  userFirstname = 'there',
  domain = 'example.com',
}: WelcomeEmailProps) => (
  <Html>
    <Head />
    <Preview>Welcome to {domain} - Let's get started!</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Welcome to {domain}!</Heading>
        <Text style={text}>
          Hi {userFirstname},
        </Text>
        <Text style={text}>
          We're excited to have you join our community at {domain}. Your account has been successfully created and you're ready to get started.
        </Text>
        <Text style={text}>
          Here are some things you can do to get started:
        </Text>
        <Text style={text}>
          • Complete your profile setup
          • Explore our features and tools
          • Connect with other members
          • Check out our getting started guide
        </Text>
        <Text style={text}>
          If you have any questions, feel free to reach out to our support team. We're here to help!
        </Text>
        <Text style={text}>
          Best regards,<br />
          The {domain} Team
        </Text>
      </Container>
    </Body>
  </Html>
);

export default WelcomeEmail;

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0',
};

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '16px 0',
}; 