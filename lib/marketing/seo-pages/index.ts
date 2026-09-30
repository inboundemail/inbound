import { page as inboundEmailService } from "@/lib/marketing/seo-pages/pages/inbound-email-service";
import { page as emailWebhookApi } from "@/lib/marketing/seo-pages/pages/email-webhook-api";
import { page as emailParsingApi } from "@/lib/marketing/seo-pages/pages/email-parsing-api";
import { page as emailApiForAiAgents } from "@/lib/marketing/seo-pages/pages/email-api-for-ai-agents";
import { page as catchAllEmailApi } from "@/lib/marketing/seo-pages/pages/catch-all-email-api";
import { page as receiveEmailNodejs } from "@/lib/marketing/seo-pages/pages/receive-email-nodejs";
import { page as receiveEmailNextjs } from "@/lib/marketing/seo-pages/pages/receive-email-nextjs";
import { page as receiveEmailPython } from "@/lib/marketing/seo-pages/pages/receive-email-python";
import { page as mailgunInboundAlternative } from "@/lib/marketing/seo-pages/pages/mailgun-inbound-alternative";
import { page as sendgridInboundAlternative } from "@/lib/marketing/seo-pages/pages/sendgrid-inbound-alternative";
import { page as postmarkInboundAlternative } from "@/lib/marketing/seo-pages/pages/postmark-inbound-alternative";
import { page as resendInboundAlternative } from "@/lib/marketing/seo-pages/pages/resend-inbound-alternative";
import type { SeoPage } from "@/lib/marketing/seo-pages/types";

export const seoPages: SeoPage[] = [
	inboundEmailService,
	emailWebhookApi,
	emailParsingApi,
	emailApiForAiAgents,
	catchAllEmailApi,
	receiveEmailNodejs,
	receiveEmailNextjs,
	receiveEmailPython,
	mailgunInboundAlternative,
	sendgridInboundAlternative,
	postmarkInboundAlternative,
	resendInboundAlternative,
];

export function seoPageBySlug(slug: string): SeoPage | undefined {
	return seoPages.find((page) => page.slug === slug);
}
