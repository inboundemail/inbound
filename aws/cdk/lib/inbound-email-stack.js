"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InboundEmailStack = void 0;
const cdk = require("aws-cdk-lib");
const lambda = require("aws-cdk-lib/aws-lambda");
const s3 = require("aws-cdk-lib/aws-s3");
const iam = require("aws-cdk-lib/aws-iam");
const sqs = require("aws-cdk-lib/aws-sqs");
const ses = require("aws-cdk-lib/aws-ses");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const path = require("path");
class InboundEmailStack extends cdk.Stack {
    constructor(scope, id, props) {
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
        // Grant SES permission to write to S3 bucket
        emailBucket.addToResourcePolicy(new iam.PolicyStatement({
            sid: 'AllowSESPuts',
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal('ses.amazonaws.com')],
            actions: ['s3:PutObject'],
            resources: [`${emailBucket.bucketArn}/*`],
            conditions: {
                StringEquals: {
                    'aws:Referer': this.account,
                },
            },
        }));
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
            threshold: 30000,
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
exports.InboundEmailStack = InboundEmailStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5ib3VuZC1lbWFpbC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImluYm91bmQtZW1haWwtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBQ25DLGlEQUFpRDtBQUNqRCx5Q0FBeUM7QUFDekMsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUMzQywyQ0FBMkM7QUFDM0MseURBQXlEO0FBRXpELDZCQUE2QjtBQUU3QixNQUFhLGlCQUFrQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzlDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsOENBQThDO1FBQzlDLE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxJQUFJLDBCQUEwQixDQUFDO1FBQ2hGLE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxJQUFJLEVBQUUsQ0FBQztRQUN4RCxNQUFNLGNBQWMsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHlCQUF5QixLQUFLLE1BQU0sQ0FBQztRQUV4RSw0QkFBNEI7UUFDNUIsTUFBTSxVQUFVLEdBQUcsa0JBQWtCLElBQUksQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ25FLE1BQU0sV0FBVyxHQUFHLHFCQUFxQixDQUFDO1FBQzFDLE1BQU0sa0JBQWtCLEdBQUcseUJBQXlCLENBQUM7UUFDckQsTUFBTSxPQUFPLEdBQUcsNkJBQTZCLENBQUM7UUFFOUMsd0VBQXdFO1FBQ3hFLE1BQU0sV0FBVyxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFFOUUsNkNBQTZDO1FBQzdDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxlQUFl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RUFBRTtnQkFDaEMsd0JBQXdCLGNBQWMsQ0FBQyxZQUFZLEVBQUU7Z0JBQ3JELHVCQUF1QixjQUFjLENBQUMsV0FBVyxFQUFFO2dCQUNuRCxjQUFjLElBQUksQ0FBQyxNQUFNLEVBQUU7Z0JBQzNCLHFCQUFxQixXQUFXLEVBQUU7Z0JBQ2xDLDRCQUE0QjtnQkFDNUIscUNBQXFDO2dCQUNyQyx5Q0FBeUM7Z0JBQ3pDLHdDQUF3QzthQUN6QyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7WUFDWixXQUFXLEVBQUUsNENBQTRDO1NBQzFELENBQUMsQ0FBQztRQUVILDJCQUEyQjtRQUMzQixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQzFDLEtBQUssRUFBRSxTQUFTO1lBQ2hCLFdBQVcsRUFBRSxtQ0FBbUM7U0FDakQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUU7WUFDbkMsS0FBSyxFQUFFO2dCQUNMLGlEQUFpRDtnQkFDakQseURBQXlEO2dCQUN6RCx1Q0FBdUM7Z0JBQ3ZDLHVDQUF1QzthQUN4QyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7WUFDYixXQUFXLEVBQUUsNkJBQTZCO1NBQzNDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQS9MRCw4Q0ErTEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcbmltcG9ydCAqIGFzIHNlcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc2VzJztcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2ggZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG5leHBvcnQgY2xhc3MgSW5ib3VuZEVtYWlsU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyBHZXQgZW52aXJvbm1lbnQgdmFyaWFibGVzIGZvciBjb25maWd1cmF0aW9uXG4gICAgY29uc3Qgc2VydmljZUFwaVVybCA9IHByb2Nlc3MuZW52LlNFUlZJQ0VfQVBJX1VSTCB8fCAnaHR0cHM6Ly9pbmJvdW5kLmV4b24uZGV2JztcbiAgICBjb25zdCBzZXJ2aWNlQXBpS2V5ID0gcHJvY2Vzcy5lbnYuU0VSVklDRV9BUElfS0VZIHx8ICcnO1xuICAgIGNvbnN0IGltcG9ydEV4aXN0aW5nID0gcHJvY2Vzcy5lbnYuSU1QT1JUX0VYSVNUSU5HX1JFU09VUkNFUyA9PT0gJ3RydWUnO1xuICAgIFxuICAgIC8vIENvbnNpc3RlbnQgcmVzb3VyY2UgbmFtZXNcbiAgICBjb25zdCBidWNrZXROYW1lID0gYGluYm91bmQtZW1haWxzLSR7dGhpcy5hY2NvdW50fS0ke3RoaXMucmVnaW9ufWA7XG4gICAgY29uc3QgcnVsZVNldE5hbWUgPSAnaW5ib3VuZC1lbWFpbC1ydWxlcyc7XG4gICAgY29uc3QgbGFtYmRhRnVuY3Rpb25OYW1lID0gJ2luYm91bmQtZW1haWwtcHJvY2Vzc29yJztcbiAgICBjb25zdCBkbHFOYW1lID0gJ2luYm91bmQtZW1haWwtcHJvY2Vzc29yLWRscSc7XG5cbiAgICAvLyBSZWZlcmVuY2UgZXhpc3RpbmcgUzMgYnVja2V0IGZvciBlbWFpbCBzdG9yYWdlIChkb24ndCBjcmVhdGUgbmV3IG9uZSlcbiAgICBjb25zdCBlbWFpbEJ1Y2tldCA9IHMzLkJ1Y2tldC5mcm9tQnVja2V0TmFtZSh0aGlzLCAnRW1haWxCdWNrZXQnLCBidWNrZXROYW1lKTtcblxuICAgIC8vIEdyYW50IFNFUyBwZXJtaXNzaW9uIHRvIHdyaXRlIHRvIFMzIGJ1Y2tldFxuICAgIGVtYWlsQnVja2V0LmFkZFRvUmVzb3VyY2VQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgc2lkOiAnQWxsb3dTRVNQdXRzJyxcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIHByaW5jaXBhbHM6IFtuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ3Nlcy5hbWF6b25hd3MuY29tJyldLFxuICAgICAgYWN0aW9uczogWydzMzpQdXRPYmplY3QnXSxcbiAgICAgIHJlc291cmNlczogW2Ake2VtYWlsQnVja2V0LmJ1Y2tldEFybn0vKmBdLFxuICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAnYXdzOlJlZmVyZXInOiB0aGlzLmFjY291bnQsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pKTtcblxuICAgIC8vIENyZWF0ZSBEZWFkIExldHRlciBRdWV1ZSBmb3IgZmFpbGVkIExhbWJkYSBpbnZvY2F0aW9uc1xuICAgIGNvbnN0IGRscSA9IG5ldyBzcXMuUXVldWUodGhpcywgJ0VtYWlsUHJvY2Vzc29yRExRJywge1xuICAgICAgcXVldWVOYW1lOiBkbHFOYW1lLFxuICAgICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cygxNCksXG4gICAgICB2aXNpYmlsaXR5VGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgTGFtYmRhIGZ1bmN0aW9uIGZvciBlbWFpbCBwcm9jZXNzaW5nXG4gICAgY29uc3QgZW1haWxQcm9jZXNzb3IgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdFbWFpbFByb2Nlc3NvcicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogbGFtYmRhRnVuY3Rpb25OYW1lLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnZW1haWwtcHJvY2Vzc29yLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICdsYW1iZGEnKSksXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygyKSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFNFUlZJQ0VfQVBJX1VSTDogc2VydmljZUFwaVVybCxcbiAgICAgICAgU0VSVklDRV9BUElfS0VZOiBzZXJ2aWNlQXBpS2V5LFxuICAgICAgICBTM19CVUNLRVRfTkFNRTogYnVja2V0TmFtZSxcbiAgICAgIH0sXG4gICAgICBkZWFkTGV0dGVyUXVldWU6IGRscSxcbiAgICAgIHJldHJ5QXR0ZW1wdHM6IDIsXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBTMyByZWFkIHBlcm1pc3Npb25zIHRvIExhbWJkYVxuICAgIGVtYWlsQnVja2V0LmdyYW50UmVhZChlbWFpbFByb2Nlc3Nvcik7XG5cbiAgICAvLyBHcmFudCBTRVMgcGVybWlzc2lvbiB0byBpbnZva2UgTGFtYmRhXG4gICAgZW1haWxQcm9jZXNzb3IuYWRkUGVybWlzc2lvbignQWxsb3dTRVNJbnZva2UnLCB7XG4gICAgICBwcmluY2lwYWw6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnc2VzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIHNvdXJjZUFjY291bnQ6IHRoaXMuYWNjb3VudCxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IFNFUyBib3VuY2UgcGVybWlzc2lvbnNcbiAgICBlbWFpbFByb2Nlc3Nvci5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogWydzZXM6U2VuZEJvdW5jZScsICdzZXM6U2VuZEVtYWlsJ10sXG4gICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgIH0pKTtcblxuICAgIC8vIEdyYW50IENsb3VkV2F0Y2ggTG9ncyBwZXJtaXNzaW9uc1xuICAgIGVtYWlsUHJvY2Vzc29yLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdsb2dzOkNyZWF0ZUxvZ0dyb3VwJyxcbiAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nU3RyZWFtJyxcbiAgICAgICAgJ2xvZ3M6UHV0TG9nRXZlbnRzJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmxvZ3M6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OipgXSxcbiAgICB9KSk7XG5cbiAgICAvLyBDcmVhdGUgU0VTIFJlY2VpcHQgUnVsZSBTZXRcbiAgICBjb25zdCByZWNlaXB0UnVsZVNldCA9IG5ldyBzZXMuUmVjZWlwdFJ1bGVTZXQodGhpcywgJ1JlY2VpcHRSdWxlU2V0Jywge1xuICAgICAgcmVjZWlwdFJ1bGVTZXROYW1lOiBydWxlU2V0TmFtZSxcbiAgICB9KTtcblxuICAgIC8vIENsb3VkV2F0Y2ggQWxhcm1zIGZvciBtb25pdG9yaW5nXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ0VtYWlsUHJvY2Vzc29yRXJyb3JzJywge1xuICAgICAgYWxhcm1OYW1lOiAnSW5ib3VuZEVtYWlsUHJvY2Vzc29yLUVycm9ycycsXG4gICAgICBtZXRyaWM6IGVtYWlsUHJvY2Vzc29yLm1ldHJpY0Vycm9ycygpLFxuICAgICAgdGhyZXNob2xkOiA1LFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdBbGVydCB3aGVuIGVtYWlsIHByb2Nlc3NvciBoYXMgbW9yZSB0aGFuIDUgZXJyb3JzJyxcbiAgICB9KTtcblxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdFbWFpbFByb2Nlc3NvckR1cmF0aW9uJywge1xuICAgICAgYWxhcm1OYW1lOiAnSW5ib3VuZEVtYWlsUHJvY2Vzc29yLUR1cmF0aW9uJyxcbiAgICAgIG1ldHJpYzogZW1haWxQcm9jZXNzb3IubWV0cmljRHVyYXRpb24oKSxcbiAgICAgIHRocmVzaG9sZDogMzAwMDAsIC8vIDMwIHNlY29uZHNcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAzLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnQgd2hlbiBlbWFpbCBwcm9jZXNzb3IgdGFrZXMgbW9yZSB0aGFuIDMwIHNlY29uZHMnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ0VtYWlsUHJvY2Vzc29yVGhyb3R0bGVzJywge1xuICAgICAgYWxhcm1OYW1lOiAnSW5ib3VuZEVtYWlsUHJvY2Vzc29yLVRocm90dGxlcycsXG4gICAgICBtZXRyaWM6IGVtYWlsUHJvY2Vzc29yLm1ldHJpY1Rocm90dGxlcygpLFxuICAgICAgdGhyZXNob2xkOiAxLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdBbGVydCB3aGVuIGVtYWlsIHByb2Nlc3NvciBpcyB0aHJvdHRsZWQnLFxuICAgIH0pO1xuXG4gICAgLy8gT3V0cHV0cyBmb3IgYXBwbGljYXRpb24gY29uZmlndXJhdGlvblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFbWFpbEJ1Y2tldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogYnVja2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUzMgYnVja2V0IGZvciBzdG9yaW5nIGVtYWlscycsXG4gICAgICBleHBvcnROYW1lOiAnSW5ib3VuZEVtYWlsQnVja2V0TmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTGFtYmRhRnVuY3Rpb25OYW1lJywge1xuICAgICAgdmFsdWU6IGVtYWlsUHJvY2Vzc29yLmZ1bmN0aW9uTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTGFtYmRhIGZ1bmN0aW9uIGZvciBwcm9jZXNzaW5nIGVtYWlscycsXG4gICAgICBleHBvcnROYW1lOiAnSW5ib3VuZEVtYWlsUHJvY2Vzc29yTmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTGFtYmRhRnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogZW1haWxQcm9jZXNzb3IuZnVuY3Rpb25Bcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0xhbWJkYSBmdW5jdGlvbiBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogJ0luYm91bmRFbWFpbFByb2Nlc3NvckFybicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUnVsZVNldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogcnVsZVNldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NFUyByZWNlaXB0IHJ1bGUgc2V0IG5hbWUnLFxuICAgICAgZXhwb3J0TmFtZTogJ0luYm91bmRFbWFpbFJ1bGVTZXROYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdETFFOYW1lJywge1xuICAgICAgdmFsdWU6IGRscS5xdWV1ZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0RlYWQgbGV0dGVyIHF1ZXVlIGZvciBmYWlsZWQgZW1haWwgcHJvY2Vzc2luZycsXG4gICAgICBleHBvcnROYW1lOiAnSW5ib3VuZEVtYWlsRExRTmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQVdTQWNjb3VudElkJywge1xuICAgICAgdmFsdWU6IHRoaXMuYWNjb3VudCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVdTIEFjY291bnQgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogJ0luYm91bmRFbWFpbEFXU0FjY291bnRJZCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQVdTUmVnaW9uJywge1xuICAgICAgdmFsdWU6IHRoaXMucmVnaW9uLFxuICAgICAgZGVzY3JpcHRpb246ICdBV1MgUmVnaW9uJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdJbmJvdW5kRW1haWxBV1NSZWdpb24nLFxuICAgIH0pO1xuXG4gICAgLy8gRW52aXJvbm1lbnQgdmFyaWFibGVzIGZvciAuZW52IGZpbGVcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRW52aXJvbm1lbnRWYXJpYWJsZXMnLCB7XG4gICAgICB2YWx1ZTogW1xuICAgICAgICAnIyBBZGQgdGhlc2UgdG8geW91ciAuZW52IGZpbGU6JyxcbiAgICAgICAgYFMzX0JVQ0tFVF9OQU1FPSR7YnVja2V0TmFtZX1gLFxuICAgICAgICBgQVdTX0FDQ09VTlRfSUQ9JHt0aGlzLmFjY291bnR9YCxcbiAgICAgICAgYExBTUJEQV9GVU5DVElPTl9OQU1FPSR7ZW1haWxQcm9jZXNzb3IuZnVuY3Rpb25OYW1lfWAsXG4gICAgICAgIGBMQU1CREFfRlVOQ1RJT05fQVJOPSR7ZW1haWxQcm9jZXNzb3IuZnVuY3Rpb25Bcm59YCxcbiAgICAgICAgYEFXU19SRUdJT049JHt0aGlzLnJlZ2lvbn1gLFxuICAgICAgICBgU0VTX1JVTEVfU0VUX05BTUU9JHtydWxlU2V0TmFtZX1gLFxuICAgICAgICAnIyBNYWtlIHN1cmUgeW91IGFsc28gaGF2ZTonLFxuICAgICAgICAnIyBBV1NfQUNDRVNTX0tFWV9JRD15b3VyX2FjY2Vzc19rZXknLFxuICAgICAgICAnIyBBV1NfU0VDUkVUX0FDQ0VTU19LRVk9eW91cl9zZWNyZXRfa2V5JyxcbiAgICAgICAgJyMgU0VSVklDRV9BUElfS0VZPXlvdXJfc2VydmljZV9hcGlfa2V5J1xuICAgICAgXS5qb2luKCdcXG4nKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRW52aXJvbm1lbnQgdmFyaWFibGVzIGZvciB5b3VyIGFwcGxpY2F0aW9uJyxcbiAgICB9KTtcblxuICAgIC8vIERlcGxveW1lbnQgc3RhdHVzIG91dHB1dFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEZXBsb3ltZW50U3RhdHVzJywge1xuICAgICAgdmFsdWU6ICdTVUNDRVNTJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRGVwbG95bWVudCBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdOZXh0U3RlcHMnLCB7XG4gICAgICB2YWx1ZTogW1xuICAgICAgICAnMS4gQ29weSBlbnZpcm9ubWVudCB2YXJpYWJsZXMgdG8geW91ciAuZW52IGZpbGUnLFxuICAgICAgICAnMi4gQ29uZmlndXJlIGRvbWFpbnMgdXNpbmcgL2FwaS9pbmJvdW5kL2NvbmZpZ3VyZS1lbWFpbCcsXG4gICAgICAgICczLiBTZXQgdXAgTVggcmVjb3JkcyBmb3IgeW91ciBkb21haW5zJyxcbiAgICAgICAgJzQuIFRlc3QgZW1haWwgcmVjZWl2aW5nIGZ1bmN0aW9uYWxpdHknXG4gICAgICBdLmpvaW4oJyB8ICcpLFxuICAgICAgZGVzY3JpcHRpb246ICdOZXh0IHN0ZXBzIGFmdGVyIGRlcGxveW1lbnQnLFxuICAgIH0pO1xuICB9XG59ICJdfQ==