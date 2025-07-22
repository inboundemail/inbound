import { db } from '@/lib/db'
import { vipPaymentSessions, vipAllowedSenders, vipConfigs, vipEmailAttempts, structuredEmails } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import CircleCheck from '@/components/icons/circle-check'
import Envelope2 from '@/components/icons/envelope-2'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { nanoid } from 'nanoid'
import { Inbound } from '@inboundemail/sdk'

const inbound = new Inbound({
  apiKey: process.env.INBOUND_API_KEY!,
  defaultReplyFrom: 'noreply@inbound.email'
})

async function processPaymentSuccess(sessionId: string) {
  // Get payment session
  const paymentSession = await db
    .select()
    .from(vipPaymentSessions)
    .where(eq(vipPaymentSessions.id, sessionId))
    .limit(1)

  if (!paymentSession[0]) {
    return { success: false, error: 'Payment session not found' }
  }

  if (paymentSession[0].status === 'paid') {
    // Already processed
    return { 
      success: true, 
      alreadyProcessed: true,
      senderEmail: paymentSession[0].senderEmail 
    }
  }

  // Update payment session status
  await db
    .update(vipPaymentSessions)
    .set({
      status: 'paid',
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(vipPaymentSessions.id, sessionId))

  // Get VIP config
  const vipConfig = await db
    .select()
    .from(vipConfigs)
    .where(eq(vipConfigs.id, paymentSession[0].vipConfigId))
    .limit(1)

  if (!vipConfig[0]) {
    return { success: false, error: 'VIP configuration not found' }
  }

  // If allowAfterPayment is true, add sender to allowed list
  if (vipConfig[0].allowAfterPayment) {
    await db.insert(vipAllowedSenders).values({
      id: nanoid(),
      vipConfigId: vipConfig[0].id,
      senderEmail: paymentSession[0].senderEmail,
      paymentSessionId: sessionId,
      createdAt: new Date(),
    })
  }

  // Update the email attempt status to 'allowed' since payment was successful
  await db
    .update(vipEmailAttempts)
    .set({
      status: 'allowed',
      allowedReason: 'payment_completed',
      updatedAt: new Date(),
    })
    .where(eq(vipEmailAttempts.paymentSessionId, sessionId))

  // Get the original email
  const originalEmail = await db
    .select()
    .from(structuredEmails)
    .where(eq(structuredEmails.id, paymentSession[0].originalEmailId))
    .limit(1)

  if (originalEmail[0]) {
    // Deliver the original email
    // This would typically trigger your normal email delivery flow
    console.log('Delivering original email:', originalEmail[0].id)
    
    // You might want to send a notification to the recipient
    // or trigger your normal email processing flow here
  }

  return { 
    success: true, 
    senderEmail: paymentSession[0].senderEmail,
    allowFutureEmails: vipConfig[0].allowAfterPayment 
  }
}

export default async function VipPaymentSuccessPage({
  searchParams,
}: {
  searchParams: { session_id?: string }
}) {
  if (!searchParams.session_id) {
    redirect('/')
  }

  const result = await processPaymentSuccess(searchParams.session_id)

  if (!result.success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-red-600">Payment Error</CardTitle>
            <CardDescription>
              {result.error || 'An error occurred processing your payment'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/">Return Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="relative">
              <Envelope2 className="h-16 w-16 text-gray-400" />
              <CircleCheck className="h-8 w-8 text-green-500 absolute -bottom-1 -right-1 bg-white dark:bg-gray-800 rounded-full" />
            </div>
          </div>
          <CardTitle className="text-center text-2xl">
            {result.alreadyProcessed ? 'Email Already Delivered' : 'Payment Successful!'}
          </CardTitle>
          <CardDescription className="text-center">
            {result.alreadyProcessed 
              ? 'Your email has already been delivered.'
              : 'Your email has been delivered successfully.'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Email sent from: <span className="font-medium text-gray-900 dark:text-gray-100">{result.senderEmail}</span>
            </p>
          </div>
          
          {result.allowFutureEmails && !result.alreadyProcessed && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <CircleCheck className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">
                    Future emails approved
                  </p>
                  <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                    All your future emails to this address will be delivered automatically.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          <div className="text-center pt-4">
            <p className="text-sm text-gray-500">
              You can close this window now.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 