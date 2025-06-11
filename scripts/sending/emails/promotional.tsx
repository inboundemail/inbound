import {
  Body,
  Button,
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

interface PromotionalEmailProps {
  userFirstname?: string;
  domain?: string;
  offerTitle?: string;
  discountPercent?: number;
}

export const PromotionalEmail = ({
  userFirstname = 'Valued Customer',
  domain = 'example.com',
  offerTitle = 'Special Limited Time Offer',
  discountPercent = 25,
}: PromotionalEmailProps) => (
  <Html>
    <Head />
    <Preview>🎉 {offerTitle} - {discountPercent.toString()}% OFF from {domain}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <Heading style={h1}>🎉 {offerTitle}</Heading>
          <Text style={discountText}>
            {discountPercent.toString()}% OFF
          </Text>
        </Section>
        
        <Text style={text}>
          Hi {userFirstname},
        </Text>
        <Text style={text}>
          We're excited to offer you an exclusive discount! For a limited time, you can save {discountPercent.toString()}% on all our premium features.
        </Text>
        
        <Section style={section}>
          <Heading style={h2}>✨ What's Included:</Heading>
          <Text style={text}>
            • Access to all premium features
            • Priority customer support
            • Advanced analytics and reporting
            • Custom integrations and API access
            • Extended storage and bandwidth
          </Text>
        </Section>

        <Section style={urgencySection}>
          <Text style={urgencyText}>
            ⏰ This offer expires in 48 hours!
          </Text>
          <Text style={text}>
            Don't miss out on this incredible opportunity to upgrade your experience with {domain}.
          </Text>
        </Section>

        <Section style={buttonSection}>
          <Button style={button} href={`https://${domain}/upgrade?promo=${discountPercent}OFF`}>
            Claim Your {discountPercent.toString()}% Discount
          </Button>
        </Section>

        <Text style={text}>
          Have questions about our premium features? Our team is here to help you make the most of your upgrade.
        </Text>
        
        <Text style={text}>
          Best regards,<br />
          The {domain} Sales Team
        </Text>

        <Text style={footerText}>
          <Link href={`https://${domain}/unsubscribe`} style={link}>
            Unsubscribe from promotional emails
          </Link> | <Link href={`https://${domain}/contact`} style={link}>
            Contact us
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
);

export default PromotionalEmail;

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

const headerSection = {
  textAlign: 'center' as const,
  margin: '40px 0',
};

const section = {
  margin: '32px 0',
};

const urgencySection = {
  backgroundColor: '#fef3c7',
  padding: '20px',
  borderRadius: '8px',
  margin: '32px 0',
  textAlign: 'center' as const,
};

const buttonSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const h1 = {
  color: '#333',
  fontSize: '28px',
  fontWeight: 'bold',
  margin: '0 0 16px',
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

const discountText = {
  color: '#dc2626',
  fontSize: '36px',
  fontWeight: 'bold',
  margin: '0',
  textAlign: 'center' as const,
};

const urgencyText = {
  color: '#92400e',
  fontSize: '18px',
  fontWeight: 'bold',
  margin: '0 0 16px',
};

const button = {
  backgroundColor: '#dc2626',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '18px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '16px 32px',
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