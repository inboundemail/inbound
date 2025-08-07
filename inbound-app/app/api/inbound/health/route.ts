import { NextRequest, NextResponse } from 'next/server';
import { getDomainOwnerByDomain, markDomainAsVerified } from '@/lib/db/domains';
import { sendDomainVerificationNotification } from '@/lib/email-management/email-notifications';

// Types for AWS SNS notifications
interface SNSNotification {
  Type: 'Notification' | 'SubscriptionConfirmation' | 'UnsubscribeConfirmation';
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  UnsubscribeURL?: string;
  SubscribeURL?: string;
  Token?: string;
}

interface AWSHealthEvent {
  version: string;
  id: string;
  'detail-type': string;
  source: string;
  account: string;
  time: string;
  region: string;
  resources: string[];
  detail: {
    eventArn: string;
    service: string;
    eventTypeCode: string;
    eventTypeCategory: string;
    eventScopeCode: string;
    communicationId: string;
    startTime: string;
    endTime: string;
    lastUpdatedTime: string;
    statusCode: string;
    eventRegion: string;
    eventDescription: Array<{
      language: string;
      latestDescription: string;
    }>;
    eventMetadata: Record<string, string>;
    affectedEntities: Array<{
      entityValue: string;
      status: string;
      lastUpdatedTime: string;
    }>;
    affectedAccount: string;
    page: string;
    totalPages: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    // Get the request body
    const body = await request.json() as SNSNotification;
    
    // Parse the SNS notification
    const parsedNotification = parseSNSNotification(body);
    
    // Log the parsed notification
    console.log('=== AWS SNS Health Notification ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('SNS Message Type:', parsedNotification.messageType);
    console.log('Topic ARN:', parsedNotification.topicArn);
    
    if (parsedNotification.healthEvent) {
      console.log('--- AWS Health Event Details ---');
      console.log('Service:', parsedNotification.healthEvent.detail.service);
      console.log('Event Type:', parsedNotification.healthEvent.detail.eventTypeCode);
      console.log('Status:', parsedNotification.healthEvent.detail.statusCode);
      console.log('Region:', parsedNotification.healthEvent.detail.eventRegion);
      console.log('Affected Resources:', parsedNotification.healthEvent.resources);
      console.log('Description:', parsedNotification.healthEvent.detail.eventDescription[0]?.latestDescription);
      console.log('Affected Entities:', parsedNotification.healthEvent.detail.affectedEntities);
      console.log('Event Metadata:', parsedNotification.healthEvent.detail.eventMetadata);

      // Handle domain verification events
      await handleDomainVerificationEvent(parsedNotification.healthEvent);
    }
    
    // Log raw data for debugging
    console.log('--- Raw SNS Data ---');
    console.log(JSON.stringify(parsedNotification, null, 2));

    // Return success response
    return NextResponse.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      message: 'Health notification processed successfully',
      messageType: parsedNotification.messageType,
      eventType: parsedNotification.healthEvent?.detail?.eventTypeCode || 'unknown'
    });
  } catch (error) {
    console.error('Error processing health notification:', error);
    
    return NextResponse.json(
      { 
        status: 'error',
        timestamp: new Date().toISOString(),
        message: 'Health notification processing failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

function parseSNSNotification(snsData: SNSNotification) {
  const result = {
    messageType: snsData.Type,
    messageId: snsData.MessageId,
    topicArn: snsData.TopicArn,
    timestamp: snsData.Timestamp,
    healthEvent: null as AWSHealthEvent | null
  };

  // Parse the Message field if it's a Notification
  if (snsData.Type === 'Notification' && snsData.Message) {
    try {
      result.healthEvent = JSON.parse(snsData.Message) as AWSHealthEvent;
    } catch (error) {
      console.error('Failed to parse SNS Message field:', error);
    }
  }

  return result;
}

/**
 * Handle domain verification events from AWS Health
 */
async function handleDomainVerificationEvent(healthEvent: AWSHealthEvent) {
  try {
    const { service, eventTypeCode, statusCode } = healthEvent.detail;
    
    // Only handle SES domain verification success events
    if (service !== 'SES' || eventTypeCode !== 'AWS_SES_VERIFICATION_PENDING_TO_SUCCESS' || statusCode !== 'closed') {
      console.log(`⏭️ handleDomainVerificationEvent - Skipping non-domain-verification event: ${eventTypeCode}`);
      return;
    }

    // Extract domain from affected resources
    const affectedDomains = healthEvent.resources || [];
    
    if (affectedDomains.length === 0) {
      console.log('⚠️ handleDomainVerificationEvent - No affected domains found in health event');
      return;
    }

    // Process each affected domain
    for (const domain of affectedDomains) {
      console.log(`🔍 handleDomainVerificationEvent - Processing domain verification: ${domain}`);

      try {
        // Look up domain owner
        const domainOwner = await getDomainOwnerByDomain(domain);
        
        if (!domainOwner) {
          console.log(`⚠️ handleDomainVerificationEvent - No owner found for domain: ${domain}`);
          continue;
        }

        // Update domain status to verified
        const updatedDomain = await markDomainAsVerified(domain);
        
        if (!updatedDomain) {
          console.log(`⚠️ handleDomainVerificationEvent - Failed to update domain status: ${domain}`);
          continue;
        }

        // Send verification notification email
        const emailResult = await sendDomainVerificationNotification({
          userEmail: domainOwner.userEmail,
          userName: domainOwner.userName,
          domain: domain,
          verifiedAt: new Date()
        });

        if (emailResult.success) {
          console.log(`✅ handleDomainVerificationEvent - Notification sent for domain: ${domain}`);
          console.log(`   📧 Email sent to: ${domainOwner.userEmail}`);
          console.log(`   📧 Message ID: ${emailResult.messageId}`);
        } else {
          console.error(`❌ handleDomainVerificationEvent - Failed to send notification for domain: ${domain}`);
          console.error(`   Error: ${emailResult.error}`);
        }

      } catch (error) {
        console.error(`❌ handleDomainVerificationEvent - Error processing domain ${domain}:`, error);
        // Continue processing other domains
      }
    }

  } catch (error) {
    console.error('❌ handleDomainVerificationEvent - Unexpected error:', error);
  }
}

// Optional: Add GET method for basic health checks
export async function GET() {
  console.log('GET request to /api/inbound/health:', {
    timestamp: new Date().toISOString(),
    message: 'Health check via GET'
  });

  return NextResponse.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    message: 'Health check successful (GET)'
  });
} 