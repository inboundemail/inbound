#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Deploying Inbound Email Stack...${NC}"
echo ""

# Build the TypeScript
echo -e "${YELLOW}📦 Building TypeScript...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi

# Deploy the stack
echo -e "${YELLOW}☁️  Deploying to AWS...${NC}"
npm run deploy

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Deployment failed!${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo ""
echo -e "${BLUE}📋 Stack Outputs (copy the values you need):${NC}"
echo ""

# Show stack outputs directly
aws cloudformation describe-stacks --stack-name InboundEmailStack --query 'Stacks[0].Outputs[?OutputKey==`EnvironmentVariables`].OutputValue' --output text

echo ""
echo -e "${GREEN}🔗 Next Steps:${NC}"
echo "1. Copy the environment variables above to your .env file"
echo "2. Test the email workflow in your Development tab"
echo "3. Configure your first domain and email addresses"
echo "" 