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
  Text,
} from '@react-email/components';
import * as React from 'react';

interface FeedbackEmailProps {
  userFirstname?: string;
  userEmail: string;
  feedback: string;
  submittedAt?: string;
}

export const FeedbackEmail = ({
  userFirstname = 'User',
  userEmail,
  feedback,
  submittedAt = new Date().toLocaleDateString(),
}: FeedbackEmailProps) => (
  <Html>
    <Head />
    <Preview>New feedback from {userFirstname} - inbound</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Header */}
        <Section style={headerSection}>
          <div style={logoContainer}>
            <Img
              src="https://inbound.new/inbound-wordmark.png"
              alt="inbound"
              width="200"
              height="60"
              style={wordmarkStyle}
            />
          </div>
        </Section>
        
        <Text style={text}>
          Hey Ryan! 👋
        </Text>
        
        <Text style={text}>
          You've received new feedback from <strong>{userFirstname}</strong> ({userEmail}).
        </Text>

        <Section style={detailsSection}>
          <Text style={detailText}>
            📅 Submitted on {submittedAt}
          </Text>
        </Section>

        <Section style={feedbackSection}>
          <Heading style={feedbackHeading}>💬 Feedback</Heading>
          <Text style={feedbackText}>
            {feedback}
          </Text>
        </Section>

        <Text style={text}>
          You can reply directly to this email to respond to {userFirstname}.
          <br/>
          <br/>
          - inbound feedback system
        </Text>

        <Section style={footerSection}>
          <Text style={footerText}>
            <Link href="https://inbound.new/dashboard" style={link}>dashboard</Link> • <Link href="https://inbound.new/docs" style={link}>docs</Link>
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

export default FeedbackEmail;

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
  textAlign: 'center' as const,
  marginBottom: '0',
};

const wordmarkStyle = {
  maxWidth: '100%',
  height: 'auto',
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

const feedbackSection = {
  backgroundColor: '#f8fafc',
  padding: '24px',
  margin: '24px 0',
};

const feedbackHeading = {
  color: '#334155',
  fontSize: '18px',
  fontWeight: '600',
  margin: '0 0 16px 0',
  fontFamily: 'Outfit, Arial, sans-serif',
};

const feedbackText = {
  color: '#334155',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0',
  fontFamily: 'Outfit, Arial, sans-serif',
  whiteSpace: 'pre-wrap' as const,
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

const footerText = {
  color: '#64748b',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '0',
  fontFamily: 'Outfit, Arial, sans-serif',
  textAlign: 'center' as const,
};

const link = {
  color: '#6C47FF',
  textDecoration: 'underline',
  fontWeight: '500',
}; 