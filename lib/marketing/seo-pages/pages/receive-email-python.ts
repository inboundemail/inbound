import type { SeoPage } from "@/lib/marketing/seo-pages/types";

export const page: SeoPage = {
	slug: "guides/receive-email-python",
	title: "Receive Email in Python with Webhooks",
	description:
		"Receive and process email in Python with a webhook. Build a FastAPI handler, download attachments, and send replies through inbound's API.",
	h1: "Receive and process email in Python",
	intro:
		"With inbound, Python can receive email two ways: a webhook that POSTs each message to your app as JSON, or IMAP polling of a mailbox. This guide explains when each fits, then builds a FastAPI webhook with an RQ worker that downloads attachments and replies through the REST API.",
	sections: [
		{
			heading: "Webhook or IMAP: choose how mail reaches Python",
			paragraphs: [
				"Both options start the same way: add your domain to inbound and point its MX records at it. The difference is who initiates. A webhook pushes each message to your app as it arrives, already parsed. IMAP lets your code log in and pull messages when it wants, and you parse the MIME yourself with the standard email package.",
				"Choose the webhook for real-time processing and apps that already serve HTTP. Choose IMAP for scripts, cron jobs, or machines with no public URL. inbound serves IMAP at imap.inboundemail.com on port 993 with TLS; log in with the address and a mailbox credential created for it or its domain.",
				"If the mail you need lives in an existing Gmail or Outlook mailbox, neither option applies; connect to that provider's IMAP instead.",
			],
			code: {
				label: "The IMAP option, with imaplib",
				snippet: `import email
import imaplib
import os

with imaplib.IMAP4_SSL("imap.inboundemail.com", 993) as imap:
    imap.login(os.environ["IMAP_USER"], os.environ["IMAP_PASSWORD"])
    imap.select("INBOX")
    _, data = imap.search(None, "UNSEEN")
    for num in data[0].split():
        _, parts = imap.fetch(num, "(RFC822)")
        msg = email.message_from_bytes(parts[0][1])
        print(msg["From"], msg["Subject"])`,
			},
		},
		{
			heading: "Type the webhook payload",
			paragraphs: [
				"The rest of this guide uses the webhook. Each request body has event set to email.received, a timestamp, and an email object with id, messageId, from, to, recipient, subject, receivedAt, threadId, parsedData and cleanedContent.",
				"Model only the fields you use. Pydantic ignores the rest by default, so new fields will not break your handler. Most values can be null, so give them defaults.",
			],
			code: {
				label: "models.py",
				snippet: `from pydantic import BaseModel


class Attachment(BaseModel):
    filename: str | None = None
    contentType: str | None = None
    size: int | None = None
    downloadUrl: str


class ParsedData(BaseModel):
    textBody: str | None = None
    attachments: list[Attachment] = []


class Email(BaseModel):
    id: str
    subject: str | None = None
    threadId: str | None = None
    parsedData: ParsedData


class InboundWebhook(BaseModel):
    event: str
    email: Email`,
			},
		},
		{
			heading: "The FastAPI handler: verify, deduplicate, enqueue",
			paragraphs: [
				"inbound sends your endpoint's token in the X-Webhook-Verification-Token header. Get the token once from config.verificationToken in GET https://inbound.new/api/e2/endpoints/{id}, store it as an environment variable, and compare with secrets.compare_digest. It is a shared token, not a signature.",
				"A Redis SET with nx=True records each email.id once, so a repeated delivery is acknowledged without queueing a second job. Then return 200 and leave the work to RQ.",
			],
			code: {
				label: "main.py",
				snippet: `import os
import secrets

from fastapi import FastAPI, Header, HTTPException
from redis import Redis
from rq import Queue, Retry

from models import InboundWebhook
from worker import process_email

app = FastAPI()
redis = Redis.from_url(os.environ["REDIS_URL"])
queue = Queue("inbound-email", connection=redis)
TOKEN = os.environ["INBOUND_WEBHOOK_TOKEN"].encode()


@app.post("/webhooks/inbound")
def receive(payload: InboundWebhook, x_webhook_verification_token: str = Header("")):
    if not secrets.compare_digest(x_webhook_verification_token.encode(), TOKEN):
        raise HTTPException(status_code=401)
    if payload.event == "email.received":
        if redis.set(f"inbound:seen:{payload.email.id}", 1, nx=True, ex=7 * 86400):
            queue.enqueue(process_email, payload.email.model_dump(), retry=Retry(max=3))
    return {"ok": True}`,
			},
		},
		{
			heading: "An attachment worker that replies once",
			paragraphs: [
				"There is no official Python SDK, so the worker calls the REST API with httpx and your API key. Stream each downloadUrl and stop at a size cap, so one oversized file cannot exhaust memory. save_attachment stands in for your own storage code.",
				"The reply goes to POST /api/e2/emails/{id}/reply. It defaults to the original sender and a Re: subject, and inbound sets the threading headers. The Idempotency-Key header means an RQ retry returns the reply already sent rather than sending a second one.",
			],
			code: {
				label: "worker.py",
				snippet: `import os
import httpx

API = "https://inbound.new/api/e2"
AUTH = {"Authorization": f"Bearer {os.environ['INBOUND_API_KEY']}"}
MAX_BYTES = 25 * 1024 * 1024


def process_email(email: dict) -> None:
    with httpx.Client(headers=AUTH, timeout=30) as client:
        for file in email["parsedData"]["attachments"]:
            data = bytearray()
            with client.stream("GET", file["downloadUrl"]) as res:
                res.raise_for_status()
                for chunk in res.iter_bytes():
                    data += chunk
                    if len(data) > MAX_BYTES:
                        raise ValueError(f"{file['filename']} is over the size cap")
            save_attachment(email["id"], file["filename"], bytes(data))

        client.post(
            f"{API}/emails/{email['id']}/reply",
            headers={"Idempotency-Key": f"ack-{email['id']}"},
            json={"from": "support@yourdomain.com", "text": "Thanks, we got your files."},
        ).raise_for_status()`,
			},
		},
		{
			heading: "Run it end to end",
			paragraphs: [
				"Run the API and the worker as separate processes. inbound does not deliver to localhost or private IP addresses, so expose port 8000 with a tunnel and set the webhook endpoint URL to the public address.",
				"Send a real email with an attachment to the routed address. Expect a 200 in the uvicorn log, a finished job in the RQ worker, the saved file, and a threaded reply in your inbox.",
			],
			bullets: [
				"401: the token in INBOUND_WEBHOOK_TOKEN does not match the endpoint's config.verificationToken",
				"422 from FastAPI: a field you typed as required was null or missing; relax the model",
				"Timeouts: inbound waits 30 seconds by default, so keep downloads and replies in the worker",
				"Missed messages are recorded as failed and not retried automatically; resend with POST /api/e2/emails/{id}/retry",
			],
			code: {
				label: "Install and run",
				snippet: `pip install fastapi uvicorn httpx redis rq

uvicorn main:app --port 8000
rq worker inbound-email --url "$REDIS_URL"
cloudflared tunnel --url http://localhost:8000`,
			},
		},
	],
	faqs: [
		{
			question: "How can I receive and send email in Python?",
			answer:
				"Receive with the FastAPI webhook above or by polling IMAP. Send with POST https://inbound.new/api/e2/emails from httpx or requests, or with smtplib through smtp.inboundemail.com on port 465 or 587, using the username inbound and an API key as the password.",
		},
		{
			question: "How do I listen for incoming emails in Python 3?",
			answer:
				"With imaplib you poll: log in on a schedule and search for unseen messages. A webhook removes the loop, because inbound POSTs each message to your app as it arrives.",
		},
		{
			question: "Can Django receive email?",
			answer:
				"Django's email tools only send. To receive, use the same webhook pattern in a Django view: mark it csrf_exempt, compare the X-Webhook-Verification-Token header, hand the payload to Celery or RQ, and return a 200 response.",
		},
		{
			question: "Is there an official Python SDK?",
			answer:
				"No. The only official SDK is TypeScript (npm inboundemail). From Python, call the REST API directly with an Authorization: Bearer header, as in this guide.",
		},
	],
	related: [
		"email-parsing-api",
		"email-webhook-api",
		"email-api-for-ai-agents",
	],
	updated: "2026-09-30",
};
