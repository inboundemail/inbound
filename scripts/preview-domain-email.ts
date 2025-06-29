#!/usr/bin/env bun

import { spawn } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';

// Configuration
const PREVIEW_PORT = 3030;
const EMAIL_DIR = 'scripts/sending/emails';
const TEMPLATE_FILE = 'domain-verified.tsx';

async function setupEmailPreview() {
  console.log('🚀 Setting up React Email preview for domain verification template...');
  console.log('');

  // Check if the email template exists
  const templatePath = join(EMAIL_DIR, TEMPLATE_FILE);
  if (!existsSync(templatePath)) {
    console.error(`❌ Email template not found: ${templatePath}`);
    process.exit(1);
  }

  // Create emails directory structure for React Email
  const emailsPreviewDir = 'emails';
  const previewTemplatePath = join(emailsPreviewDir, TEMPLATE_FILE);

  // Create emails directory if it doesn't exist
  if (!existsSync(emailsPreviewDir)) {
    console.log('📁 Creating emails directory for preview...');
    require('fs').mkdirSync(emailsPreviewDir, { recursive: true });
  }

  // Copy the template to the emails directory for preview
  console.log('📋 Setting up preview template...');
  const templateContent = require('fs').readFileSync(templatePath, 'utf8');
  writeFileSync(previewTemplatePath, templateContent);

  // Create a sample preview file with different props
  const previewContent = `import { DomainVerifiedEmail } from './domain-verified';

export default function DomainVerifiedPreview() {
  return (
    <DomainVerifiedEmail
      userFirstname="Ryan"
      domain="xdemo.inbound.run"
      verifiedAt="December 28, 2024 at 5:48 PM EST"
    />
  );
}`;

  writeFileSync(join(emailsPreviewDir, 'domain-verified-preview.tsx'), previewContent);

  console.log('✅ Preview setup complete!');
  console.log('');
  console.log('🌐 Starting React Email preview server...');
  console.log(`   Preview URL: http://localhost:${PREVIEW_PORT}`);
  console.log('');
  console.log('📝 To edit the template:');
  console.log(`   1. Edit: ${templatePath}`);
  console.log(`   2. The preview will auto-refresh`);
  console.log('');
  console.log('🛑 Press Ctrl+C to stop the preview server');
  console.log('');

  // Start the React Email preview server
  const previewProcess = spawn('bunx', ['email', 'dev', '--port', PREVIEW_PORT.toString()], {
    stdio: 'inherit',
    shell: true
  });

  // Handle process termination
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping preview server...');
    previewProcess.kill();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    previewProcess.kill();
    process.exit(0);
  });

  previewProcess.on('close', (code) => {
    console.log(`\n📊 Preview server exited with code ${code}`);
    process.exit(code || 0);
  });
}

// Check if React Email CLI is installed
async function checkReactEmailCLI() {
  try {
    const { execSync } = require('child_process');
    execSync('bunx email --version', { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

async function main() {
  console.log('🔍 Checking React Email CLI...');
  
  const hasReactEmail = await checkReactEmailCLI();
  if (!hasReactEmail) {
    console.log('📦 React Email CLI not found. Installing...');
    try {
      const { execSync } = require('child_process');
      execSync('bun add -D react-email', { stdio: 'inherit' });
      console.log('✅ React Email CLI installed successfully!');
    } catch (error) {
      console.error('❌ Failed to install React Email CLI:', error);
      process.exit(1);
    }
  }

  await setupEmailPreview();
}

main().catch(console.error); 