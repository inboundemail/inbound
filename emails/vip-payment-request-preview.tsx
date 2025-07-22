import VipPaymentRequestEmail from './vip-payment-request'
import { renderAsync } from '@react-email/render'

export default function VipPaymentRequestPreview() {
  return (
    <VipPaymentRequestEmail
      senderName="John Doe"
      senderEmail="john@example.com"
      recipientName="Jane Smith"
      recipientEmail="jane@company.com"
      emailSubject="Proposal for Q4 Marketing Campaign"
      priceInCents={500}
      customMessage="I value my time and use VIP protection to ensure only serious inquiries reach my inbox."
      paymentUrl="https://checkout.stripe.com/example"
      allowAfterPayment={true}
      expirationHours={24}
    />
  )
}

// Export a function to generate the HTML
export async function generateVipPaymentRequestEmail(props: {
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
}) {
  return await renderAsync(<VipPaymentRequestEmail {...props} />)
} 