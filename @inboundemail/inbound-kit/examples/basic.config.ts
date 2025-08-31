import type { InboundConfig } from '@inboundemail/inbound-kit'

const config: InboundConfig = {
  emailAddresses: {
    "hello@example.com": "https://api.example.com/webhook",
    "support@example.com": ["admin@company.com", "dev@company.com"],
    "sales@example.com": { forward: "crm@company.com" }
  }
}

export default config
