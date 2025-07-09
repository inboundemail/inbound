# Whop App for Inbound - Customer Support Messages Integration

This README provides a comprehensive guide for building a Whop app that integrates with Inbound to display customer support messages and email communications within Whop communities.

## Overview

The Whop app for Inbound will allow Whop creators to:
- View customer support emails received through their Inbound email addresses
- Display support messages within their Whop community
- Manage and respond to customer inquiries directly from Whop
- Track support metrics and analytics

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Whop App      │────▶│  Inbound API    │────▶│ Inbound Backend │
│  (Next.js)      │◀────│  (GraphQL/REST) │◀────│   (Database)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                               │
        └───────────── API Key Auth ────────────────────┘
```

## Prerequisites

- Node.js 18+ and Bun package manager
- Whop developer account
- Inbound account with API access
- Basic knowledge of Next.js and React

## Setup Instructions

### Step 1: Create a Whop App

1. Go to [Whop Dashboard](https://whop.com/dashboard/developer/)
2. Click "Create New App"
3. Fill in the app details:
   - **Name**: Inbound Support Messages
   - **Description**: View and manage customer support emails from Inbound
   - **Category**: Business Tools / Customer Support
4. Copy your `App ID` and `API Key`

### Step 2: Clone the Whop Next.js Template

```bash
# Clone the Whop Next.js template
npx create-next-app@latest inbound-whop-app -e https://github.com/whopio/whop-nextjs-app-template

# Navigate to the project
cd inbound-whop-app

# Install dependencies with bun
bun install
```

### Step 3: Configure Environment Variables

Create a `.env.local` file:

```env
# Whop Configuration
NEXT_PUBLIC_WHOP_APP_ID=your-whop-app-id
WHOP_API_KEY=your-whop-api-key

# Inbound Configuration
INBOUND_API_URL=https://inbound.new/api/v1
INBOUND_API_KEY_PREFIX=inbound_api_

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 4: Set Up Authentication Flow

The app will use a two-step authentication process:
1. Whop handles user authentication
2. Users connect their Inbound account via API key

Create `app/api/auth/inbound/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { whopSdk } from '@/lib/whop-sdk'

export async function POST(request: NextRequest) {
  const { apiKey, userId, experienceId } = await request.json()
  
  // Validate the API key with Inbound
  const response = await fetch(`${process.env.INBOUND_API_URL}/domains`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  })
  
  if (!response.ok) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }
  
  // Store the encrypted API key for this user/experience
  // You'll need to implement secure storage (e.g., encrypted database)
  await storeApiKey(userId, experienceId, apiKey)
  
  return NextResponse.json({ success: true })
}
```

## Core Features Implementation

### 1. Email List View

Create `components/EmailList.tsx`:

```typescript
import { useEffect, useState } from 'react'
import { useWhop } from '@/lib/whop-context'

interface Email {
  id: string
  from: string
  to: string
  subject: string
  receivedAt: string
  isRead: boolean
}

export function EmailList() {
  const { userId, experienceId } = useWhop()
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchEmails()
  }, [userId, experienceId])

  const fetchEmails = async () => {
    try {
      const response = await fetch('/api/emails', {
        headers: {
          'X-User-Id': userId,
          'X-Experience-Id': experienceId,
        },
      })
      const data = await response.json()
      setEmails(data.emails)
    } catch (error) {
      console.error('Failed to fetch emails:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div>Loading emails...</div>

  return (
    <div className="space-y-4">
      {emails.map((email) => (
        <EmailCard key={email.id} email={email} />
      ))}
    </div>
  )
}
```

### 2. API Integration Layer

Create `app/api/emails/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const userId = request.headers.get('X-User-Id')
  const experienceId = request.headers.get('X-Experience-Id')
  
  // Get the stored API key for this user
  const apiKey = await getStoredApiKey(userId, experienceId)
  
  if (!apiKey) {
    return NextResponse.json({ error: 'No API key configured' }, { status: 401 })
  }
  
  // Fetch emails from Inbound API
  const response = await fetch(`${process.env.INBOUND_API_URL}/emails`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  })
  
  const data = await response.json()
  
  return NextResponse.json({
    emails: data.data.map(transformEmailForDisplay),
  })
}

function transformEmailForDisplay(email: any) {
  return {
    id: email.id,
    from: email.from,
    to: email.to,
    subject: email.subject,
    receivedAt: email.createdAt,
    isRead: email.isRead,
    preview: email.textContent?.substring(0, 100) + '...',
  }
}
```

### 3. Email Detail View

Create `components/EmailDetail.tsx`:

```typescript
export function EmailDetail({ emailId }: { emailId: string }) {
  const [email, setEmail] = useState(null)
  
  // Fetch and display email details
  // Implementation here...
}
```

## App Structure

```
inbound-whop-app/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   └── inbound/
│   │   │       └── route.ts
│   │   ├── emails/
│   │   │   ├── route.ts
│   │   │   └── [id]/
│   │   │       └── route.ts
│   │   └── webhooks/
│   │       └── route.ts
│   ├── experiences/
│   │   └── [experienceId]/
│   │       ├── page.tsx
│   │       ├── settings/
│   │       │   └── page.tsx
│   │       └── emails/
│   │           └── [emailId]/
│   │               └── page.tsx
│   └── discover/
│       └── page.tsx
├── components/
│   ├── EmailList.tsx
│   ├── EmailDetail.tsx
│   ├── ApiKeySetup.tsx
│   └── SupportMetrics.tsx
├── lib/
│   ├── whop-sdk.ts
│   ├── inbound-client.ts
│   └── encryption.ts
└── public/
    └── assets/
```

## Key Features to Implement

### 1. API Key Management
- Secure storage of Inbound API keys
- Per-experience API key configuration
- Encryption at rest

### 2. Email Display
- List view with pagination
- Search and filtering
- Email detail view with full content
- Attachment handling

### 3. Support Metrics
- Total emails received
- Response time tracking
- Customer satisfaction metrics
- Volume trends

### 4. Webhooks Integration
- Real-time email notifications
- Push notifications for new emails
- Status updates

### 5. Permissions & Access Control
- Role-based access (admin, support agent, viewer)
- Experience-level permissions
- User-specific email access

## Security Considerations

1. **API Key Storage**
   - Never store API keys in plain text
   - Use encryption for sensitive data
   - Implement key rotation

2. **Data Privacy**
   - Only fetch emails the user has access to
   - Implement proper data retention policies
   - Comply with GDPR/privacy regulations

3. **Rate Limiting**
   - Implement rate limiting for API calls
   - Cache frequently accessed data
   - Use pagination for large datasets

## Deployment

### 1. Prepare for Production

```bash
# Build the application
bun run build

# Test the production build
bun run start
```

### 2. Deploy to Vercel (Recommended)

```bash
# Install Vercel CLI
bun add -g vercel

# Deploy
vercel --prod
```

### 3. Configure Whop App Settings

1. Go to your app settings in Whop Dashboard
2. Update the URLs:
   - **App Base URL**: `https://your-app.vercel.app`
   - **Experience Path**: `/experiences/[experienceId]`
   - **Discover Path**: `/discover`
3. Set required scopes:
   - `user:read`
   - `experience:read`
   - `notifications:send`

## Testing

### Local Development

1. Install your app on a test Whop
2. Enable dev mode in the Whop interface
3. Test with sample data

### Integration Testing

```typescript
// tests/api/emails.test.ts
describe('Email API', () => {
  it('should fetch emails with valid API key', async () => {
    // Test implementation
  })
  
  it('should handle invalid API keys', async () => {
    // Test implementation
  })
})
```

## Monetization Options

1. **Per-Seat Pricing**: Charge based on number of support agents
2. **Volume-Based**: Charge based on email volume
3. **Feature Tiers**: Basic (view only) vs Premium (full features)
4. **Transaction Fees**: Small fee per support ticket resolved

## Support & Resources

- [Whop Developer Documentation](https://dev.whop.com)
- [Inbound API Documentation](https://inbound.new/docs)
- [Whop Discord Community](https://discord.gg/whop)
- [Example Apps](https://github.com/whopio)

## Next Steps

1. Clone the template and set up your development environment
2. Implement the core email listing functionality
3. Add authentication and API key management
4. Build out the UI components
5. Test with real data
6. Deploy and submit for Whop app store review

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT License - see LICENSE file for details 