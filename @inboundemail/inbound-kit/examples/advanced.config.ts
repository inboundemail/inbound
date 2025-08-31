import type { InboundConfig } from '@inboundemail/inbound-kit'

const config: InboundConfig = {
  emailAddresses: {
    // Simple webhook endpoints
    "hello@example.com": "https://api.example.com/inbound",
    "contact@example.com": "https://api.example.com/contact",
    
    // Email forwarding
    "sales@example.com": { forward: "crm@company.com" },
    "billing@example.com": { forward: "accounting@company.com" },
    
    // Email groups (multiple recipients)
    "support@example.com": [
      "admin@company.com", 
      "dev@company.com", 
      "support@company.com"
    ],
    "leadership@example.com": [
      "ceo@company.com",
      "cto@company.com", 
      "cfo@company.com"
    ],
    
    // Slack integration
    "alerts@example.com": {
      slack: {
        url: "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK",
        channel: "#alerts",
        username: "Inbound Bot"
      }
    },
    
    // Discord integration
    "notifications@example.com": {
      discord: {
        url: "https://discord.com/api/webhooks/YOUR/DISCORD/WEBHOOK",
        username: "Inbound Bot",
        avatarUrl: "https://example.com/bot-avatar.png"
      }
    },
    
    // Reference to named endpoint
    "api@example.com": "primary-webhook"
  },
  
  domains: {
    "example.com": {
      catchAll: "https://api.example.com/catchall"
    },
    "staging.example.com": {
      catchAll: false
    }
  },
  
  endpoints: {
    "primary-webhook": {
      type: "webhook",
      url: "https://api.example.com/inbound",
      timeout: 45,
      retryAttempts: 5,
      headers: {
        "X-API-Key": "your-secret-api-key",
        "X-Source": "inbound-email",
        "X-Environment": "production"
      }
    },
    "slack-dev-alerts": {
      type: "slack",
      webhookUrl: "https://hooks.slack.com/services/YOUR/DEV/WEBHOOK",
      channel: "#dev-alerts",
      username: "Dev Bot"
    },
    "emergency-team": {
      type: "email_group",
      emails: [
        "oncall@company.com",
        "manager@company.com",
        "security@company.com"
      ]
    }
  }
}

export default config
