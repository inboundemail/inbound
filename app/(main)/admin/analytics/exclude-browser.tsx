"use client";

import { useEffect } from "react";

export function ExcludeBrowser() {
	useEffect(() => {
		try {
			localStorage.setItem("inbound-analytics-optout", "1");
		} catch {}
	}, []);

	return (
		<span className="text-xs text-muted-foreground">
			This browser is excluded from tracking
		</span>
	);
}
