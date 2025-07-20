"use client"

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMailV2Query } from '@/features/emails/hooks'
import type { EmailItem } from '@/app/api/v2/mail/route'
import Link from 'next/link'
import Check2 from '@/components/icons/check-2'
import AlarmClock from '@/components/icons/alarm-clock'
import Magnifier2 from '@/components/icons/magnifier-2'
import ArrowUpRight2 from '@/components/icons/arrow-up-right-2'
import CircleWarning2 from '@/components/icons/circle-warning-2'
import { CustomInboundIcon } from '@/components/icons/customInbound'
import { MarkAllReadButton } from '@/components/mark-all-read-button'
import { DomainFilterSelect } from '@/components/domain-filter-select'
import { EmailListItem } from '@/components/emails/EmailListItem'

export default function MailPage() {
    const searchParams = useSearchParams()
    const router = useRouter()

    // Get search params with defaults
    const searchQuery = searchParams.get('search') || ''
    const statusFilter = searchParams.get('status') || 'all'
    const domainFilter = searchParams.get('domain') || 'all'
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Fetch emails using v2 API with 5-second refresh
    const {
        data: emailsResult,
        isLoading,
        error,
        refetch
    } = useMailV2Query({
        limit,
        offset,
        search: searchQuery,
        status: statusFilter === 'all' ? undefined : (statusFilter as 'all' | 'processed' | 'failed'),
        domain: domainFilter === 'all' ? undefined : domainFilter
    })

    // Set up 5-second auto-refresh
    useEffect(() => {
        const interval = setInterval(() => {
            refetch()
        }, 5000) // 5 seconds

        return () => clearInterval(interval)
    }, [refetch])

    if (error) {
        return (
            <div className="min-h-screen p-4 font-outfit">
                <div className="max-w-5xl mx-auto">
                    <Card className="border-destructive/50 bg-destructive/10">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-2 text-destructive">
                                <CircleWarning2 width="16" height="16" />
                                <span>{error.message}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="min-h-screen p-4 font-outfit">
                <div className="max-w-5xl mx-auto">
                    <div className="flex items-center justify-center py-12">
                        <div className="text-muted-foreground">Loading emails...</div>
                    </div>
                </div>
            </div>
        )
    }

    if (!emailsResult) {
        return (
            <div className="min-h-screen p-4 font-outfit">
                <div className="max-w-5xl mx-auto">
                    <div className="flex items-center justify-center py-12">
                        <div className="text-muted-foreground">No emails found</div>
                    </div>
                </div>
            </div>
        )
    }

    const { emails, pagination, filters = { uniqueDomains: [] } } = emailsResult
    const unreadCount = emails.filter(email => !email.isRead).length

    // Adapter function to convert v2 EmailItem to EmailListItem format
    const adaptEmailForListItem = (email: EmailItem) => ({
        id: email.id,
        from: email.from,
        subject: email.subject || 'No Subject',
        receivedAt: email.receivedAt.toString(),
        isRead: email.isRead,
        parsedData: {
            fromData: {
                addresses: [{
                    name: email.fromName,
                    address: email.from
                }]
            },
            preview: email.preview,
            hasAttachments: email.hasAttachments,
            htmlContent: null,
            textContent: null
        }
    })

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'received':
                return (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                        <Check2 width="12" height="12" className="mr-1" />
                        Received
                    </Badge>
                )
            case 'processing':
                return (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                        <AlarmClock width="12" height="12" className="mr-1" />
                        Processing
                    </Badge>
                )
            case 'forwarded':
                return (
                    <Badge className="bg-blue-100 text-blue-800 border-blue-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                        <ArrowUpRight2 width="12" height="12" className="mr-1" />
                        Forwarded
                    </Badge>
                )
            case 'failed':
                return (
                    <Badge className="bg-rose-100 text-rose-800 border-rose-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                        <CircleWarning2 width="12" height="12" className="mr-1" />
                        Failed
                    </Badge>
                )
            default:
                return (
                    <Badge className="bg-secondary text-secondary-foreground border-border rounded-full px-2.5 py-0.5 text-xs font-medium">
                        <AlarmClock width="12" height="12" className="mr-1" />
                        {status}
                    </Badge>
                )
        }
    }

    return (
        <div className="min-h-screen font-outfit">
            <div className="max-w-6xl mx-auto p-4">
                {/* Header Section */}
                <div className="mb-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-semibold text-foreground mb-1 tracking-tight">
                                Mail ({unreadCount} unread)
                            </h2>
                            <p className="text-muted-foreground text-sm font-medium">Search and filter your received emails</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <MarkAllReadButton unreadCount={unreadCount} />
                        </div>
                    </div>
                </div>

                {/* Search and Filters Form */}
                <div className="mb-6">
                    <div className="flex items-center gap-3">
                        <form method="GET" className="relative flex-1">
                            <Magnifier2 width="16" height="16" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                            <Input
                                name="search"
                                placeholder="Search emails..."
                                defaultValue={searchQuery}
                                className="pl-10 h-9 rounded-xl"
                            />
                            {/* Hidden inputs to preserve other filter states */}
                            {domainFilter !== 'all' && (
                                <input type="hidden" name="domain" value={domainFilter} />
                            )}
                            <Button type="submit" className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 px-2">
                                <Magnifier2 width="12" height="12" />
                            </Button>
                        </form>

                        <DomainFilterSelect
                            domains={filters.uniqueDomains}
                            currentDomain={domainFilter}
                        />
                    </div>
                </div>
            </div>

            {/* Email List - Edge to Edge */}
            <div className="w-full max-w-6xl mx-auto">
                {emails.length === 0 ? (
                    <div className="max-w-5xl mx-auto p-4">
                        <div className="bg-card border-border rounded-xl p-8">
                            <div className="text-center">
                                <CustomInboundIcon
                                    text="EM"
                                    size={48}
                                    backgroundColor="#8b5cf6"
                                    className="mx-auto mb-4"
                                />
                                <h3 className="text-lg font-semibold mb-2 text-foreground">No emails found</h3>
                                <p className="text-sm text-muted-foreground mb-4">
                                    {searchQuery || statusFilter !== 'all' || domainFilter !== 'all'
                                        ? 'No emails match your search criteria.'
                                        : 'Hey! Looks like you don\'t have any emails yet.'}
                                </p>
                                {!(searchQuery || statusFilter !== 'all' || domainFilter !== 'all') && (
                                    <div className="space-y-3">
                                        <p className="text-sm text-muted-foreground">
                                            Ready to start receiving emails? Let's get you set up!
                                        </p>
                                        <Button asChild>
                                            <Link href="/onboarding">
                                                Start Onboarding
                                            </Link>
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {emails.map((email) => (
                            <EmailListItem key={email.id} email={adaptEmailForListItem(email)} />
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {pagination.total > pagination.limit && (
                    <div className="max-w-5xl mx-auto p-4">
                        <div className="bg-card border-border rounded-xl p-4">
                            <div className="flex items-center justify-between">
                                <div className="text-sm text-muted-foreground font-medium">
                                    Showing {pagination.offset + 1} to {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total} emails
                                </div>
                                <div className="flex items-center gap-2">
                                    {pagination.offset > 0 && (
                                        <Link
                                            href={{
                                                pathname: '/mail',
                                                query: {
                                                    ...(searchQuery && { search: searchQuery }),
                                                    ...(statusFilter !== 'all' && { status: statusFilter }),
                                                    ...(domainFilter !== 'all' && { domain: domainFilter }),
                                                    offset: Math.max(0, pagination.offset - pagination.limit).toString()
                                                }
                                            }}
                                        >
                                            <Button variant="secondary" size="sm" className="rounded-xl">
                                                Previous
                                            </Button>
                                        </Link>
                                    )}
                                    {pagination.hasMore && (
                                        <Link
                                            href={{
                                                pathname: '/mail',
                                                query: {
                                                    ...(searchQuery && { search: searchQuery }),
                                                    ...(statusFilter !== 'all' && { status: statusFilter }),
                                                    ...(domainFilter !== 'all' && { domain: domainFilter }),
                                                    offset: (pagination.offset + pagination.limit).toString()
                                                }
                                            }}
                                        >
                                            <Button variant="secondary" size="sm" className="rounded-xl">
                                                Next
                                            </Button>
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
} 