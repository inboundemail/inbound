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

interface NotificationEmailProps {
  userFirstname?: string;
  domain?: string;
  notificationType?: 'alert' | 'reminder' | 'update';
}

export const NotificationEmail = ({
  userFirstname = 'User',
  domain = 'example.com',
  notificationType = 'alert',
}: NotificationEmailProps) => {
  const getNotificationContent = () => {
    switch (notificationType) {
      case 'reminder':
        return {
          title: '⏰ Friendly Reminder',
          message: 'You have pending tasks that need your attention.',
          action: 'View Tasks',
        };
      case 'update':
        return {
          title: '🔄 System Update',
          message: 'We\'ve made some improvements to enhance your experience.',
          action: 'Learn More',
        };
      default:
        return {
          title: '🚨 Important Alert',
          message: 'There\'s something that requires your immediate attention.',
          action: 'Take Action',
        };
    }
  };

  const content = getNotificationContent();

  return (
    <Html>
      <Head />
      <Preview>{content.title} from {domain}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{content.title}</Heading>
          <Text style={text}>
            Hi {userFirstname},
          </Text>
          <Text style={text}>
            {content.message}
          </Text>
          
          <Section style={section}>
            <Text style={text}>
              Here are the details you need to know:
            </Text>
            <Text style={text}>
              • This notification was triggered by recent activity on your account
              • No immediate action is required, but we recommend reviewing the details
              • You can manage your notification preferences in your account settings
            </Text>
          </Section>

          <Section style={buttonSection}>
            <Button style={button} href={`https://${domain}/dashboard`}>
              {content.action}
            </Button>
          </Section>

          <Text style={text}>
            If you have any questions or concerns, please don't hesitate to contact our support team.
          </Text>
          
          <Text style={text}>
            Best regards,<br />
            The {domain} Team
          </Text>

          <Text style={footerText}>
            <Link href={`https://${domain}/notifications/settings`} style={link}>
              Manage notification preferences
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default NotificationEmail;

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

const buttonSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0',
};

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '16px 0',
};

const button = {
  backgroundColor: '#2563eb',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px 24px',
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