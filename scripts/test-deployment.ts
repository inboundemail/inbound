#!/usr/bin/env bun

import { execSync } from 'child_process';

console.log('🧪 Testing Email System Deployment\n');

const awsRegion = process.env.AWS_REGION || 'us-west-2';
const awsProfile = process.env.AWS_PROFILE ? `--profile ${process.env.AWS_PROFILE}` : '';

async function testDeployment() {
  try {
    // Test 1: Check AWS credentials
    console.log('1️⃣ Testing AWS credentials...');
    const identity = execSync(`aws sts get-caller-identity ${awsProfile}`, { encoding: 'utf8' });
    const account = JSON.parse(identity);
    console.log(`✅ AWS Account: ${account.Account} (${account.Arn})\n`);

    // Test 2: Check CloudFormation stack
    console.log('2️⃣ Checking CloudFormation stack...');
    try {
      const stackInfo = execSync(
        `aws cloudformation describe-stacks --stack-name InboundEmailStack --region ${awsRegion} ${awsProfile}`,
        { encoding: 'utf8' }
      );
      const stack = JSON.parse(stackInfo);
      const stackStatus = stack.Stacks[0]?.StackStatus;
      console.log(`✅ Stack Status: ${stackStatus}`);
      
      if (stackStatus !== 'CREATE_COMPLETE' && stackStatus !== 'UPDATE_COMPLETE') {
        console.log('⚠️  Stack is not in a complete state');
      }

      // Show outputs
      const outputs = stack.Stacks[0]?.Outputs || [];
      console.log('\n📊 Stack Outputs:');
      outputs.forEach((output: any) => {
        console.log(`  ${output.OutputKey}: ${output.OutputValue}`);
      });
      console.log('');

    } catch (error) {
      console.log('❌ CloudFormation stack not found or accessible\n');
      return false;
    }

    // Test 3: Check Lambda function
    console.log('3️⃣ Testing Lambda function...');
    try {
      const lambdaInfo = execSync(
        `aws lambda get-function --function-name inbound-email-processor --region ${awsRegion} ${awsProfile}`,
        { encoding: 'utf8' }
      );
      const lambda = JSON.parse(lambdaInfo);
      console.log(`✅ Lambda State: ${lambda.Configuration.State}`);
      console.log(`✅ Lambda Runtime: ${lambda.Configuration.Runtime}`);
      console.log(`✅ Lambda Memory: ${lambda.Configuration.MemorySize}MB`);
      console.log(`✅ Lambda Timeout: ${lambda.Configuration.Timeout}s\n`);
    } catch (error) {
      console.log('❌ Lambda function not found or accessible\n');
      return false;
    }

    // Test 4: Check S3 bucket
    console.log('4️⃣ Testing S3 bucket...');
    try {
      const buckets = execSync(`aws s3 ls ${awsProfile}`, { encoding: 'utf8' });
      const emailBucket = buckets.split('\n').find(line => line.includes('inbound-emails'));
      if (emailBucket) {
        console.log(`✅ Email bucket found: ${emailBucket.trim()}\n`);
      } else {
        console.log('⚠️  Email bucket not found in S3 list\n');
      }
    } catch (error) {
      console.log('❌ Could not list S3 buckets\n');
    }

    // Test 5: Check SES receipt rules
    console.log('5️⃣ Testing SES receipt rules...');
    try {
      const rules = execSync(
        `aws ses describe-receipt-rule-set --rule-set-name inbound-email-rules --region ${awsRegion} ${awsProfile}`,
        { encoding: 'utf8' }
      );
      const ruleSet = JSON.parse(rules);
      console.log(`✅ Receipt rule set found with ${ruleSet.Rules?.length || 0} rules\n`);
    } catch (error) {
      console.log('❌ SES receipt rules not found or accessible\n');
    }

    // Test 6: Test Lambda invocation
    console.log('6️⃣ Testing Lambda invocation...');
    const testEvent = {
      Records: [{
        eventSource: 'aws:ses',
        ses: {
          mail: {
            messageId: 'test-message-id',
            source: 'test@example.com',
            destination: ['test@exon.dev']
          }
        }
      }]
    };

    try {
      execSync(
        `aws lambda invoke --function-name inbound-email-processor --payload '${JSON.stringify(testEvent)}' --region ${awsRegion} ${awsProfile} /tmp/lambda-test-response.json`,
        { stdio: 'pipe' }
      );
      
      const response = execSync('cat /tmp/lambda-test-response.json', { encoding: 'utf8' });
      console.log('✅ Lambda invocation successful');
      console.log(`📄 Response: ${response}\n`);
    } catch (error) {
      console.log('❌ Lambda invocation failed\n');
    }

    console.log('✅ Deployment test completed!\n');
    
    console.log('📋 Next steps to test email receiving:');
    console.log('1. Verify your domain in AWS SES console');
    console.log('2. Configure MX records for your domain');
    console.log('3. Send a test email to your domain');
    console.log('4. Check CloudWatch logs: /aws/lambda/inbound-email-processor');

    return true;

  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

// Run the test
testDeployment().then(success => {
  process.exit(success ? 0 : 1);
}); 