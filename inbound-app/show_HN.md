Show HN: I built an email system that turns any domain into an AI agent's inbox

Hey HN! I've been working on Inbound (inbound.new) - an email system that lets you programmatically manage email addresses and route them to AI agents, webhooks, or forward them anywhere.

The core idea: instead of manually managing email addresses, you create them on-demand via API and route incoming emails to your AI agents or other automated systems.

For AI Agents: Create support@yourdomain.com and emails get sent to your AI agent as webhooks. Your agent can reply using our SDK. Perfect for AI customer support or automated responses.

For Email Forwarding: Set up hello@yourdomain.com to forward to your Gmail, or create email groups that forward to multiple people with custom rules.

For Developers: Full TypeScript SDK with one-line email replies and webhook types. Handles all the AWS SES complexity for you.

I built this because existing solutions were either too complex (raw AWS SES setup) or too limited (basic forwarding). I wanted something that made it trivial to connect emails to AI agents with great developer experience.

The system uses AWS SES + Lambda + S3 for reliable email processing. Your AI agent gets clean webhook data with parsed emails, attachments, threading info, etc.

It's been running in production for months handling thousands of emails. The free tier is generous and no credit card required to try it.

You can try the email forwarding at inbound.new, check out the SDK at @inboundemail/sdk on npm, or see working examples in the repo.

Built this evenings/weekends over the past few months. Would love your feedback, especially if you're working on AI agents or email automation! 