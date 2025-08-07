#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔧 Fixing deployment issues with existing resources...${NC}"

# Get AWS account ID and region
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=${AWS_REGION:-us-east-2}
BUCKET_NAME="inbound-emails-${AWS_ACCOUNT_ID}-${AWS_REGION}"

echo -e "\n${YELLOW}📋 Configuration:${NC}"
echo "   AWS Account: ${AWS_ACCOUNT_ID}"
echo "   AWS Region: ${AWS_REGION}"
echo "   Bucket Name: ${BUCKET_NAME}"

# Check if bucket exists
echo -e "\n${BLUE}🔍 Checking if S3 bucket exists...${NC}"
if aws s3api head-bucket --bucket "${BUCKET_NAME}" 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Bucket exists. Attempting to fix deployment...${NC}"
    
    # Option 1: Try to remove the bucket policy
    echo -e "\n${BLUE}📝 Attempting to remove existing bucket policy...${NC}"
    aws s3api delete-bucket-policy --bucket "${BUCKET_NAME}" 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Bucket policy removed successfully${NC}"
    else
        echo -e "${YELLOW}⚠️  Could not remove bucket policy (might not exist)${NC}"
    fi
    
    # Option 2: Set environment variable to import existing bucket
    echo -e "\n${BLUE}🔄 Setting up to import existing bucket...${NC}"
    export IMPORT_EXISTING_BUCKET=true
    
    echo -e "\n${GREEN}✅ Ready to redeploy with existing bucket${NC}"
else
    echo -e "${GREEN}✅ Bucket does not exist, normal deployment will work${NC}"
fi

# Load environment variables
if [ -f "../../.env" ]; then
    echo -e "\n${BLUE}📄 Loading environment variables from .env file...${NC}"
    export $(cat ../../.env | grep -v '^#' | xargs)
fi

# Build and deploy
echo -e "\n${BLUE}🚀 Attempting deployment...${NC}"
npm run build
npm run deploy -- --force --require-approval never

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}✅ Deployment successful!${NC}"
    echo -e "\n${BLUE}💡 Tips for future deployments:${NC}"
    echo "   - Use './redeploy-fix.sh' if you encounter bucket policy issues"
    echo "   - Or run 'cdk destroy' first to clean up all resources"
else
    echo -e "\n${RED}❌ Deployment still failed${NC}"
    echo -e "\n${YELLOW}💡 Manual fix options:${NC}"
    echo "   1. Delete the stack: ${GREEN}cdk destroy${NC}"
    echo "   2. Delete bucket manually: ${GREEN}aws s3 rb s3://${BUCKET_NAME} --force${NC}"
    echo "   3. Go to AWS Console > S3 > ${BUCKET_NAME} > Permissions > Bucket Policy > Delete"
    exit 1
fi 