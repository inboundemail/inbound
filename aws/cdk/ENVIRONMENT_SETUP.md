# Environment Variables Setup

## Required Environment Variables

Your Lambda function needs these environment variables to fetch email content from S3 and forward to your webhook:

### 1. SERVICE_API_URL
- **Description**: The base URL of your application
- **Example**: `https://inbound.exon.dev`
- **Used for**: Constructing the webhook URL (`${SERVICE_API_URL}/api/inbound/webhook`)

### 2. SERVICE_API_KEY
- **Description**: API key for authenticating webhook requests
- **Example**: `your-secret-api-key-here`
- **Used for**: Bearer token authentication in webhook requests

## How Environment Variables Are Set

### Option 1: Set Before CDK Deployment (Recommended)

Set these environment variables in your shell before running CDK deploy:

```bash
export SERVICE_API_URL="https://inbound.exon.dev"
export SERVICE_API_KEY="your-secret-api-key-here"

# Then deploy
cd aws/cdk
bun run deploy
```

### Option 2: Set in Your Shell Profile

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
export SERVICE_API_URL="https://inbound.exon.dev"
export SERVICE_API_KEY="your-secret-api-key-here"
```

Then reload your shell:
```bash
source ~/.zshrc
```

### Option 3: Create a .env File

Create `aws/cdk/.env`:
```bash
SERVICE_API_URL=https://inbound.exon.dev
SERVICE_API_KEY=your-secret-api-key-here
```

Then load it before deployment:
```bash
cd aws/cdk
source .env
bun run deploy
```

## Your Application Environment Variables

Your Next.js application also needs the `SERVICE_API_KEY` in its `.env` file:

```bash
# In your main .env file
SERVICE_API_KEY=your-secret-api-key-here
```

**Important**: Use the same `SERVICE_API_KEY` value in both places!

## Generating a Secure API Key

You can generate a secure API key using:

```bash
# Option 1: Using openssl
openssl rand -hex 32

# Option 2: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Option 3: Using online generator
# Visit: https://generate-random.org/api-key-generator
```

## Verification

After deployment, you can verify the environment variables are set correctly:

1. **Check Lambda function in AWS Console**:
   - Go to AWS Lambda → Functions → `inbound-email-processor`
   - Click "Configuration" → "Environment variables"
   - Verify `SERVICE_API_URL` and `SERVICE_API_KEY` are present

2. **Test the webhook endpoint**:
   ```bash
   curl -X GET https://your-domain.com/api/inbound/webhook
   ```
   Should return a health check response.

3. **Check CloudWatch logs** after sending a test email to see if the Lambda function is forwarding correctly.

## Troubleshooting

### Lambda function fails with "Missing required environment variables"
- Ensure you set the environment variables before running `cdk deploy`
- Check the Lambda function configuration in AWS Console

### Webhook returns 401 Unauthorized
- Verify the `SERVICE_API_KEY` matches in both Lambda and your application
- Check that the API key doesn't have extra spaces or characters

### Lambda timeout errors
- The function fetches email content from S3 before forwarding, so it may take longer
- Check CloudWatch logs for S3 access errors or network issues
- Verify the Lambda function has S3 read permissions

### S3 access errors
- Ensure the Lambda function has proper IAM permissions to read from the S3 bucket
- Check that the S3 bucket name and object keys are correct in the logs
- Verify the AWS region matches between Lambda and S3 