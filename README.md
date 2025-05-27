# 🚀 Inbound Email System

A dynamic email receiving and processing system built with AWS SES, Lambda, and Next.js that allows you to programmatically manage email addresses and automatically process incoming emails.

## 📋 Overview

**Inbound.exon.dev** enables you to:
- **Dynamically manage email addresses** through your API
- **Automatically receive emails** for managed domains using AWS SES
- **Process emails via Lambda** with spam/virus filtering
- **Store emails in S3** temporarily (auto-deleted after 90 days)
- **Send real-time webhooks** to your API when emails arrive
- **Retrieve full email content** on-demand from S3

## 🏗️ System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Email Sender  │───▶│   AWS SES       │───▶│   S3 Bucket     │
│                 │    │ (Spam/Virus     │    │ (Email Storage) │
│ test@exon.dev   │    │  Filtering)     │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Your API      │◀───│   Lambda        │◀───│   SES Trigger   │
│ (Webhook        │    │ (Email          │    │                 │
│  Endpoint)      │    │  Processor)     │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│   Next.js       │    │   CloudWatch    │
│ (Dashboard)     │    │ (Logs/Metrics)  │
└─────────────────┘    └─────────────────┘
```

## 📁 Project Structure

### **Core Infrastructure Files**
```
inbound.exon.dev/
├── 📁 aws/                          # AWS Infrastructure
│   └── 📁 cdk/                      # CDK Infrastructure as Code
│       ├── 📄 lib/inbound-email-stack.ts  # Main CDK stack definition
│       ├── 📄 bin/inbound-email-cdk.ts    # CDK app entry point
│       ├── 📄 package.json               # CDK dependencies
│       └── 📄 cdk.json                   # CDK configuration
│
├── 📁 lambda/                       # Lambda Functions
│   └── 📁 email-processor/          # Email processing Lambda
│       ├── 📄 index.ts              # Lambda handler entry point
│       ├── 📄 package.json          # Lambda dependencies
│       ├── 📄 tsconfig.json         # TypeScript config
│       └── 📁 dist/                 # Compiled Lambda code
│
├── 📁 lib/                          # Shared Libraries
│   └── 📄 aws-ses.ts                # Email processing library
│
├── 📁 scripts/                      # Deployment Scripts
│   ├── 📄 deploy-email-system.ts    # Full deployment script
│   ├── 📄 quick-deploy.ts           # Quick deployment script
│   └── 📄 test-deployment.ts        # Deployment verification
│
├── 📁 docs/                         # Documentation
│   ├── 📄 DEPLOYMENT_GUIDE.md       # Complete deployment guide
│   ├── 📄 LAMBDA_DEPLOYMENT.md      # Lambda-specific setup
│   └── 📄 DYNAMIC_EMAIL_MANAGEMENT.md # API integration guide
│
└── 📁 app/                          # Next.js Application
    ├── 📁 (main)/                   # Main app routes
    ├── 📁 api/                      # API endpoints
    └── 📁 components/               # React components
```

### **Key Configuration Files**
- **`package.json`** - Main project dependencies and deployment scripts
- **`.env`** - Environment variables (API keys, AWS config)
- **`aws/cdk/lib/inbound-email-stack.ts`** - Infrastructure definition
- **`lambda/email-processor/index.ts`** - Email processing logic

## 🚀 Quick Start

### Prerequisites
```bash
# 1. Install dependencies
bun install

# 2. Configure AWS CLI
aws configure
# Enter: Access Key ID, Secret Access Key, Region (us-east-2)

# 3. Bootstrap CDK (first time only)
cd aws/cdk && bun run cdk bootstrap
```

### Environment Setup
```bash
# Create .env file with your configuration
export SERVICE_API_URL="https://inbound.exon.dev"
export SERVICE_API_KEY="your-secret-api-key"
export EMAIL_DOMAINS="exon.dev,yourdomain.com"
export AWS_REGION="us-east-2"
```

## 📦 Deployment Process

### **New Enhanced Deployment (Recommended)**

The CDK stack now automatically outputs all required environment variables:

```bash
cd aws/cdk
npm install
./deploy.sh  # Full deployment with environment variable extraction
```

This will deploy the infrastructure and display:
```bash
🎉 DEPLOYMENT COMPLETE!

📝 Add these environment variables to your .env file:

# AWS Configuration for Email Processing
S3_BUCKET_NAME=inbound-emails-123456789012-us-west-2
AWS_ACCOUNT_ID=123456789012
LAMBDA_FUNCTION_NAME=inbound-email-processor
AWS_REGION=us-west-2

# Make sure you also have these (from your AWS credentials):
# AWS_ACCESS_KEY_ID=your_access_key_here
# AWS_SECRET_ACCESS_KEY=your_secret_key_here
```

### **Build Process Flow**
```
1. Lambda Build    →  2. CDK Synthesis  →  3. AWS Deployment  →  4. Verification
   ├─ TypeScript      ├─ Infrastructure     ├─ CloudFormation    ├─ Stack Status
   ├─ Dependencies    ├─ Asset Bundling     ├─ S3 Bucket         ├─ Lambda Test
   └─ Dist Output     └─ Template Gen       ├─ Lambda Function   ├─ SES Rules
                                            ├─ SES Rules         └─ Monitoring
                                            └─ IAM Permissions
```

### **Deployment Commands**

#### **Option 1: Quick Deployment (Recommended)**
```bash
# Deploy everything with defaults
bun run deploy:quick

# Deploy with custom configuration
SERVICE_API_URL=https://your-domain.com \
EMAIL_DOMAINS=yourdomain.com \
bun run deploy:quick
```

#### **Option 2: Step-by-Step Deployment**
```bash
# 1. Build Lambda function only
bun run deploy:lambda

# 2. Deploy CDK infrastructure only
SERVICE_API_URL=https://your-domain.com bun run deploy:cdk

# 3. Deploy with full configuration options
bun run deploy:email --service-api-url https://your-domain.com \
                     --email-domains exon.dev,example.com \
                     --aws-region us-east-2
```

#### **Option 3: Manual Build Process**
```bash
# 1. Build Lambda function
cd lambda/email-processor
bun install
bun run build

# 2. Build and deploy CDK
cd ../../aws/cdk
bun install
bun run build
SERVICE_API_URL=https://your-domain.com bun run cdk deploy
```

## 🧪 Testing & Verification

### **1. Deployment Verification**
```bash
# Test the deployment
bun run test:deployment

# Test with specific region
AWS_REGION=us-east-2 bun run test:deployment
```

**Expected Output:**
```
🧪 Testing Email System Deployment

1️⃣ Testing AWS credentials...
✅ AWS Account: 375612485665

2️⃣ Checking CloudFormation stack...
✅ Stack Status: CREATE_COMPLETE

3️⃣ Testing Lambda function...
✅ Lambda State: Active
✅ Lambda Runtime: nodejs18.x
✅ Lambda Memory: 512MB

4️⃣ Testing S3 bucket...
✅ Email bucket found: inbound-emails-375612485665-us-east-2

5️⃣ Testing SES receipt rules...
✅ Receipt rule set found with 1 rules

✅ Deployment test completed!
```

### **2. Domain Configuration**

#### **Verify Domain in AWS SES**
```bash
# Verify your domain
aws ses verify-domain-identity --domain exon.dev --region us-east-2

# Check verification status
aws ses get-identity-verification-attributes --identities exon.dev --region us-east-2
```

#### **Configure DNS Records**
Add these DNS records to your domain:

**MX Record:**
```
Type: MX
Name: @
Value: 10 inbound-smtp.us-east-2.amazonaws.com
TTL: 300
```

**TXT Record (for domain verification):**
```
Type: TXT
Name: @ 
Value: [Value from AWS SES verification]
TTL: 300
```

### **3. Email Testing**

#### **Send Test Email**
```bash
# Send email to any address at your domain
echo "Test email body" | mail -s "Test Subject" test@yourdomain.com
```

#### **Monitor Processing**
```bash
# Watch Lambda logs in real-time
aws logs tail /aws/lambda/inbound-email-processor --follow --region us-east-2

# Check recent Lambda invocations
aws logs describe-log-streams --log-group-name /aws/lambda/inbound-email-processor --region us-east-2

# View S3 bucket contents
aws s3 ls s3://inbound-emails-375612485665-us-east-2/emails/ --recursive
```

## 🔧 Development Workflow

### **Local Development**
```bash
# Start Next.js development server
bun run dev

# Run in development mode with turbopack
bun run dev --turbo
```

### **Making Changes**

#### **Update Lambda Function**
```bash
# 1. Edit lambda/email-processor/index.ts
# 2. Build and deploy
bun run deploy:lambda
```

#### **Update Infrastructure**
```bash
# 1. Edit aws/cdk/lib/inbound-email-stack.ts
# 2. Deploy changes
bun run deploy:cdk
```

#### **Update Email Processing Logic**
```bash
# 1. Edit lib/aws-ses.ts
# 2. Rebuild Lambda
cd lambda/email-processor && bun run build
# 3. Deploy
bun run deploy:lambda
```

## 📊 Monitoring & Debugging

### **CloudWatch Logs**
```bash
# View Lambda logs
aws logs tail /aws/lambda/inbound-email-processor --follow --region us-east-2

# Search for errors
aws logs filter-log-events --log-group-name /aws/lambda/inbound-email-processor \
  --filter-pattern "ERROR" --region us-east-2

# View specific time range
aws logs filter-log-events --log-group-name /aws/lambda/inbound-email-processor \
  --start-time 1640995200000 --end-time 1641081600000 --region us-east-2
```

### **AWS Console Monitoring**
- **Lambda**: Monitor invocations, duration, errors
- **S3**: Check email storage and lifecycle
- **SES**: View receipt metrics and bounce rates
- **CloudWatch**: Set up alarms for errors and performance

### **Debug Commands**
```bash
# Check AWS configuration
aws sts get-caller-identity

# List CloudFormation stacks
aws cloudformation list-stacks --region us-east-2

# Check Lambda function details
aws lambda get-function --function-name inbound-email-processor --region us-east-2

# Test Lambda manually
aws lambda invoke --function-name inbound-email-processor \
  --payload file://test-event.json response.json --region us-east-2
```

## 🔄 Maintenance & Updates

### **Update Dependencies**
```bash
# Update main project
bun update

# Update Lambda dependencies
cd lambda/email-processor && bun update

# Update CDK dependencies
cd aws/cdk && bun update
```

### **Cleanup Resources**
```bash
# Destroy all AWS resources
cd aws/cdk && bun run cdk destroy

# Clean build artifacts
rm -rf lambda/email-processor/dist
rm -rf aws/cdk/cdk.out
```

## 🚨 Troubleshooting

### **Common Issues**

#### **Docker Not Running (CDK Deployment)**
```bash
# Start Docker Desktop
open -a Docker

# Or use pre-built Lambda approach (already configured)
bun run deploy:quick
```

#### **TypeScript Compilation Errors**
```bash
# Check Lambda TypeScript config
cd lambda/email-processor
bun run build

# Fix import paths if needed
```

#### **AWS Permissions**
```bash
# Verify AWS credentials
aws sts get-caller-identity

# Check IAM permissions for SES, S3, Lambda, CloudFormation
```

#### **Email Not Received**
1. Check MX records: `dig MX yourdomain.com`
2. Verify domain in SES console
3. Check SES sandbox mode
4. Monitor CloudWatch logs

### **Debug Checklist**
- [ ] AWS CLI configured and working
- [ ] Domain verified in AWS SES
- [ ] MX records pointing to AWS SES
- [ ] Lambda function deployed and active
- [ ] S3 bucket created with proper permissions
- [ ] SES receipt rules configured
- [ ] CloudWatch logs showing activity

## 📚 Additional Resources

- **[Full Deployment Guide](docs/DEPLOYMENT_GUIDE.md)** - Complete setup instructions
- **[Lambda Deployment](docs/LAMBDA_DEPLOYMENT.md)** - Lambda-specific configuration
- **[Dynamic Email Management](docs/DYNAMIC_EMAIL_MANAGEMENT.md)** - API integration
- **[AWS SES Documentation](https://docs.aws.amazon.com/ses/)** - Official AWS docs

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

**Ready to receive emails? Run `bun run deploy:quick` and follow the setup steps!** 🎉
