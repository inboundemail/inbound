import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import * as React from 'react'

interface VipPaymentRequestEmailProps {
  senderName: string
  senderEmail: string
  recipientName: string
  recipientEmail: string
  emailSubject: string
  priceInCents: number
  customMessage?: string
  paymentUrl: string
  allowAfterPayment: boolean
  expirationHours: number
}

export const VipPaymentRequestEmail = ({
  senderName,
  senderEmail,
  recipientName,
  recipientEmail,
  emailSubject,
  priceInCents,
  customMessage,
  paymentUrl,
  allowAfterPayment,
  expirationHours,
}: VipPaymentRequestEmailProps) => {
  const price = (priceInCents / 100).toFixed(2)

  return (
    <Html>
      <Head />
      <Preview>Payment required to deliver your email to {recipientEmail}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img
            src={`${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/logo.png`}
            width="120"
            height="36"
            alt="Inbound"
            style={logo}
          />
          <Heading style={heading}>Payment Required</Heading>
          <Text style={paragraph}>
            Hi {senderName},
          </Text>
          <Text style={paragraph}>
            You're trying to reach <strong>{recipientName}</strong> at{' '}
            <Link href={`mailto:${recipientEmail}`} style={link}>
              {recipientEmail}
            </Link>
            , but they require a payment of <strong>${price}</strong> to receive emails from new senders.
          </Text>
          
          {customMessage && (
            <Section style={messageBox}>
              <Text style={messageText}>{customMessage}</Text>
            </Section>
          )}

          <Section style={subjectSection}>
            <Text style={subjectLabel}>Your email subject:</Text>
            <Text style={subjectText}>{emailSubject}</Text>
          </Section>

          <Section style={buttonContainer}>
            <Button style={button} href={paymentUrl}>
              Pay ${price} to Deliver Email
            </Button>
          </Section>

          <Text style={footerText}>
            {allowAfterPayment
              ? 'After payment, all your future emails to this address will be delivered automatically.'
              : 'This payment covers delivery of your current email only.'}
          </Text>
          
          <Text style={footerText}>
            This payment link expires in {expirationHours} hours.
          </Text>

          <Hr style={hr} />
          
          <Text style={footer}>
            Powered by{' '}
            <Link href="https://inbound.new" style={link}>
              Inbound
            </Link>
            {' '}• VIP Email Protection
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

VipPaymentRequestEmail.PreviewProps = {
  senderName: 'John Doe',
  senderEmail: 'john@example.com',
  recipientName: 'Jane Smith',
  recipientEmail: 'jane@company.com',
  emailSubject: 'Proposal for Q4 Marketing Campaign',
  priceInCents: 500,
  customMessage: 'I value my time and use VIP protection to ensure only serious inquiries reach my inbox.',
  paymentUrl: 'https://checkout.stripe.com/example',
  allowAfterPayment: true,
  expirationHours: 24,
} as VipPaymentRequestEmailProps

export default VipPaymentRequestEmail

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
}

const logo = {
  margin: '0 auto',
  marginBottom: '32px',
}

const heading = {
  fontSize: '32px',
  lineHeight: '1.3',
  fontWeight: '700',
  color: '#484848',
  textAlign: 'center' as const,
  margin: '30px 0',
}

const paragraph = {
  fontSize: '16px',
  lineHeight: '26px',
  color: '#484848',
  margin: '16px 0',
}

const link = {
  color: '#6C47FF',
  textDecoration: 'none',
}

const messageBox = {
  backgroundColor: '#f4f4f5',
  borderRadius: '8px',
  padding: '16px',
  margin: '24px 0',
}

const messageText = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#666666',
  fontStyle: 'italic' as const,
  margin: 0,
}

const subjectSection = {
  margin: '24px 0',
}

const subjectLabel = {
  fontSize: '14px',
  color: '#666666',
  margin: '0 0 4px 0',
}

const subjectText = {
  fontSize: '16px',
  color: '#484848',
  fontWeight: '600',
  margin: 0,
}

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
}

const button = {
  backgroundColor: '#6C47FF',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
}

const footerText = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#666666',
  textAlign: 'center' as const,
  margin: '8px 0',
}

const hr = {
  borderColor: '#e6ebf1',
  margin: '32px 0',
}

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  textAlign: 'center' as const,
} 