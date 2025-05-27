#!/usr/bin/env bun

import { execSync } from 'child_process';

console.log('🚀 Quick Email System Deployment\n');

// Default configuration
const config = {
  serviceApiUrl: process.env.SERVICE_API_URL || 'https://inbound.exon.dev',
  serviceApiKey: process.env.SERVICE_API_KEY || 'test-key',
  emailDomains: process.env.EMAIL_DOMAINS || 'exon.dev',
  awsRegion: process.env.AWS_REGION || 'us-west-2',
};

console.log('📋 Configuration:');
console.log(`  Service API URL: ${config.serviceApiUrl}`);
console.log(`  Email Domains: ${config.emailDomains}`);
console.log(`  AWS Region: ${config.awsRegion}\n`);

try {
  // Step 1: Build Lambda
  console.log('🔨 Building Lambda function...');
  execSync('bun install', { cwd: 'lambda/email-processor', stdio: 'inherit' });
  execSync('bun run build', { cwd: 'lambda/email-processor', stdio: 'inherit' });

  // Step 2: Build and Deploy CDK
  console.log('\n☁️  Deploying CDK stack...');
  execSync('bun install', { cwd: 'aws/cdk', stdio: 'inherit' });
  execSync('bun run build', { cwd: 'aws/cdk', stdio: 'inherit' });

  const envVars = [
    `SERVICE_API_URL=${config.serviceApiUrl}`,
    `SERVICE_API_KEY=${config.serviceApiKey}`,
    `EMAIL_DOMAINS=${config.emailDomains}`,
    `AWS_REGION=${config.awsRegion}`,
  ].join(' ');

  execSync(`${envVars} bun run cdk deploy --require-approval never`, {
    cwd: 'aws/cdk',
    stdio: 'inherit'
  });

  console.log('\n✅ Deployment complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Verify your domain in AWS SES console');
  console.log('2. Configure MX records for your domain');
  console.log('3. Test with a sample email');

} catch (error) {
  console.error('\n❌ Deployment failed:', error);
  process.exit(1);
} 