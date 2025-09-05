import { Resend } from 'resend';
import { config } from 'dotenv';
import { render } from '@react-email/render';
import WelcomeEmail from './emails/welcome';
import NewsletterEmail from './emails/newsletter';
import NotificationEmail from './emails/notification';
import PromotionalEmail from './emails/promotional';

// Load environment variables
config({ path: '.env' });

const resend = new Resend(process.env.RESEND_API_KEY);

// Types
interface Domain {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

interface EmailTemplate {
  name: string;
  component: any;
  subject: string;
  props?: any;
}

// Random user names for generating email addresses
const firstNames = [
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Quinn',
  'Blake', 'Cameron', 'Drew', 'Emery', 'Finley', 'Harper', 'Hayden', 'Jamie',
  'Kendall', 'Logan', 'Parker', 'Peyton', 'Reese', 'River', 'Rowan', 'Sage',
  'Skyler', 'Sydney', 'Tatum', 'Teagan', 'Wren', 'Zion'
];

const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson'
];

// Email templates configuration
const emailTemplates: EmailTemplate[] = [
  {
    name: 'Welcome',
    component: WelcomeEmail,
    subject: 'Welcome to {domain}!',
    props: {}
  },
  {
    name: 'Newsletter',
    component: NewsletterEmail,
    subject: 'Your Weekly Newsletter from {domain}',
    props: {}
  },
  {
    name: 'Notification',
    component: NotificationEmail,
    subject: 'Important Notification from {domain}',
    props: { notificationType: 'alert' }
  },
  {
    name: 'Promotional',
    component: PromotionalEmail,
    subject: '🎉 Special Offer - 25% OFF at {domain}',
    props: { offerTitle: 'Flash Sale', discountPercent: 25 }
  }
];

// Utility functions
function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function generateRandomUser(): { firstName: string; lastName: string; email: string } {
  const firstName = getRandomElement(firstNames);
  const lastName = getRandomElement(lastNames);
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`;
  return { firstName, lastName, email };
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function parseCommandLineArgs(): { email: string; count: number; isDev: boolean } {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('❌ Usage: bun run email <email-address> <number-of-emails> [--dev]');
    console.error('   Example: bun run email user@example.com 5');
    console.error('   Example: bun run email user@example.com 5 --dev');
    process.exit(1);
  }

  const email = args[0];
  const count = parseInt(args[1], 10);
  const isDev = args.includes('--dev');

  if (!email || !email.includes('@')) {
    console.error('❌ Invalid email address provided');
    process.exit(1);
  }

  if (isNaN(count) || count <= 0) {
    console.error('❌ Invalid number of emails. Must be a positive integer');
    process.exit(1);
  }

  if (count > 50) {
    console.error('❌ Maximum 50 emails allowed per run');
    process.exit(1);
  }

  return { email, count, isDev };
}

async function getVerifiedDomains(): Promise<Domain[]> {
  try {
    console.log('🔍 Fetching verified domains from Resend...');
    const response = await resend.domains.list();
    
    if (!response.data) {
      throw new Error('No domains data received from Resend API');
    }

    // Access the domains array from the response data
    const domainsArray = Array.isArray(response.data) ? response.data : (response.data as any).data || [];
    
    const verifiedDomains = domainsArray.filter((domain: any) => 
      domain.status === 'verified' || domain.status === 'active'
    );

    console.log(`✅ Found ${verifiedDomains.length} verified domains`);
    verifiedDomains.forEach((domain: any) => {
      console.log(`   - ${domain.name} (${domain.status})`);
    });

    return verifiedDomains;
  } catch (error) {
    console.error('❌ Error fetching domains:', error);
    throw error;
  }
}

async function sendEmail(
  fromEmail: string,
  toEmail: string,
  template: EmailTemplate,
  templateProps: any,
  isDev: boolean = false
): Promise<void> {
  try {
    const EmailComponent = template.component;
    const html = await render(EmailComponent(templateProps));
    let subject = template.subject.replace('{domain}', templateProps.domain);
    
    // Add dev prefix if in dev mode
    if (isDev) {
      subject = `[[[DEV||| ${subject}`;
    }

    const response = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: subject,
      html: html,
    });

    if (response.error) {
      throw new Error(`Resend API error: ${response.error.message}`);
    }

    console.log(`✅ Sent ${template.name} email from ${fromEmail} to ${toEmail}`);
    console.log(`   📧 Email ID: ${response.data?.id}`);
  } catch (error) {
    console.error(`❌ Failed to send ${template.name} email from ${fromEmail} to ${toEmail}:`, error);
    throw error;
  }
}

async function main() {
  try {
    console.log('🚀 Starting email sending script...\n');

    // Parse command line arguments
    const { email: recipientEmail, count: emailCount, isDev } = parseCommandLineArgs();

    // Validate API key
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }

    console.log(`📬 Will send ${emailCount} emails to: ${recipientEmail}`);
    if (isDev) {
      console.log(`🧪 DEV MODE: All subjects will be prefixed with [[[DEV|||`);
    }
    console.log('');

    // Get verified domains
    const domains = await getVerifiedDomains();
    
    if (domains.length === 0) {
      throw new Error('No verified domains found');
    }

    // Shuffle domains for random selection
    const shuffledDomains = shuffleArray(domains);

    let emailsSent = 0;
    let emailsFailed = 0;

    // Send the specified number of emails
    for (let i = 0; i < emailCount; i++) {
      // Select domain (cycle through if we need more emails than domains)
      const domain = shuffledDomains[i % shuffledDomains.length];
      
      // Generate a random user for this email
      const user = generateRandomUser();
      const fromEmail = `${user.email}@${domain.name}`;
      
      // Pick a random email template
      const template = getRandomElement(emailTemplates);
      
      // Prepare template props
      const templateProps = {
        userFirstname: user.firstName,
        domain: domain.name,
        ...template.props
      };

      console.log(`\n📧 Sending email ${i + 1}/${emailCount} from ${domain.name}...`);

      try {
        await sendEmail(fromEmail, recipientEmail, template, templateProps, isDev);
        emailsSent++;
        
        // Add a small delay between emails to avoid rate limiting
        if (i < emailCount - 1) { // Don't delay after the last email
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        emailsFailed++;
        console.error(`Failed to send email ${i + 1}: ${error}`);
      }
    }

    console.log('\n📊 Email Sending Summary:');
    console.log(`📬 Recipient: ${recipientEmail}`);
    console.log(`🎯 Requested: ${emailCount} emails`);
    console.log(`✅ Successfully sent: ${emailsSent} emails`);
    console.log(`❌ Failed to send: ${emailsFailed} emails`);
    console.log(`📈 Success rate: ${emailsSent > 0 ? Math.round((emailsSent / (emailsSent + emailsFailed)) * 100) : 0}%`);

  } catch (error) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

export { main, getVerifiedDomains, sendEmail };
