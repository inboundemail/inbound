"use client"

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SiteHeader } from "@/components/site-header"
import { Highlighter } from "@/components/magicui/highlighter"
import { BackgroundBeams } from "@/components/ui/background-beams"
import { submitAmbassadorApplication, AmbassadorApplicationData } from '@/app/actions/ambassador'
import { useRouter } from 'next/navigation'

export default function AmbassadorPage() {
    const [formData, setFormData] = useState<AmbassadorApplicationData>({
        name: '',
        email: '',
        xHandle: '',
        reason: ''
    })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()

    const handleInputChange = (field: keyof AmbassadorApplicationData, value: string) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }))
        // Clear error when user starts typing
        if (error) setError(null)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        setError(null)

        try {
            const result = await submitAmbassadorApplication(formData)
            
            if (result.success) {
                setSubmitted(true)
                // Clear form
                setFormData({
                    name: '',
                    email: '',
                    xHandle: '',
                    reason: ''
                })
            } else {
                setError(result.error || 'Failed to submit application')
            }
        } catch (err) {
            setError('An unexpected error occurred. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    if (submitted) {
        return (
            <div className="min-h-screen bg-[#1B1C1D] text-[#e5e5e5] font-['Outfit',sans-serif] relative">
                <SiteHeader />
                <div className="max-w-4xl mx-auto px-6 py-20 relative z-10">
                    <div className="text-center">
                        <div className="mb-8">
                            <Image
                                src="/inbound-ambassador.png"
                                alt="Inbound Ambassador"
                                width={200}
                                height={200}
                                className="mx-auto rounded-lg"
                            />
                        </div>
                        <h1 className="text-4xl font-bold mb-6">
                            <Highlighter action="underline" color="#6C47FF">
                                Application Submitted!
                            </Highlighter>
                        </h1>
                        <p className="text-lg text-[var(--text-secondary)] mb-8 max-w-2xl mx-auto">
                            Thank you for your interest in becoming an Inbound Ambassador! 
                            We've received your application and will review it shortly. 
                            You'll hear from us within the next few days.
                        </p>
                        <div className="space-y-4">
                            <Button
                                size="lg"
                                asChild
                            >
                                <Link href="/logs">start building with inbound</Link>
                            </Button>
                            <div>
                                <Button
                                    size="lg"
                                    variant="outline"
                                    onClick={() => {
                                        setSubmitted(false)
                                        setFormData({
                                            name: '',
                                            email: '',
                                            xHandle: '',
                                            reason: ''
                                        })
                                    }}
                                >
                                    submit another application
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="absolute inset-0">
                    <BackgroundBeams />
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#1B1C1D] text-[#e5e5e5] font-['Outfit',sans-serif] relative">
            {/* CSS Variables for theme */}
            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@100;200;300;400;500;600;700;800;900&display=swap');
                
                :root {
                    --bg-primary: #1B1C1D;
                    --bg-secondary: #0f0f0f;
                    --bg-card: #2a2b2c;
                    --bg-card-hover: #3a3b3c;
                    --text-primary: #e5e5e5;
                    --text-secondary: #b3b3b3;
                    --text-muted: #8a8a8a;
                    --border-primary: #3a3b3c;
                    --border-secondary: #2a2b2c;
                    --purple-primary: #6C47FF;
                    --purple-dark: #5a3cd9;
                }
            `}
            </style>

            <SiteHeader />

            <div className="max-w-4xl mx-auto px-6 py-20 relative z-10">
                {/* Hero Section with Image */}
                <div className="text-center mb-12">
                    <div className="mb-8">
                        <Image
                            src="/inbound-ambassador.png"
                            alt="Inbound Ambassador"
                            width={300}
                            height={300}
                            className="mx-auto rounded-lg"
                            priority
                        />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold mb-6">
                        become an inbound <Highlighter action="underline" color="#6C47FF">ambassador</Highlighter>
                    </h1>
                    <p className="text-lg text-[var(--text-secondary)] max-w-3xl mx-auto leading-relaxed">
                        Join our community of developers who are passionate about making email development simple and accessible. 
                        Help spread the word about Inbound and earn rewards for your contributions.
                    </p>
                </div>

                {/* Application Form */}
                <Card className="bg-[var(--bg-card)] border-[var(--border-primary)] max-w-2xl mx-auto">
                    <CardHeader>
                        <CardTitle className="text-2xl font-bold text-[var(--text-primary)]">
                            Ambassador Application
                        </CardTitle>
                        <CardDescription className="text-[var(--text-secondary)]">
                            Tell us about yourself and why you'd like to become an Inbound Ambassador
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Name Field */}
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-[var(--text-primary)] font-medium">
                                    Full Name *
                                </Label>
                                <Input
                                    id="name"
                                    type="text"
                                    placeholder="Enter your full name"
                                    value={formData.name}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                    required
                                    className="bg-[var(--bg-primary)] border-[var(--border-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--purple-primary)] focus:ring-[var(--purple-primary)]"
                                />
                            </div>

                            {/* Email Field */}
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-[var(--text-primary)] font-medium">
                                    Email Address *
                                </Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="your@email.com"
                                    value={formData.email}
                                    onChange={(e) => handleInputChange('email', e.target.value)}
                                    required
                                    className="bg-[var(--bg-primary)] border-[var(--border-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--purple-primary)] focus:ring-[var(--purple-primary)]"
                                />
                            </div>

                            {/* X Handle Field */}
                            <div className="space-y-2">
                                <Label htmlFor="xHandle" className="text-[var(--text-primary)] font-medium">
                                    X (Twitter) Handle *
                                </Label>
                                <Input
                                    id="xHandle"
                                    type="text"
                                    placeholder="@yourhandle"
                                    value={formData.xHandle}
                                    onChange={(e) => {
                                        let value = e.target.value
                                        // Add @ if not present
                                        if (value && !value.startsWith('@')) {
                                            value = '@' + value
                                        }
                                        handleInputChange('xHandle', value)
                                    }}
                                    required
                                    className="bg-[var(--bg-primary)] border-[var(--border-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--purple-primary)] focus:ring-[var(--purple-primary)]"
                                />
                            </div>

                            {/* Reason Field */}
                            <div className="space-y-2">
                                <Label htmlFor="reason" className="text-[var(--text-primary)] font-medium">
                                    Why do you want to be an Inbound Ambassador? *
                                </Label>
                                <Textarea
                                    id="reason"
                                    placeholder="Tell us why you'd like to become an Inbound Ambassador and how you plan to contribute to the community... (2 sentences suggested, but feel free to write more or less)"
                                    value={formData.reason}
                                    onChange={(e) => handleInputChange('reason', e.target.value)}
                                    required
                                    rows={4}
                                    className="bg-[var(--bg-primary)] border-[var(--border-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--purple-primary)] focus:ring-[var(--purple-primary)] resize-none"
                                />
                                <div className="text-right text-xs text-[var(--text-muted)]">
                                    {formData.reason.length}/1000 characters
                                </div>
                            </div>

                            {/* Error Message */}
                            {error && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                    <p className="text-red-400 text-sm">{error}</p>
                                </div>
                            )}

                            {/* Submit Button */}
                            <Button
                                type="submit"
                                size="lg"
                                className="w-full bg-[var(--purple-primary)] hover:bg-[var(--purple-dark)] text-white border-0 py-3 font-medium"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? 'Submitting Application...' : 'Submit Application'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* What You'll Get Section */}
                <div className="mt-16 text-center">
                    <h2 className="text-2xl font-bold mb-8 text-[var(--text-primary)]">
                        What You'll Get as an Ambassador
                    </h2>
                    <div className="grid md:grid-cols-3 gap-6">
                        <div className="bg-[var(--bg-card)] border border-[var(--border-secondary)] rounded-lg p-6">
                            <div className="text-3xl mb-4">🎯</div>
                            <h3 className="font-semibold text-[var(--purple-primary)] mb-2">Early Access</h3>
                            <p className="text-sm text-[var(--text-muted)]">
                                Be the first to try new features and provide feedback to shape the future of Inbound
                            </p>
                        </div>
                        <div className="bg-[var(--bg-card)] border border-[var(--border-secondary)] rounded-lg p-6">
                            <div className="text-3xl mb-4">💰</div>
                            <h3 className="font-semibold text-[var(--purple-primary)] mb-2">Rewards & Perks</h3>
                            <p className="text-sm text-[var(--text-muted)]">
                                Earn credits, swag, and exclusive perks for successful referrals and community contributions
                            </p>
                        </div>
                        <div className="bg-[var(--bg-card)] border border-[var(--border-secondary)] rounded-lg p-6">
                            <div className="text-3xl mb-4">🤝</div>
                            <h3 className="font-semibold text-[var(--purple-primary)] mb-2">Direct Access</h3>
                            <p className="text-sm text-[var(--text-muted)]">
                                Connect directly with our team and influence product decisions through ambassador feedback
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Background Effects */}
            <div className="absolute inset-0">
                <BackgroundBeams />
            </div>
        </div>
    )
}
