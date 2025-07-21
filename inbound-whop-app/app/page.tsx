'use client'

import { useState } from 'react'
import type { EmailItem } from '@inboundemail/sdk'
import { EmailList } from './components/email-list'
import { EmailDetail } from './components/email-detail'

export default function Page() {
	const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null)
	const [view, setView] = useState<'list' | 'detail'>('list')

	const handleEmailSelect = (email: EmailItem) => {
		setSelectedEmail(email)
		setView('detail')
	}

	const handleBackToList = () => {
		setSelectedEmail(null)
		setView('list')
	}

	// Check if environment variables are set
	const isConfigured = process.env.NEXT_PUBLIC_INBOUND_API_KEY || 
		(typeof window !== 'undefined' && localStorage.getItem('inbound_api_key'))

	if (!isConfigured) {
		return (
			<div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
				<div className="max-w-3xl mx-auto">
					<div className="text-center mb-12">
						<h1 className="text-4xl font-bold text-gray-900 mb-4">
							Inbound Email Manager
						</h1>
						<p className="text-lg text-gray-600">
							Manage your emails using the Inbound Email API
						</p>
					</div>

					<div className="bg-white p-8 rounded-lg shadow-md">
						<h2 className="text-2xl font-semibold text-gray-900 mb-6">
							⚙️ Configuration Required
						</h2>
						
						<div className="space-y-4 text-gray-700">
							<p>To use this email manager, you need to set up your environment variables:</p>
							
							<div className="bg-gray-100 p-4 rounded-lg">
								<h3 className="font-medium mb-2">Required Environment Variables:</h3>
								<ul className="space-y-1 text-sm font-mono">
									<li>INBOUND_API_KEY=your_inbound_api_key_here</li>
									<li>INBOUND_DEFAULT_REPLY_FROM=your-email@domain.com (optional)</li>
								</ul>
							</div>

							<div className="bg-blue-50 p-4 rounded-lg">
								<h3 className="font-medium mb-2">How to get your API key:</h3>
								<ol className="list-decimal list-inside space-y-1 text-sm">
									<li>Go to <a href="https://inbound.new/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">your Inbound dashboard</a></li>
									<li>Navigate to Settings → API Keys</li>
									<li>Create a new API key</li>
									<li>Add it to your environment variables</li>
								</ol>
							</div>

							<div className="bg-yellow-50 p-4 rounded-lg">
								<h3 className="font-medium mb-2">Development Setup:</h3>
								<p className="text-sm">
									Create a <code className="bg-gray-200 px-1 rounded">.env.local</code> file in your project root with your API key.
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div className="min-h-screen bg-gray-50">
			<div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-gray-900">
						📧 Email Manager
					</h1>
					<p className="text-gray-600 mt-2">
						Manage and respond to your inbound emails
					</p>
				</div>

				{view === 'list' ? (
					<EmailList onEmailSelect={handleEmailSelect} />
				) : (
					selectedEmail && (
						<EmailDetail
							emailId={selectedEmail.id}
							onBack={handleBackToList}
						/>
					)
				)}
			</div>
		</div>
	)
}
