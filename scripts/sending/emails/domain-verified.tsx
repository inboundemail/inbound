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
    <Preview>🎉 {domain} has been successfully verified - Inbound</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Header with Inbound branding */}
        <Section style={headerSection}>
          <div style={logoContainer}>
            <svg width="60" height="60" viewBox="0 0 250 250" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="10.8333" y="10.8333" width="228.333" height="228.333" rx="39.1667" stroke="#6C47FF" strokeWidth="21.6667" />
              <path d="M83.3088 67.1993C85.7623 64.5105 89.0899 63 92.5596 63H125.266V161.901C122.682 161.901 120.155 161.062 118.005 159.49L82.4206 133.468C81.5208 132.818 80.7813 131.935 80.2678 130.897C79.7542 129.859 79.4826 128.699 79.4771 127.518V77.3373C79.4771 73.5348 80.8554 69.8881 83.3088 67.1993Z" fill="#6C47FF" />
              <path d="M167.223 67.271C164.77 64.5822 161.442 63.0717 157.972 63.0717H125.266V161.972C127.85 161.972 130.377 161.134 132.527 159.562L168.111 133.539C169.011 132.89 169.751 132.007 170.264 130.969C170.778 129.931 171.049 128.77 171.055 127.59V77.409C171.055 73.6065 169.677 69.9598 167.223 67.271Z" fill="#6C47FF" />
              <g filter="url(#filter0_d_112_135)">
                <path d="M191.532 116.638V174.356C191.532 177.71 190.136 180.926 187.65 183.297C185.165 185.668 181.794 187 178.279 187H72.2533C68.7383 187 65.3673 185.668 62.8818 183.297C60.3964 180.926 59.0001 177.71 59.0001 174.356V116.638C58.9925 114.345 59.6383 112.094 60.8683 110.125C62.0984 108.156 63.8664 106.543 65.9833 105.459C68.1002 104.374 70.4863 103.859 72.8863 103.969C75.2864 104.078 77.61 104.808 79.6088 106.08L125.266 135.161L170.923 106.08C172.922 104.808 175.246 104.078 177.646 103.969C180.046 103.859 182.432 104.374 184.549 105.459C186.666 106.543 188.434 108.156 189.664 110.125C190.894 112.094 191.54 114.345 191.532 116.638Z" fill="white" />
              </g>
              <defs>
                <filter id="filter0_d_112_135" x="57.8624" y="103.954" width="134.807" height="85.3211" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                  <feFlood floodOpacity="0" result="BackgroundImageFix" />
                  <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                  <feOffset dy="1.13761" />
                  <feGaussianBlur stdDeviation="0.568807" />
                  <feComposite in2="hardAlpha" operator="out" />
                  <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
                  <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_112_135" />
                  <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_112_135" result="shape" />
                </filter>
              </defs>
            </svg>
            <Text style={brandText}>Inbound</Text>
          </div>
        </Section>

        {/* Success message */}
        <Section style={successSection}>
          <div style={successIcon}>🎉</div>
          <Heading style={h1}>Domain Verified Successfully!</Heading>
          <Text style={successText}>
            <strong>{domain}</strong> is now ready to receive emails
          </Text>
        </Section>
        
        <Text style={text}>
          Hi {userFirstname},
        </Text>
        
        <Text style={text}>
          Great news! Your domain <strong>{domain}</strong> has been successfully verified with Amazon SES and is now ready to receive emails through Inbound.
        </Text>

        <Section style={detailsSection}>
          <Heading style={h2}>✅ What's Ready:</Heading>
          <Text style={text}>
            • Domain verification completed on {verifiedAt}
            • Email receiving is now active
            • All configured email addresses are ready
            • AWS SES integration is working properly
          </Text>
        </Section>

        <Section style={nextStepsSection}>
          <Heading style={h2}>🚀 Next Steps:</Heading>
          <Text style={text}>
            • Configure email addresses and endpoints in your dashboard
            • Set up webhooks to receive email notifications
            • Test your email setup with our testing tools
            • Monitor your email activity and analytics
          </Text>
        </Section>

        <Section style={buttonSection}>
          <Button style={button} href="https://inbound.new/dashboard">
            Go to Dashboard
          </Button>
        </Section>

        <Text style={text}>
          If you have any questions or need help setting up your email configuration, our support team is here to help.
        </Text>
        
        <Text style={text}>
          Best regards,<br />
          The Inbound Team
        </Text>

        <Section style={footerSection}>
          <Text style={footerText}>
            <Link href="https://inbound.new/docs" style={link}>
              Documentation
            </Link> | <Link href="https://inbound.new/support" style={link}>
              Support
            </Link> | <Link href="https://inbound.new/dashboard" style={link}>
              Dashboard
            </Link>
          </Text>
          <Text style={footerSubtext}>
            Inbound - Modern email infrastructure for developers
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
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '600px',
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

const brandText = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: '#6C47FF',
  margin: '0',
  letterSpacing: '-0.025em',
};

const successSection = {
  textAlign: 'center' as const,
  padding: '24px',
  backgroundColor: '#f0fdf4',
  borderRadius: '12px',
  border: '1px solid #bbf7d0',
  margin: '32px 24px',
};

const successIcon = {
  fontSize: '48px',
  marginBottom: '16px',
};

const successText = {
  fontSize: '18px',
  color: '#166534',
  margin: '16px 0 0',
  fontWeight: '500',
};

const detailsSection = {
  backgroundColor: '#f8fafc',
  padding: '24px',
  borderRadius: '8px',
  margin: '32px 24px',
  border: '1px solid #e2e8f0',
};

const nextStepsSection = {
  backgroundColor: '#fef3c7',
  padding: '24px',
  borderRadius: '8px',
  margin: '32px 24px',
  border: '1px solid #fbbf24',
};

const buttonSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const footerSection = {
  textAlign: 'center' as const,
  marginTop: '48px',
  paddingTop: '24px',
  borderTop: '1px solid #e2e8f0',
};

const h1 = {
  color: '#166534',
  fontSize: '28px',
  fontWeight: 'bold',
  margin: '16px 0',
  padding: '0',
  textAlign: 'center' as const,
};

const h2 = {
  color: '#1e293b',
  fontSize: '20px',
  fontWeight: 'bold',
  margin: '0 0 16px',
  padding: '0',
};

const text = {
  color: '#334155',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '16px 24px',
};

const button = {
  backgroundColor: '#6C47FF',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 32px',
  border: 'none',
  cursor: 'pointer',
  boxShadow: '0 4px 6px -1px rgba(108, 71, 255, 0.3)',
};

const footerText = {
  color: '#64748b',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '0 0 8px',
};

const footerSubtext = {
  color: '#94a3b8',
  fontSize: '12px',
  lineHeight: '20px',
  margin: '0',
};

const link = {
  color: '#6C47FF',
  textDecoration: 'underline',
  fontWeight: '500',
}; 