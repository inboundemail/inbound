"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InboundEmailStack = void 0;
const cdk = require("aws-cdk-lib");
const lambda = require("aws-cdk-lib/aws-lambda");
const s3 = require("aws-cdk-lib/aws-s3");
const ses = require("aws-cdk-lib/aws-ses");
const sesActions = require("aws-cdk-lib/aws-ses-actions");
const iam = require("aws-cdk-lib/aws-iam");
const sqs = require("aws-cdk-lib/aws-sqs");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
class InboundEmailStack extends cdk.Stack {
    constructor(scope, id, props) {
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
            code: lambda.Code.fromAsset('../../lambda/email-processor', {
                bundling: {
                    image: lambda.Runtime.NODEJS_18_X.bundlingImage,
                    command: [
                        'bash', '-c', [
                            'cp -r /asset-input/* /asset-output/',
                            'cd /asset-output',
                            'npm install --production',
                            'cp -r ../../lib .',
                        ].join(' && ')
                    ],
                },
            }),
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
            threshold: 30000,
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
exports.InboundEmailStack = InboundEmailStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5ib3VuZC1lbWFpbC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImluYm91bmQtZW1haWwtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBQ25DLGlEQUFpRDtBQUNqRCx5Q0FBeUM7QUFDekMsMkNBQTJDO0FBQzNDLDBEQUEwRDtBQUMxRCwyQ0FBMkM7QUFDM0MsMkNBQTJDO0FBQzNDLHlEQUF5RDtBQUd6RCxNQUFhLGlCQUFrQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzlDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsOENBQThDO1FBQzlDLE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxJQUFJLDBCQUEwQixDQUFDO1FBQ2hGLE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxJQUFJLEVBQUUsQ0FBQztRQUN4RCxNQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUUzRSw4QkFBOEI7UUFDOUIsTUFBTSxXQUFXLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDckQsVUFBVSxFQUFFLGtCQUFrQixJQUFJLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDM0QsVUFBVSxFQUFFLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVO1lBQzFDLGNBQWMsRUFBRSxDQUFDO29CQUNmLEVBQUUsRUFBRSxpQkFBaUI7b0JBQ3JCLFVBQVUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7aUJBQ2xDLENBQUM7WUFDRixnQkFBZ0IsRUFB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Q0FBQztJQUNMLENBQUM7Q0FDRjtBQXJJRCw4Q0FxSUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIHNlcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc2VzJztcbmltcG9ydCAqIGFzIHNlc0FjdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNlcy1hY3Rpb25zJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2ggZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmV4cG9ydCBjbGFzcyBJbmJvdW5kRW1haWxTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIEdldCBlbnZpcm9ubWVudCB2YXJpYWJsZXMgZm9yIGNvbmZpZ3VyYXRpb25cbiAgICBjb25zdCBzZXJ2aWNlQXBpVXJsID0gcHJvY2Vzcy5lbnYuU0VSVklDRV9BUElfVVJMIHx8ICdodHRwczovL2luYm91bmQuZXhvbi5kZXYnO1xuICAgIGNvbnN0IHNlcnZpY2VBcGlLZXkgPSBwcm9jZXNzLmVudi5TRVJWSUNFX0FQSV9LRVkgfHwgJyc7XG4gICAgY29uc3QgZW1haWxEb21haW5zID0gcHJvY2Vzcy5lbnYuRU1BSUxfRE9NQUlOUz8uc3BsaXQoJywnKSB8fCBbJ2V4b24uZGV2J107XG5cbiAgICAvLyBTMyBidWNrZXQgZm9yIGVtYWlsIHN0b3JhZ2VcbiAgICBjb25zdCBlbWFpbEJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0VtYWlsQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYGluYm91bmQtZW1haWxzLSR7dGhpcy5hY2NvdW50fS0ke3RoaXMucmVnaW9ufWAsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBsaWZlY3ljbGVSdWxlczogW3tcbiAgICAgICAgaWQ6ICdEZWxldGVPbGRFbWFpbHMnLFxuICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyg5MCksXG4gICAgICB9XSxcbiAgICAgIHB1YmxpY1JlYWRBY2Nlc3M6IGZhbHNlLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICB9KTtcblxuICAgIC8vIERlYWQgTGV0dGVyIFF1ZXVlIGZvciBmYWlsZWQgTGFtYmRhIGludm9jYXRpb25zXG4gICAgY29uc3QgZGxxID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnRW1haWxQcm9jZXNzb3JETFEnLCB7XG4gICAgICBxdWV1ZU5hbWU6ICdpbmJvdW5kLWVtYWlsLXByb2Nlc3Nvci1kbHEnLFxuICAgICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cygxNCksXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIGVtYWlsIHByb2Nlc3NpbmdcbiAgICBjb25zdCBlbWFpbFByb2Nlc3NvciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0VtYWlsUHJvY2Vzc29yJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiAnaW5ib3VuZC1lbWFpbC1wcm9jZXNzb3InLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uLy4uL2xhbWJkYS9lbWFpbC1wcm9jZXNzb3InLCB7XG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgaW1hZ2U6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLmJ1bmRsaW5nSW1hZ2UsXG4gICAgICAgICAgY29tbWFuZDogW1xuICAgICAgICAgICAgJ2Jhc2gnLCAnLWMnLCBbXG4gICAgICAgICAgICAgICdjcCAtciAvYXNzZXQtaW5wdXQvKiAvYXNzZXQtb3V0cHV0LycsXG4gICAgICAgICAgICAgICdjZCAvYXNzZXQtb3V0cHV0JyxcbiAgICAgICAgICAgICAgJ25wbSBpbnN0YWxsIC0tcHJvZHVjdGlvbicsXG4gICAgICAgICAgICAgICdjcCAtciAuLi8uLi9saWIgLicsXG4gICAgICAgICAgICBdLmpvaW4oJyAmJiAnKVxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgU0VSVklDRV9BUElfVVJMOiBzZXJ2aWNlQXBpVXJsLFxuICAgICAgICBTRVJWSUNFX0FQSV9LRVk6IHNlcnZpY2VBcGlLZXksXG4gICAgICAgIE1BWF9BVFRBQ0hNRU5UX1NJWkU6ICcxMDQ4NTc2MCcsXG4gICAgICAgIEVOQUJMRV9TUEFNX0ZJTFRFUjogJ3RydWUnLFxuICAgICAgICBFTkFCTEVfVklSVVNfRklMVEVSOiAndHJ1ZScsXG4gICAgICB9LFxuICAgICAgZGVhZExldHRlclF1ZXVlOiBkbHEsXG4gICAgICByZXRyeUF0dGVtcHRzOiAyLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgUzMgcmVhZCBwZXJtaXNzaW9ucyB0byBMYW1iZGFcbiAgICBlbWFpbEJ1Y2tldC5ncmFudFJlYWQoZW1haWxQcm9jZXNzb3IpO1xuXG4gICAgLy8gR3JhbnQgU0VTIGJvdW5jZSBwZXJtaXNzaW9uc1xuICAgIGVtYWlsUHJvY2Vzc29yLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ3NlczpTZW5kQm91bmNlJ10sXG4gICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgIH0pKTtcblxuICAgIC8vIFNFUyByZWNlaXB0IHJ1bGUgc2V0XG4gICAgY29uc3QgcnVsZVNldCA9IG5ldyBzZXMuUmVjZWlwdFJ1bGVTZXQodGhpcywgJ0VtYWlsUnVsZVNldCcsIHtcbiAgICAgIHJlY2VpcHRSdWxlU2V0TmFtZTogJ2luYm91bmQtZW1haWwtcnVsZXMnLFxuICAgIH0pO1xuXG4gICAgLy8gQ2F0Y2gtYWxsIHJ1bGUgZm9yIHlvdXIgZG9tYWluc1xuICAgIG5ldyBzZXMuUmVjZWlwdFJ1bGUodGhpcywgJ0NhdGNoQWxsUnVsZScsIHtcbiAgICAgIHJ1bGVTZXQsXG4gICAgICByZWNpcGllbnRzOiBlbWFpbERvbWFpbnMsXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgIG5ldyBzZXNBY3Rpb25zLlMzKHtcbiAgICAgICAgICBidWNrZXQ6IGVtYWlsQnVja2V0LFxuICAgICAgICAgIG9iamVjdEtleVByZWZpeDogJ2VtYWlscy8nLFxuICAgICAgICB9KSxcbiAgICAgICAgbmV3IHNlc0FjdGlvbnMuTGFtYmRhKHtcbiAgICAgICAgICBmdW5jdGlvbjogZW1haWxQcm9jZXNzb3IsXG4gICAgICAgICAgaW52b2NhdGlvblR5cGU6IHNlc0FjdGlvbnMuTGFtYmRhSW52b2NhdGlvblR5cGUuRVZFTlQsXG4gICAgICAgIH0pLFxuICAgICAgXSxcbiAgICAgIHNjYW5FbmFibGVkOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBBbGFybXNcbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnRW1haWxQcm9jZXNzb3JFcnJvcnMnLCB7XG4gICAgICBhbGFybU5hbWU6ICdJbmJvdW5kRW1haWxQcm9jZXNzb3ItRXJyb3JzJyxcbiAgICAgIG1ldHJpYzogZW1haWxQcm9jZXNzb3IubWV0cmljRXJyb3JzKCksXG4gICAgICB0aHJlc2hvbGQ6IDUsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMixcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0IHdoZW4gZW1haWwgcHJvY2Vzc29yIGhhcyBtb3JlIHRoYW4gNSBlcnJvcnMnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ0VtYWlsUHJvY2Vzc29yRHVyYXRpb24nLCB7XG4gICAgICBhbGFybU5hbWU6ICdJbmJvdW5kRW1haWxQcm9jZXNzb3ItRHVyYXRpb24nLFxuICAgICAgbWV0cmljOiBlbWFpbFByb2Nlc3Nvci5tZXRyaWNEdXJhdGlvbigpLFxuICAgICAgdGhyZXNob2xkOiAzMDAwMCwgLy8gMzAgc2Vjb25kc1xuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDMsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdBbGVydCB3aGVuIGVtYWlsIHByb2Nlc3NvciB0YWtlcyBtb3JlIHRoYW4gMzAgc2Vjb25kcycsXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0VtYWlsQnVja2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiBlbWFpbEJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdTMyBidWNrZXQgZm9yIHN0b3JpbmcgZW1haWxzJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdJbmJvdW5kRW1haWxCdWNrZXROYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdMYW1iZGFGdW5jdGlvbk5hbWUnLCB7XG4gICAgICB2YWx1ZTogZW1haWxQcm9jZXNzb3IuZnVuY3Rpb25OYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdMYW1iZGEgZnVuY3Rpb24gZm9yIHByb2Nlc3NpbmcgZW1haWxzJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdJbmJvdW5kRW1haWxQcm9jZXNzb3JOYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdSdWxlU2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiBydWxlU2V0LnJlY2VpcHRSdWxlU2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU0VTIHJlY2VpcHQgcnVsZSBzZXQgbmFtZScsXG4gICAgICBleHBvcnROYW1lOiAnSW5ib3VuZEVtYWlsUnVsZVNldE5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RMUU5hbWUnLCB7XG4gICAgICB2YWx1ZTogZGxxLnF1ZXVlTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRGVhZCBsZXR0ZXIgcXVldWUgZm9yIGZhaWxlZCBlbWFpbCBwcm9jZXNzaW5nJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdJbmJvdW5kRW1haWxETFFOYW1lJyxcbiAgICB9KTtcbiAgfVxufSAiXX0=