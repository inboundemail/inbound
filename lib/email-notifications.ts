import { Resend } from 'resend';
import { render } from '@react-email/render';
import DomainVerifiedEmail from '@/emails/domain-verified';

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

export interface DomainVerificationNotificationData {
  userEmail: string;
  userName: string | null;
  domain: string;
  verifiedAt: Date;
}

/**
 * Send domain verification notification email to the domain owner
 */
export async function sendDomainVerificationNotification(
  data: DomainVerificationNotificationData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    console.log(`📧 sendDomainVerificationNotification - Sending notification for domain: ${data.domain} to ${data.userEmail}`);

    // Validate required environment variable
    if (!process.env.RESEND_API_KEY) {
      console.error('❌ sendDomainVerificationNotification - RESEND_API_KEY not configured');
      return {
        success: false,
        error: 'Email service not configured'
      };
    }

    // Prepare email template props
    const templateProps = {
      userFirstname: data.userName?.split(' ')[0] || 'User',
      domain: data.domain,
      verifiedAt: data.verifiedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      })
    };

    // Render the email template
    const html = await render(DomainVerifiedEmail(templateProps));

    // Determine the from address
    // Use a verified domain if available, otherwise use the default
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'notifications@inbound.new';
    
    // Format sender with name - Resend accepts "Name <email@domain.com>" format
    const fromWithName = `inbound support <${fromEmail}>`;

    // Send the email
    const response = await resend.emails.send({
      from: fromWithName,
      to: data.userEmail,
      subject: `🎉 ${data.domain} has been successfully verified - inbound`,
      html: html,
      tags: [
        { name: 'type', value: 'domain-verification' },
        { name: 'domain', value: data.domain.replace(/[^a-zA-Z0-9_-]/g, '_') }
      ]
    });

    if (response.error) {
      console.error('❌ sendDomainVerificationNotification - Resend API error:', response.error);
      return {
        success: false,
        error: `Email sending failed: ${response.error.message}`
      };
    }

    console.log(`✅ sendDomainVerificationNotification - Email sent successfully to ${data.userEmail}`);
    console.log(`   📧 Message ID: ${response.data?.id}`);

    return {
      success: true,
      messageId: response.data?.id
    };

  } catch (error) {
    console.error('❌ sendDomainVerificationNotification - Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Send a test domain verification email (for testing purposes)
 */
export async function sendTestDomainVerificationEmail(
  testEmail: string,
  testDomain: string = 'example.com'
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  return sendDomainVerificationNotification({
    userEmail: testEmail,
    userName: 'Test User',
    domain: testDomain,
    verifiedAt: new Date()
  });
} 