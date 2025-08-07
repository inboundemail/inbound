import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface NewsletterEmailProps {
  userFirstname?: string;
  domain?: string;
}

export const NewsletterEmail = ({
  userFirstname = 'Subscriber',
  domain = 'example.com',
}: NewsletterEmailProps) => (
  <Html>
    <Head />
    <Preview>Your weekly newsletter from {domain}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Weekly Newsletter</Heading>
        <Text style={text}>
          Hi {userFirstname},
        </Text>
        <Text style={text}>
          Welcome to this week's newsletter from {domain}! Here's what's been happening:
        </Text>
        
        <Section style={section}>
          <Heading style={h2}>🚀 Product Updates</Heading>
          <Text style={text}>
            We've rolled out several exciting new features this week, including improved performance and enhanced user experience.
          </Text>
        </Section>

        <Section style={section}>
          <Heading style={h2}>📊 Industry Insights</Heading>
          <Text style={text}>
            The latest trends in our industry show significant growth in automation and AI integration. Here's what you need to know.
          </Text>
        </Section>

        <Section style={section}>
          <Heading style={h2}>💡 Tips & Tricks</Heading>
          <Text style={text}>
            • Optimize your workflow with our new shortcuts
            • Take advantage of our advanced filtering options
            • Don't forget to check out our resource library
          </Text>
        </Section>

        <Text style={text}>
          That's all for this week! We'll be back next week with more updates and insights.
        </Text>
        
        <Text style={text}>
          Best regards,<br />
          The {domain} Team
        </Text>

        <Text style={footerText}>
          <Link href={`https://${domain}/unsubscribe`} style={link}>
            Unsubscribe
          </Link> | <Link href={`https://${domain}`} style={link}>
            Visit our website
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
);

export default NewsletterEmail;

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

const section = {
  margin: '32px 0',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0',
};

const h2 = {
  color: '#333',
  fontSize: '20px',
  fontWeight: 'bold',
  margin: '24px 0 16px',
  padding: '0',
};

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '16px 0',
};

const footerText = {
  color: '#666',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '32px 0 0',
  textAlign: 'center' as const,
};

const link = {
  color: '#2563eb',
  textDecoration: 'underline',
}; 