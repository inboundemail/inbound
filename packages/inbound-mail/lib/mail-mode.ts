import type { InboundSession } from "@/lib/mail-types";

export type InboundMailMode = InboundSession["mode"];

export function inboundMailMode(): InboundMailMode {
	const configured = process.env.NEXT_PUBLIC_INBOUND_MAIL_MODE;
	if (configured === "live" || configured === "auth-mock") return configured;
	return "mock";
}

export function usesMockMailData(mode = inboundMailMode()): boolean {
	return mode !== "live";
}
