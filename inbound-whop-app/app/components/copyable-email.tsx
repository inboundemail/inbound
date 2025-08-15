'use client'

import { ClipboardIcon, CheckIcon } from "lucide-react";
import { useState } from "react";

export function CopyableEmail({ email }: { email: string }) {
	const [copied, setCopied] = useState(false);

	return (
		<span
			className="font-medium cursor-pointer hover:bg-gray-3 rounded px-1 py-1 ml-1 transition-colors"
			title="Click to copy email address"
			onClick={() => {
				navigator.clipboard.writeText(email);
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			}}
		>
			{copied ? (
				<CheckIcon className="w-4 h-4 inline-block mr-1 text-green-600" />
			) : (
				<ClipboardIcon className="w-4 h-4 inline-block mr-1" />
			)}
            {email} 
		</span>
	)
}