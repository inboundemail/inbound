import { GetIdentityVerificationAttributesCommand, SESClient } from '@aws-sdk/client-ses';
import { NextRequest, NextResponse } from 'next/server';
import {
  isTrustedSnsUrl,
  type SnsNotification,
  verifySnsNotification,
} from '@/app/api/inbound/health/tenant/sns-verification';
import { getDomainOwnerByDomain, markDomainAsVerified } from '@/lib/db/domains';
import { sendDomainVerificationNotification } from '@/lib/email-management/email-notifications';

const AWS_REGION = process.env.AWS_REGION || 'us-east-2';
const MAX_RESOURCES_PER_MESSAGE = 50;

let sesClient: SESClient | null = null;
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  sesClient = new SESClient({
    region: AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

function getAllowedHealthTopicArns(): string[] {
  return (process.env.AWS_HEALTH_SNS_TOPIC_ARNS || '')
    .split(',')
    .map((arn) => arn.trim())
    .filter((arn) => arn.length > 0);
}

function forbidden() {
  return NextResponse.json(
    { status: 'error', message: 'Invalid SNS notification' },
    { status: 403 }
  );
}

async function isSesIdentityVerified(identity: string): Promise<boolean> {
  if (!sesClient) {
    console.error('❌ handleDomainVerificationEvent - AWS SES not configured; cannot confirm identity status');
    return false;
  }

  try {
    const response = await sesClient.send(
      new GetIdentityVerificationAttributesCommand({ Identities: [identity] })
    );
    return response.VerificationAttributes?.[identity]?.VerificationStatus === 'Success';
  } catch (error) {
    console.error(`❌ handleDomainVerificationEvent - SES lookup failed for ${identity}:`, error);
    return false;
  }
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
    const allowedTopicArns = getAllowedHealthTopicArns();
    if (allowedTopicArns.length === 0) {
      console.error('AWS_HEALTH_SNS_TOPIC_ARNS is not configured; rejecting health notification');
      return forbidden();
    }

    let body: SnsNotification;
    try {
      body = await request.json() as SnsNotification;
    } catch {
      return forbidden();
    }

    if (!body || typeof body !== 'object' || typeof body.TopicArn !== 'string' || !allowedTopicArns.includes(body.TopicArn)) {
      return forbidden();
    }

    const topicRegion = body.TopicArn.split(':')[3] || AWS_REGION;
    const topicAccountId = body.TopicArn.split(':')[4] || '';

    const verified = await verifySnsNotification(body, {
      region: topicRegion,
      accountId: topicAccountId,
      allowedTopicArns,
    });
    if (!verified) {
      return forbidden();
    }

    // Parse the SNS notification
    const parsedNotification = parseSNSNotification(body);
    
    if (parsedNotification.messageType === 'SubscriptionConfirmation') {
      console.log('SubscriptionConfirmation received for topic:', parsedNotification.topicArn);

      if (!body.SubscribeURL || !isTrustedSnsUrl(body.SubscribeURL, topicRegion)) {
        return NextResponse.json(
          { status: 'error', message: 'Invalid SubscribeURL' },
          { status: 400 }
        );
      }

      const confirmResponse = await fetch(body.SubscribeURL);
      if (!confirmResponse.ok) {
        console.error('Failed to confirm health SNS subscription:', confirmResponse.status);
        return NextResponse.json(
          { status: 'error', message: 'Failed to confirm subscription' },
          { status: 500 }
        );
      }

      return NextResponse.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        message: 'Subscription confirmed'
      });
    }

    if (parsedNotification.messageType !== 'Notification') {
      return NextResponse.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        message: 'Message acknowledged'
      });
    }
    
    // Log the parsed notification
    console.log('=== AWS SNS Health Notification ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('SNS Message Type:', parsedNotification.messageType);
    console.log('Topic ARN:', parsedNotification.topicArn);
    
    if (parsedNotification.healthEvent?.detail) {
      console.log('--- AWS Health Event Details ---');
      console.log('Service:', parsedNotification.healthEvent.detail.service);
      console.log('Event Type:', parsedNotification.healthEvent.detail.eventTypeCode);
      console.log('Status:', parsedNotification.healthEvent.detail.statusCode);
      console.log('Region:', parsedNotification.healthEvent.detail.eventRegion);
      console.log('Affected Resources:', parsedNotification.healthEvent.resources);
      console.log('Description:', parsedNotification.healthEvent.detail.eventDescription?.[0]?.latestDescription);
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

function parseSNSNotification(snsData: SnsNotification) {
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
    const resources = Array.isArray(healthEvent.resources) ? healthEvent.resources : [];
    const affectedDomains = resources
      .filter((resource): resource is string => typeof resource === 'string' && resource.length > 0 && resource.length <= 253)
      .slice(0, MAX_RESOURCES_PER_MESSAGE);

    if (resources.length > MAX_RESOURCES_PER_MESSAGE) {
      console.warn(`⚠️ handleDomainVerificationEvent - Truncated ${resources.length} resources to ${MAX_RESOURCES_PER_MESSAGE}`);
    }
    
    if (affectedDomains.length === 0) {
      console.log('⚠️ handleDomainVerificationEvent - No affected domains found in health event');
      return;
    }

    // Process each affected domain
    for (const domain of affectedDomains) {
      console.log(`🔍 handleDomainVerificationEvent - Processing domain verification: ${domain}`);

      try {
        if (!(await isSesIdentityVerified(domain))) {
          console.log(`⏭️ handleDomainVerificationEvent - SES identity not verified, skipping: ${domain}`);
          continue;
        }

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