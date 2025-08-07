#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Deploying Inbound Email Stack...${NC}"
echo ""

# Load environment variables from .env file if it exists
if [ -f ".env" ]; then
    echo -e "${BLUE}📄 Loading environment variables from .env file...${NC}"
    export $(grep -v '^#' .env | xargs)
fi

# Check required environment variables
if [ -z "$SERVICE_API_URL" ] || [ -z "$SERVICE_API_KEY" ]; then
    echo -e "${RED}❌ Required environment variables not set!${NC}"
    echo ""
    echo -e "${YELLOW}Please set these environment variables before deploying:${NC}"
    echo "  export SERVICE_API_URL=\"https://your-domain.com\""
    echo "  export SERVICE_API_KEY=\"your-secret-api-key\""
    echo ""
    echo -e "${YELLOW}Or create a .env file in aws/cdk/ with:${NC}"
    echo "  SERVICE_API_URL=https://your-domain.com"
    echo "  SERVICE_API_KEY=your-secret-api-key"
    echo ""
    echo -e "${BLUE}See aws/cdk/ENVIRONMENT_SETUP.md for detailed instructions.${NC}"
    exit 1
fi

echo ""

# Build CDK TypeScript and Lambda function
echo -e "${YELLOW}📦 Building CDK stack and Lambda function...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ CDK build failed!${NC}"
    exit 1
fi

# Deploy the stack (CDK will build Lambda during deployment)
echo -e "${YELLOW}☁️  Deploying to AWS (includes fresh Lambda build)...${NC}"

# Check if we should force deployment
if [ "$1" == "--force" ]; then
    echo -e "${YELLOW}⚠️  Force deployment mode - will attempt to update existing resources${NC}"
    npm run deploy -- --force --require-approval never
else
    npm run deploy
fi

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    echo -e "${GREEN}🎉 DEPLOYMENT COMPLETE!${NC}"
    echo ""
    echo -e "${BLUE}📝 Add these environment variables to your .env file:${NC}"
    echo ""
    echo -e "${YELLOW}# AWS Configuration for Email Processing${NC}"
    echo "S3_BUCKET_NAME=$S3_BUCKET"
    echo "AWS_ACCOUNT_ID=$AWS_ACCOUNT_ID"
    echo "LAMBDA_FUNCTION_NAME=$LAMBDA_FUNCTION"
    echo "AWS_REGION=$AWS_REGION"
    echo ""
    echo -e "${YELLOW}# Make sure you also have these (from your AWS credentials):${NC}"
    echo "# AWS_ACCESS_KEY_ID=your_access_key_here"
    echo "# AWS_SECRET_ACCESS_KEY=your_secret_key_here"
    echo ""
    echo -e "${BLUE}📚 Resources Created:${NC}"
    echo "• S3 Bucket: $S3_BUCKET"
    echo "• Lambda Function: $LAMBDA_FUNCTION"
    echo "• SES Rule Set: inbound-email-rules"
    echo "• CloudWatch Alarms: Email processor monitoring"
    echo ""
    echo -e "${GREEN}🔗 Next Steps:${NC}"
    echo "1. Copy the environment variables above to your .env file"
    echo "2. Make sure SERVICE_API_KEY is also in your .env file"
    echo "3. Test the email workflow in your Development tab"
    echo "4. Configure your first domain and email addresses"
    echo ""
    echo -e "${BLUE}📡 Webhook Configuration:${NC}"
    echo "• Lambda forwards all emails to: $SERVICE_API_URL/api/inbound/webhook"
    echo "• Authentication: Bearer $SERVICE_API_KEY"
    echo "• No filtering - all emails are forwarded"
    echo ""
    echo -e "${GREEN}🎉 DEPLOYMENT COMPLETE!${NC}"
    echo ""
    echo -e "${BLUE}📋 Getting stack outputs...${NC}"
    OUTPUTS=$(aws cloudformation describe-stacks --stack-name InboundEmailStack --query 'Stacks[0].Outputs' --output json 2>/dev/null)

    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to get stack outputs. Make sure AWS CLI is configured.${NC}"
        exit 1
    fi

    # Extract values
    S3_BUCKET=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="EmailBucketName") | .OutputValue')
    LAMBDA_FUNCTION=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="LambdaFunctionName") | .OutputValue')
    AWS_ACCOUNT_ID=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="AWSAccountId") | .OutputValue')
    AWS_REGION=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="AWSRegion") | .OutputValue')

    echo -e "${BLUE}📝 Add these environment variables to your .env file:${NC}"
    echo ""
    echo -e "${YELLOW}# AWS Configuration for Email Processing${NC}"
    echo "S3_BUCKET_NAME=$S3_BUCKET"
    echo "AWS_ACCOUNT_ID=$AWS_ACCOUNT_ID"
    echo "LAMBDA_FUNCTION_NAME=$LAMBDA_FUNCTION"
    echo "AWS_REGION=$AWS_REGION"
    echo ""
    echo -e "${YELLOW}# Make sure you also have these (from your AWS credentials):${NC}"
    echo "# AWS_ACCESS_KEY_ID=your_access_key_here"
    echo "# AWS_SECRET_ACCESS_KEY=your_secret_key_here"
    echo ""
    echo -e "${BLUE}📚 Resources Created:${NC}"
    echo "• S3 Bucket: $S3_BUCKET"
    echo "• Lambda Function: $LAMBDA_FUNCTION"
    echo "• SES Rule Set: inbound-email-rules"
    echo "• CloudWatch Alarms: Email processor monitoring"
    echo ""
    echo -e "${GREEN}🔗 Next Steps:${NC}"
    echo "1. Copy the environment variables above to your .env file"
    echo "2. Make sure SERVICE_API_KEY is also in your .env file"
    echo "3. Test the email workflow in your Development tab"
    echo "4. Configure your first domain and email addresses"
    echo ""
    echo -e "${BLUE}📡 Webhook Configuration:${NC}"
    echo "• Lambda forwards all emails to: $SERVICE_API_URL/api/inbound/webhook"
    echo "• Authentication: Bearer $SERVICE_API_KEY"
    echo "• No filtering - all emails are forwarded"
    echo ""
    echo -e "${GREEN}🎉 DEPLOYMENT COMPLETE!${NC}"
    echo ""
    echo -e "${BLUE}📋 Next steps:${NC}"
    echo "1. Configure your domain's MX records to point to AWS SES"
    echo "2. Verify your domain in AWS SES console"
    echo "3. Create email addresses using the API endpoints"
    echo "4. Test email receiving functionality"
else
    echo -e "${RED}❌ Deployment failed!${NC}"
    
    # Check for common errors
    if grep -q "bucket policy already exists" <<< "$OUTPUT"; then
        echo -e "${YELLOW}💡 Tip: The bucket policy already exists. This usually happens when redeploying.${NC}"
        echo -e "   Try one of these solutions:${NC}"
        echo -e "   1. Run with force flag: ${GREEN}./deploy.sh --force${NC}"
        echo -e "   2. Delete the stack first: ${GREEN}cdk destroy${NC} then redeploy"
        echo -e "   3. Manually remove the bucket policy in AWS Console and redeploy"
    fi
    
    exit 1
fi 