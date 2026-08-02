"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prepareEmailHtml } from "@/lib/mail-format";

interface EmailHtmlProps {
	html: string;
	messageId: string;
}

export function EmailHtml({ html, messageId }: EmailHtmlProps) {
	const [height, setHeight] = useState(180);
	const observerRef = useRef<ResizeObserver | null>(null);

	useEffect(() => () => observerRef.current?.disconnect(), []);

	const handleLoad = useCallback((event: React.SyntheticEvent<HTMLIFrameElement>) => {
		observerRef.current?.disconnect();
		const frame = event.currentTarget;
		const document = frame.contentDocument;
		if (!document) return;

		const resize = () => {
			const nextHeight = Math.max(
				120,
				document.body?.scrollHeight ?? 0,
				document.documentElement?.scrollHeight ?? 0,
			);
			setHeight(nextHeight);
		};

		resize();
		observerRef.current = new ResizeObserver(resize);
		observerRef.current.observe(document.documentElement);
	}, []);

	return (
		<iframe
			className="email-html-frame"
			onLoad={handleLoad}
			referrerPolicy="no-referrer"
			sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
			srcDoc={prepareEmailHtml(html)}
			style={{ height }}
			title={`Email message ${messageId}`}
		/>
	);
}
