#!/usr/bin/env bun

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface DeploymentConfig {
  serviceApiUrl: string;
  serviceApiKey: string;
  emailDomains: string[];
  awsRegion: string;
  awsProfile?: string;
}

class EmailSystemDeployer {
  private config: DeploymentConfig;
  private projectRoot: string;

  constructor(config: DeploymentConfig) {
    this.config = config;
    this.projectRoot = process.cwd();
  }

  async deploy() {
    console.log('🚀 Starting Email System Deployment...\n');

    try {
      // Step 1: Validate prerequisites
      await this.validatePrerequisites();

      // Step 2: Build Lambda function
      await this.buildLambdaFunction();

      // Step 3: Deploy CDK stack
      await this.deployCDKStack();

      // Step 4: Verify deployment
      await this.verifyDeployment();

      // Step 5: Test email receiving (optional)
    //   await this.testEmailReceiving();

      console.log('\n✅ Email System Deployment Complete!');
      console.log('\n📋 Next Steps:');
      console.log('1. Configure your domain\'s MX records to point to AWS SES');
      console.log('2. Verify your domain in AWS SES console');
      console.log('3. Monitor CloudWatch logs for any issues');

    } catch (error) {
      console.error('\n❌ Deployment failed:', error);
      process.exit(1);
    }
  }

  private async validatePrerequisites() {
    console.log('🔍 Validating prerequisites...');

    // Check if AWS CLI is configured
    try {
      const awsProfile = this.config.awsProfile ? `--profile ${this.config.awsProfile}` : '';
      execSync(`aws sts get-caller-identity ${awsProfile}`, { stdio: 'pipe' });
      console.log('✅ AWS CLI configured');
    } catch (error) {
      throw new Error('AWS CLI not configured. Run `aws configure` first.');
    }

    // Check if CDK is bootstrapped
    try {
      const awsProfile = this.config.awsProfile ? `--profile ${this.config.awsProfile}` : '';
      execSync(`cd aws/cdk && bun run cdk bootstrap ${awsProfile}`, { stdio: 'pipe' });
      console.log('✅ CDK bootstrapped');
    } catch (error) {
      console.log('⚠️  CDK bootstrap may be needed');
    }

    // Check required environment variables
    if (!this.config.serviceApiUrl) {
      throw new Error('SERVICE_API_URL is required');
    }

    if (!this.config.serviceApiKey) {
      console.log('⚠️  SERVICE_API_KEY not provided - webhooks may not work');
    }

    console.log('✅ Prerequisites validated\n');
  }

  private async buildLambdaFunction() {
    console.log('🔨 Building Lambda function...');

    const lambdaDir = join(this.projectRoot, 'lambda/email-processor');

    // Install dependencies
    console.log('📦 Installing Lambda dependencies...');
    execSync('bun install', { cwd: lambdaDir, stdio: 'inherit' });

    // Build TypeScript
    console.log('🔧 Building TypeScript...');
    execSync('bun run build', { cwd: lambdaDir, stdio: 'inherit' });

    console.log('✅ Lambda function built\n');
  }

  private async deployCDKStack() {
    console.log('☁️  Deploying CDK stack...');

    const cdkDir = join(this.projectRoot, 'aws/cdk');

    // Install CDK dependencies
    console.log('📦 Installing CDK dependencies...');
    execSync('bun install', { cwd: cdkDir, stdio: 'inherit' });

    // Build CDK
    console.log('🔧 Building CDK stack...');
    execSync('bun run build', { cwd: cdkDir, stdio: 'inherit' });

    // Deploy with environment variables
    const envVars = [
      `SERVICE_API_URL=${this.config.serviceApiUrl}`,
      `SERVICE_API_KEY=${this.config.serviceApiKey}`,
      `EMAIL_DOMAINS=${this.config.emailDomains.join(',')}`,
      `AWS_REGION=${this.config.awsRegion}`,
    ].join(' ');

    const awsProfile = this.config.awsProfile ? `--profile ${this.config.awsProfile}` : '';

    console.log('🚀 Deploying to AWS...');
    execSync(`${envVars} bun run cdk deploy --require-approval never ${awsProfile}`, {
      cwd: cdkDir,
      stdio: 'inherit'
    });

    console.log('✅ CDK stack deployed\n');
  }

  private async verifyDeployment() {
    console.log('🔍 Verifying deployment...');

    try {
      // Get stack outputs
      const awsProfile = this.config.awsProfile ? `--profile ${this.config.awsProfile}` : '';
      const stackInfo = execSync(
        `aws cloudformation describe-stacks --stack-name InboundEmailStack --region ${this.config.awsRegion} ${awsProfile}`,
        { encoding: 'utf8' }
      );

      const stack = JSON.parse(stackInfo);
      const outputs = stack.Stacks[0]?.Outputs || [];

      console.log('📊 Stack Outputs:');
      outputs.forEach((output: any) => {
        console.log(`  ${output.OutputKey}: ${output.OutputValue}`);
      });

      // Test Lambda function
      const lambdaName = outputs.find((o: any) => o.OutputKey === 'LambdaFunctionName')?.OutputValue;
      if (lambdaName) {
        console.log('\n🧪 Testing Lambda function...');
        const testEvent = {
          Records: [{
            eventSource: 'aws:ses',
            ses: {
              mail: {
                messageId: 'test-message-id',
                source: 'test@example.com',
                destination: this.config.emailDomains.map(domain => `test@${domain}`)
              }
            }
          }]
        };

        try {
          execSync(
            `aws lambda invoke --function-name ${lambdaName} --payload '${JSON.stringify(testEvent)}' --region ${this.config.awsRegion} ${awsProfile} /tmp/lambda-response.json`,
            { stdio: 'pipe' }
          );
          console.log('✅ Lambda function test successful');
        } catch (error) {
          console.log('⚠️  Lambda function test failed - check CloudWatch logs');
        }
      }

      console.log('✅ Deployment verified\n');
    } catch (error) {
      console.log('⚠️  Could not verify deployment:', error);
    }
  }

//   private async testEmailReceiving() {
//     console.log('📧 Email receiving test information...');

//     console.log('\n📋 To test email receiving:');
//     console.log('1. Ensure your domain MX records point to:');
//     console.log(`   10 inbound-smtp.${this.config.awsRegion}.amazonaws.com`);
    
//     console.log('\n2. Verify your domain in AWS SES:');
//     console.log(`   aws ses verify-domain-identity --domain ${this.config.emailDomains[0]} --region ${this.config.awsRegion}`);
    
//     console.log('\n3. Send a test email to:');
//     this.config.emailDomains.forEach(domain => {
//       console.log(`   test@${domain}`);
//     });

//     console.log('\n4. Monitor CloudWatch logs:');
//     console.log('   - Lambda function: /aws/lambda/inbound-email-processor');
//     console.log('   - SES events in CloudWatch metrics');

//     console.log('\n5. Check your API webhook endpoint for notifications');
//   }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Email System Deployment Script

Usage:
  bun run scripts/deploy-email-system.ts [options]

Options:
  --service-api-url <url>     Your service API URL (required)
  --service-api-key <key>     Your service API key
  --email-domains <domains>   Comma-separated list of domains (default: exon.dev)
  --aws-region <region>       AWS region (default: us-east-2)
  --aws-profile <profile>     AWS profile to use
  --help, -h                  Show this help message

Environment Variables:
  SERVICE_API_URL             Your service API URL
  SERVICE_API_KEY             Your service API key
  EMAIL_DOMAINS               Comma-separated list of domains
  AWS_REGION                  AWS region
  AWS_PROFILE                 AWS profile

Examples:
  bun run scripts/deploy-email-system.ts --service-api-url https://inbound.exon.dev --email-domains exon.dev,example.com
  SERVICE_API_URL=https://inbound.exon.dev bun run scripts/deploy-email-system.ts
`);
    process.exit(0);
  }

  // Parse command line arguments
  const config: DeploymentConfig = {
    serviceApiUrl: getArg('--service-api-url') || process.env.SERVICE_API_URL || '',
    serviceApiKey: getArg('--service-api-key') || process.env.SERVICE_API_KEY || '',
    emailDomains: (getArg('--email-domains') || process.env.EMAIL_DOMAINS || 'exon.dev').split(','),
    awsRegion: getArg('--aws-region') || process.env.AWS_REGION || 'us-east-2',
    awsProfile: getArg('--aws-profile') || process.env.AWS_PROFILE,
  };

  function getArg(name: string): string | undefined {
    const index = args.indexOf(name);
    return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
  }

  if (!config.serviceApiUrl) {
    console.error('❌ SERVICE_API_URL is required. Use --service-api-url or set SERVICE_API_URL environment variable.');
    process.exit(1);
  }

  console.log('🔧 Deployment Configuration:');
  console.log(`  Service API URL: ${config.serviceApiUrl}`);
  console.log(`  Service API Key: ${config.serviceApiKey ? '***' : 'Not provided'}`);
  console.log(`  Email Domains: ${config.emailDomains.join(', ')}`);
  console.log(`  AWS Region: ${config.awsRegion}`);
  console.log(`  AWS Profile: ${config.awsProfile || 'default'}`);
  console.log('');

  const deployer = new EmailSystemDeployer(config);
  await deployer.deploy();
}

// Run main function if this script is executed directly
main().catch(console.error); 