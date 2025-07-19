import http from "http";
import { forward, Listener } from "@ngrok/ngrok";
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

type WebhookOptions = {
  port?: number;
  match: (body: any) => boolean;
  timeoutMs?: number;
};

type AwaitWebhookResult = {
  body: any;
  url: string;
  close: () => Promise<void>;
};

/**
 * Sets up a webhook listener with ngrok tunnel for testing
 * 
 * Required environment variables:
 * - NGROK_AUTHTOKEN: Your ngrok authentication token
 * - RESEND_API_KEY: Required for sendTestEmail function
 * 
 * @param options Configuration options for the webhook
 * @returns Promise resolving to webhook setup with URL and wait function
 */
export async function setupWebhook({
  port = 7878,
  match,
  timeoutMs = 30000, // 30 seconds timeout for email delivery
}: WebhookOptions): Promise<{
  url: string;
  waitForWebhook: () => Promise<any>;
  close: () => Promise<void>;
}> {
  return new Promise(async (resolve, reject) => {
    let resolved = false;
    let listener: Listener | undefined;
    let webhookResolver: ((body: any) => void) | undefined;
    let webhookRejecter: ((error: Error) => void) | undefined;
    let bufferedPayload: any | undefined; // Buffer the payload if it arrives early

    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", chunk => (body += chunk));
      req.on("end", () => {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        res.end(JSON.stringify({ success: true, message: "Webhook received" }));

        try {
          const parsed = JSON.parse(body);
          console.log("📥 Webhook received:", {
            timestamp: new Date().toISOString(),
            body: parsed
          });

          if (!resolved && match(parsed)) {
            resolved = true;
            console.log("✅ Webhook matched! Resolving...");
            if (webhookResolver) {
              webhookResolver(parsed);
            } else {
              // Buffer the payload if waitForWebhook hasn't been called yet
              bufferedPayload = parsed;
              console.log("📦 Buffering webhook payload for later retrieval");
            }
          } else {
            console.log("⏳ Webhook received but didn't match criteria");
          }
        } catch (err) {
          console.log("❌ Failed to parse webhook payload:", err);
          // Don't reject, just ignore malformed payload
        }
      });
    });

    // Handle OPTIONS requests for CORS
    server.on('request', (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        res.end();
        return;
      }
    });

    server.listen(port, () => {
      console.log(`🚀 Webhook server listening on port ${port}`);
    });

    try {
      const NGROK_AUTHTOKEN = process.env.NGROK_AUTHTOKEN;
      if (!NGROK_AUTHTOKEN) {
        server.close();
        return reject(new Error("NGROK_AUTHTOKEN environment variable is required"));
      }

      listener = await forward({ 
        addr: port,
        authtoken: NGROK_AUTHTOKEN
      });
      console.log(`🌐 Ngrok tunnel active: ${listener.url()}`);
    } catch (err) {
      server.close();
      return reject(new Error(`Failed to start ngrok tunnel: ${err}`));
    }

    const cleanup = async () => {
      console.log("🧹 Cleaning up webhook server and ngrok tunnel");
      server.close();
      if (listener) await listener.close();
    };

    const waitForWebhook = () => {
      return new Promise<any>((resolveWebhook, rejectWebhook) => {
        // Check if we already have a buffered payload
        if (bufferedPayload) {
          console.log("📤 Returning buffered webhook payload");
          resolveWebhook(bufferedPayload);
          return;
        }
        
        webhookResolver = resolveWebhook;
        webhookRejecter = rejectWebhook;
        
        // Set up timeout
        setTimeout(() => {
          if (!resolved && !bufferedPayload) {
            console.log("⏰ Webhook timeout reached");
            rejectWebhook(new Error(`Webhook timeout after ${timeoutMs}ms`));
          }
        }, timeoutMs);
      });
    };

    // Return the webhook setup immediately
    resolve({
      url: listener.url() || "",
      waitForWebhook,
      close: cleanup
    });
  });
}

// Keep the original function for backward compatibility
export async function awaitWebhook(options: WebhookOptions): Promise<AwaitWebhookResult> {
  const webhook = await setupWebhook(options);
  const body = await webhook.waitForWebhook();
  return {
    body,
    url: webhook.url,
    close: webhook.close
  };
}

// Helper function to create a unique flag for testing
export function createTestFlag(): string {
  return `test-flag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Helper function to send test email via Resend
export async function sendTestEmail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
}): Promise<void> {
  const { to, subject, text, html, from = "e2e@inbound.new" } = options;
  
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY environment variable is required");
  }

  const response = await resend.emails.send({
    from,
    to,
    subject,
    text,
    html: html || `<p>${text}</p>`,
  });

  console.log("📧 Email sent via Resend:", response);
} 