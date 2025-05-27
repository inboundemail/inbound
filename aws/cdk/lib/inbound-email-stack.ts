import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sesActions from 'aws-cdk-lib/aws-ses-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export class InboundEmailStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get environment variables for configuration
    const serviceApiUrl = process.env.SERVICE_API_URL || 'https://inbound.exon.dev';
    const serviceApiKey = process.env.SERVICE_API_KEY || '';
    const emailDomains = process.env.EMAIL_DOMAINS?.split(',') || ['exon.dev'];

    // S3 bucket for email storage
    const emailBucket = new s3.Bucket(this, 'EmailBucket', {
      bucketName: `inbound-emails-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [{
        id: 'DeleteOldEmails',
        expiration: cdk.Duration.days(90),
      }],
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // Dead Letter Queue for failed Lambda invocations
    const dlq = new sqs.Queue(this, 'EmailProcessorDLQ', {
      queueName: 'inbound-email-processor-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    // Lambda function for email processing
    const emailProcessor = new lambda.Function(this, 'EmailProcessor', {
      functionName: 'inbound-email-processor',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambda/email-processor/dist'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        SERVICE_API_URL: serviceApiUrl,
        SERVICE_API_KEY: serviceApiKey,
        MAX_ATTACHMENT_SIZE: '10485760',
        ENABLE_SPAM_FILTER: 'true',
        ENABLE_VIRUS_FILTER: 'true',
      },
      deadLetterQueue: dlq,
      retryAttempts: 2,
    });

    // Grant S3 read permissions to Lambda
    emailBucket.grantRead(emailProcessor);

    // Grant SES bounce permissions
    emailProcessor.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendBounce'],
      resources: ['*'],
    }));

    // SES receipt rule set
    const ruleSet = new ses.ReceiptRuleSet(this, 'EmailRuleSet', {
      receiptRuleSetName: 'inbound-email-rules',
    });

    // Catch-all rule for your domains
    new ses.ReceiptRule(this, 'CatchAllRule', {
      ruleSet,
      recipients: emailDomains,
      actions: [
        new sesActions.S3({
          bucket: emailBucket,
          objectKeyPrefix: 'emails/',
        }),
        new sesActions.Lambda({
          function: emailProcessor,
          invocationType: sesActions.LambdaInvocationType.EVENT,
        }),
      ],
      scanEnabled: true,
    });

    // CloudWatch Alarms
    new cloudwatch.Alarm(this, 'EmailProcessorErrors', {
      alarmName: 'InboundEmailProcessor-Errors',
      metric: emailProcessor.metricErrors(),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Alert when email processor has more than 5 errors',
    });

    new cloudwatch.Alarm(this, 'EmailProcessorDuration', {
      alarmName: 'InboundEmailProcessor-Duration',
      metric: emailProcessor.metricDuration(),
      threshold: 30000, // 30 seconds
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Alert when email processor takes more than 30 seconds',
    });

    // Outputs
    new cdk.CfnOutput(this, 'EmailBucketName', {
      value: emailBucket.bucketName,
      description: 'S3 bucket for storing emails',
      exportName: 'InboundEmailBucketName',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: emailProcessor.functionName,
      description: 'Lambda function for processing emails',
      exportName: 'InboundEmailProcessorName',
    });

    new cdk.CfnOutput(this, 'RuleSetName', {
      value: ruleSet.receiptRuleSetName,
      description: 'SES receipt rule set name',
      exportName: 'InboundEmailRuleSetName',
    });

    new cdk.CfnOutput(this, 'DLQName', {
      value: dlq.queueName,
      description: 'Dead letter queue for failed email processing',
      exportName: 'InboundEmailDLQName',
    });
  }
} 