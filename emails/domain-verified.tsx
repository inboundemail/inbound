import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface DomainVerifiedEmailProps {
  userFirstname?: string;
  domain?: string;
  verifiedAt?: string;
}

export const DomainVerifiedEmail = ({
  userFirstname = 'User',
  domain = 'example.com',
  verifiedAt = new Date().toLocaleDateString(),
}: DomainVerifiedEmailProps) => (
  <Html>
    <Head />
    <Preview>🎉 {domain} is verified and ready - inbound</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Header */}
        <Section style={headerSection}>
          <div style={logoContainer}>
            <Img
              src="https://inbound.new/inbound-logo-3.png"
              alt="inbound Logo"
              width="60"
              height="60"
              style={logoStyle}
            />
            <Text style={brandText}>inbound</Text>
          </div>
        </Section>
        
        <Text style={text}>
          Hi {userFirstname},
        </Text>
        
        <Text style={text}>
          🎉 Your domain <strong>{domain}</strong> is now verified and ready to receive emails through inbound.
        </Text>

        <Section style={detailsSection}>
          <Text style={detailText}>
            ✅ Verified on {verifiedAt}<br/>
            ✅ Email receiving active<br/>
            ✅ AWS SES configured
          </Text>
        </Section>

        <Section style={buttonSection}>
          <Button style={button} href="https://inbound.new/dashboard">
            open dashboard
          </Button>
        </Section>

        
        
        <Text style={text}>
          reply to this email if you have any questions, we read every email 
          <br/>
          <br/>
          - ryan
        </Text>

        <Section style={footerSection}>
          <Text style={footerText}>
            <Link href="https://inbound.new/docs" style={link}>docs</Link>
            <Link href="https://inbound.new/support" style={link}>support</Link>
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

export default DomainVerifiedEmail;

// Styles
const main = {
  backgroundColor: '#f8fafc',
  fontFamily: 'Outfit, Arial, sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  borderRadius: '12px',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
};

const headerSection = {
  textAlign: 'center' as const,
  padding: '32px 0 24px',
  borderBottom: '1px solid #e2e8f0',
  marginBottom: '32px',
};

const logoContainer = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '12px',
};

const logoStyle = {
  borderRadius: '12px',
};

const brandText = {
  fontSize: '36px',
  fontWeight: '600',
  color: '#000000',
  margin: '0',
  letterSpacing: '-0.025em',
  fontFamily: 'Outfit, Arial, sans-serif',
};

const detailsSection = {
  backgroundColor: '#f8fafc',
  padding: '20px 24px',
};

const detailText = {
  color: '#334155',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
  fontFamily: 'Outfit, Arial, sans-serif',
  wordBreak: 'break-word' as const,
};

const buttonSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const footerSection = {
  textAlign: 'center' as const,
  marginTop: '40px',
  paddingTop: '20px',
  borderTop: '1px solid #e2e8f0',
};

const text = {
  color: '#334155',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '16px 24px',
  fontFamily: 'Outfit, Arial, sans-serif',
};

const button = {
  backgroundColor: '#6C47FF',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'medium',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 32px',
  border: 'none',
  cursor: 'pointer',
  boxShadow: '0 4px 6px -1px rgba(108, 71, 255, 0.3)',
  fontFamily: 'Outfit, Arial, sans-serif',
};

const footerText = {
  color: '#64748b',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '0',
  fontFamily: 'Outfit, Arial, sans-serif',
  textAlign: 'center' as const,
  display: 'flex',
  justifyContent: 'center',
  gap: '12px',
};

const link = {
  color: '#6C47FF',
  textDecoration: 'underline',
  fontWeight: '500',
}; 