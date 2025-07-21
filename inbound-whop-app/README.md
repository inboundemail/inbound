# Whop Next.js App with Inbound Email Integration

This is a Whop application template that integrates with the Inbound Email API to provide email management functionality.

## Features

- 📧 **Email Management**: List, view, and reply to emails using the Inbound Email API
- 🔗 **Whop Integration**: Built for the Whop platform with proper authentication
- 📱 **Responsive Design**: Works on desktop and mobile devices
- ⚡ **Real-time Updates**: Refresh and load more emails dynamically

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Environment Configuration

Copy the example environment file and configure your variables:

```bash
cp .env.example .env.local
```

Fill in the required environment variables:

#### Whop Configuration (Required)
- `NEXT_PUBLIC_WHOP_APP_ID`: Your Whop app ID
- `NEXT_PUBLIC_WHOP_AGENT_USER_ID`: Your Whop agent user ID  
- `NEXT_PUBLIC_WHOP_COMPANY_ID`: Your Whop company ID
- `WHOP_API_KEY`: Your Whop API key

#### Inbound Email Configuration (Required)
- `INBOUND_API_KEY`: Your Inbound Email API key
- `INBOUND_DEFAULT_REPLY_FROM`: Default email address for replies (optional)

### 3. Get Your Inbound API Key

1. Go to [your Inbound dashboard](https://inbound.new/dashboard)
2. Navigate to Settings → API Keys
3. Create a new API key
4. Add it to your `.env.local` file

### 4. Development

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Email Management Features

### Email List
- View all received emails with pagination
- See email status (read/unread, archived, parse errors)
- Filter and search emails
- Real-time refresh functionality

### Email Detail View
- Full email content display (HTML and text)
- View attachments
- Email metadata (sender, recipient, timestamps)
- Reply functionality

### Reply to Emails
- Compose replies directly in the app
- Auto-populated subject lines with "Re:" prefix
- Support for both text and HTML replies
- Include original message context

## API Integration

This app uses the `@inboundemail/sdk` v2.0+ which provides:

- **Mail API**: List and retrieve emails
- **Reply API**: Send replies to emails
- **Type Safety**: Full TypeScript support
- **Error Handling**: Comprehensive error responses

## Project Structure

```
inbound-whop-app/
├── app/
│   ├── actions/
│   │   └── emails.ts          # Server actions for email operations
│   ├── components/
│   │   ├── email-list.tsx     # Email list component
│   │   ├── email-card.tsx     # Individual email card
│   │   ├── email-detail.tsx   # Detailed email view
│   │   ├── reply-form.tsx     # Email reply form
│   │   └── button.tsx         # Reusable button component
│   └── page.tsx               # Main application page
├── lib/
│   ├── inbound-client.ts      # Inbound Email SDK configuration
│   ├── whop-sdk.ts           # Whop SDK configuration
│   └── utils.ts              # Utility functions
└── .env.example              # Environment variables template
```

## Deployment

This app is designed to be deployed on the Whop platform. Make sure to:

1. Set all required environment variables in your deployment environment
2. Ensure your Inbound API key has the necessary permissions
3. Configure your default reply email address

## Support

- [Inbound Email Documentation](https://docs.inbound.new)
- [Whop Developer Documentation](https://dev.whop.com)
- [SDK Repository](https://github.com/inboundemail/sdk)
