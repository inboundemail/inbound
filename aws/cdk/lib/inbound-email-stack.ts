import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import * as path from 'path';

export class InboundEmailStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get environment variables for configuration
    const serviceApiUrl = process.env.SERVICE_API_URL || 'https://inbound.exon.dev';
    const serviceApiKey = process.env.SERVICE_API_KEY || '';
    const importExisting = process.env.IMPORT_EXISTING_RESOURCES === 'true';
    
    // Consistent resource names
    const bucketName = `inbound-emails-${this.account}-${this.region}`;
    const ruleSetName = 'inbound-email-rules';
    const lambdaFunctionName = 'inbound-email-processor';
    const dlqName = 'inbound-email-processor-dlq';

    // Reference existing S3 bucket for email storage (don't create new one)
    const emailBucket = s3.Bucket.fromBucketName(this, 'EmailBucket', bucketName);

    // Note: Bucket policy for SES permissions has been manually applied
    // Cannot add resource policy to existing bucket referenced by name
    // Grant SES permission to write to S3 bucket
    // emailBucket.addToResourcePolicy(new iam.PolicyStatement({
    //   sid: 'AllowSESPuts',
    //   effect: iam.Effect.ALLOW,
    //   principals: [new iam.ServicePrincipal('ses.amazonaws.com')],
    //   actions: ['s3:PutObject'],
    //   resources: [`${emailBucket.bucketArn}/*`],
    //   conditions: {
    //     StringEquals: {
    //       'aws:Referer': this.account,
    //     },
    //   },
    // }));

    // Create Dead Letter Queue for failed Lambda invocations
    const dlq = new sqs.Queue(this, 'EmailProcessorDLQ', {
      queueName: dlqName,
      retentionPeriod: cdk.Duration.days(14),
      visibilityTimeout: cdk.Duration.minutes(5),
    });

    // Create Lambda function for email processing
    const emailProcessor = new lambda.Function(this, 'EmailProcessor', {
      functionName: lambdaFunctionName,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'email-processor.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda')),
      timeout: cdk.Duration.minutes(2),
      memorySize: 256,
      environment: {
        SERVICE_API_URL: serviceApiUrl,
        SERVICE_API_KEY: serviceApiKey,
        S3_BUCKET_NAME: bucketName,
      },
      deadLetterQueue: dlq,
      retryAttempts: 2,
    });

    // Grant S3 read permissions to Lambda
    emailBucket.grantRead(emailProcessor);

    // Grant SES permission to invoke Lambda
    emailProcessor.addPermission('AllowSESInvoke', {
      principal: new iam.ServicePrincipal('ses.amazonaws.com'),
      sourceAccount: this.account,
    });

    // Grant SES bounce permissions
    emailProcessor.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendBounce', 'ses:SendEmail'],
      resources: ['*'],
    }));

    // Grant CloudWatch Logs permissions
    emailProcessor.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [`arn:aws:logs:${this.region}:${this.account}:*`],
    }));

    // Create SES Receipt Rule Set
    const receiptRuleSet = new ses.ReceiptRuleSet(this, 'ReceiptRuleSet', {
      receiptRuleSetName: ruleSetName,
    });

    // CloudWatch Alarms for monitoring
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

    new cloudwatch.Alarm(this, 'EmailProcessorThrottles', {
      alarmName: 'InboundEmailProcessor-Throttles',
      metric: emailProcessor.metricThrottles(),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Alert when email processor is throttled',
    });

    // Outputs for application configuration
    new cdk.CfnOutput(this, 'EmailBucketName', {
      value: bucketName,
      description: 'S3 bucket for storing emails',
      exportName: 'InboundEmailBucketName',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: emailProcessor.functionName,
      description: 'Lambda function for processing emails',
      exportName: 'InboundEmailProcessorName',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionArn', {
      value: emailProcessor.functionArn,
      description: 'Lambda function ARN',
      exportName: 'InboundEmailProcessorArn',
    });

    new cdk.CfnOutput(this, 'RuleSetName', {
      value: ruleSetName,
      description: 'SES receipt rule set name',
      exportName: 'InboundEmailRuleSetName',
    });

    new cdk.CfnOutput(this, 'DLQName', {
      value: dlq.queueName,
      description: 'Dead letter queue for failed email processing',
      exportName: 'InboundEmailDLQName',
    });

    new cdk.CfnOutput(this, 'AWSAccountId', {
      value: this.account,
      description: 'AWS Account ID',
      exportName: 'InboundEmailAWSAccountId',
    });

    new cdk.CfnOutput(this, 'AWSRegion', {
      value: this.region,
      description: 'AWS Region',
      exportName: 'InboundEmailAWSRegion',
    });

    // Environment variables for .env file
    new cdk.CfnOutput(this, 'EnvironmentVariables', {
      value: [
        '# Add these to your .env file:',
        `S3_BUCKET_NAME=${bucketName}`,
        `AWS_ACCOUNT_ID=${this.account}`,
        `LAMBDA_FUNCTION_NAME=${emailProcessor.functionName}`,
        `LAMBDA_FUNCTION_ARN=${emailProcessor.functionArn}`,
        `AWS_REGION=${this.region}`,
        `SES_RULE_SET_NAME=${ruleSetName}`,
        '# Make sure you also have:',
        '# AWS_ACCESS_KEY_ID=your_access_key',
        '# AWS_SECRET_ACCESS_KEY=your_secret_key',
        '# SERVICE_API_KEY=your_service_api_key'
      ].join('\n'),
      description: 'Environment variables for your application',
    });

    // Deployment status output
    new cdk.CfnOutput(this, 'DeploymentStatus', {
      value: 'SUCCESS',
      description: 'Deployment completed successfully',
    });

    new cdk.CfnOutput(this, 'NextSteps', {
      value: [
        '1. Copy environment variables to your .env file',
        '2. Configure domains using /api/inbound/configure-email',
        '3. Set up MX records for your domains',
        '4. Test email receiving functionality'
      ].join(' | '),
      description: 'Next steps after deployment',
    });
  }
} 