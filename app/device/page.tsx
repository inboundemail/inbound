import type { Metadata } from "next";
import { Suspense } from "react";
import { DeviceAuthorization } from "@/components/device-authorization";

export const metadata: Metadata = {
	title: "Authorize inboundctl | Inbound",
	referrer: "no-referrer",
};

export default function DevicePage() {
	return (
		<Suspense fallback={<div className="min-h-screen bg-background" />}>
			<DeviceAuthorization />
		</Suspense>
	);
}
