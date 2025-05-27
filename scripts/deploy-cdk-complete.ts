#!/usr/bin/env bun

import { execSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';

console.log('🚀 Complete CDK Deployment for Inbound Email System\n');

const projectRoot = process.cwd();
const cdkDir = join(projectRoot, 'aws', 'cdk');

// Default configuration
const defaultConfig = {
  SERVICE_API_URL: 'https://inbound.exon.dev',
  SERVICE_API_KEY: process.env.SERVICE_API_KEY || generateApiKey(),
  AWS_REGION: process.env.AWS_REGION || 'us-east-2'
};

function generateApiKey(): string {
  return require('crypto').randomBytes(32).toString('hex');
}

function createEnvFile() {
  const envPath = join(cdkDir, '.env');
  const envContent = `# Environment variables for CDK deployment
SERVICE_API_URL=${defaultConfig.SERVICE_API_URL}
SERVICE_API_KEY=${defaultConfig.SERVICE_API_KEY}
AWS_REGION=${defaultConfig.AWS_REGION}
`;

  writeFileSync(envPath, envContent);
  console.log(`✅ Created .env file at ${envPath}`);
  console.log(`🔑 Generated API Key: ${defaultConfig.SERVICE_API_KEY}`);
  console.log('📝 Make sure to save this API key for your application!\n');
}

async function deployStack() {
  try {
    console.log('1️⃣ Setting up environment...');
    
    // Create .env file if it doesn't exist
    if (!existsSync(join(cdkDir, '.env'))) {
      createEnvFile();
    }

    console.log('2️⃣ Installing CDK dependencies...');
    execSync('bun install', { 
      cwd: cdkDir, 
      stdio: 'inherit' 
    });

    console.log('3️⃣ Installing Lambda dependencies...');
    execSync('bun install', { 
      cwd: join(cdkDir, 'lib', 'lambda'), 
      stdio: 'inherit' 
    });

    console.log('4️⃣ Building CDK stack...');
    execSync('bun run build', { 
      cwd: cdkDir, 
      stdio: 'inherit' 
    });

    console.log('5️⃣ Deploying to AWS...');
    execSync('./deploy.sh', { 
      cwd: cdkDir, 
      stdio: 'inherit' 
    });

    console.log('\n🎉 Deployment completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Copy the environment variables from the output to your main .env file');
    console.log('2. Configure your domains using the API endpoints');
    console.log('3. Set up MX records for your domains');
    console.log('4. Test email receiving functionality');

  } catch (error) {
    console.error('❌ Deployment failed:', error);
    console.log('\n🔧 Troubleshooting tips:');
    console.log('1. Make sure AWS CLI is configured with proper credentials');
    console.log('2. Ensure you have the necessary AWS permissions');
    console.log('3. Check that your AWS region is supported for SES');
    console.log('4. Try running with --force flag if resources already exist');
    process.exit(1);
  }
}

// Run deployment
deployStack(); 