"use client"

import { useEffect, useState } from 'react'
import { useSession } from '@/lib/auth-client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

import {
    BarChart3Icon,
    TrendingUpIcon,
    MailIcon,
    GlobeIcon,
    ClockIcon,
    AlertTriangleIcon,
    CheckCircleIcon,
    XCircleIcon,
    SearchIcon,
    RefreshCwIcon,
    CalendarIcon,
    ServerIcon,
    FilterIcon,
    DownloadIcon
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { toast } from 'sonner'

interface AnalyticsData {
    stats: {
        totalEmails: number
        emailsLast24h: number
        emailsLast7d: number
        emailsLast30d: number
        totalDomains: number
        verifiedDomains: number
        totalEmailAddresses: number
        avgProcessingTime: number
    }
    recentEmails: Array<{
        id: string
        messageId: string
        from: string
        recipient: string
        subject: string
        receivedAt: string
        status: string
        domain: string
        isRead: boolean
        readAt?: string
        authResults: {
            spf: string
            dkim: string
            dmarc: string
            spam: string
            virus: string
        }
        hasContent: boolean
        contentSize?: number
    }>
    emailsByDay: Array<{
        date: string
        count: number
    }>
    emailsByDomain: Array<{
        domain: string
        count: number
        percentage: number
    }>
    authResultsStats: {
        spf: { pass: number; fail: number; neutral: number }
        dkim: { pass: number; fail: number; neutral: number }
        dmarc: { pass: number; fail: number; neutral: number }
        spam: { pass: number; fail: number }
        virus: { pass: number; fail: number }
    }
}

export default function AnalyticsPage() {
    const { data: session } = useSession()
    const router = useRouter()
    const searchParams = useSearchParams()
    const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [domainFilter, setDomainFilter] = useState('all')
    const [filteredEmails, setFilteredEmails] = useState<AnalyticsData['recentEmails']>([])



    useEffect(() => {
        if (session?.user) {
            fetchAnalyticsData()
        }
    }, [session])

    // Background polling for new emails
    useEffect(() => {
        if (!session?.user) return

        const pollForNewEmails = async () => {
            try {
                const response = await fetch('/api/analytics')
                if (!response.ok) return

                const newData: AnalyticsData = await response.json()
                
                // Only update if there are actually changes (compare email count or latest email ID)
                if (analyticsData) {
                    const hasNewEmails = newData.recentEmails.length !== analyticsData.recentEmails.length ||
                        (newData.recentEmails[0]?.id !== analyticsData.recentEmails[0]?.id)
                    
                    if (hasNewEmails) {
                        setAnalyticsData(newData)
                        // Optional: Show a subtle notification for new emails
                        if (newData.recentEmails.length > analyticsData.recentEmails.length) {
                            const newEmailCount = newData.recentEmails.length - analyticsData.recentEmails.length
                            toast.success(`${newEmailCount} new email${newEmailCount > 1 ? 's' : ''} received`)
                        }
                    }
                } else {
                    // First load, set the data
                    setAnalyticsData(newData)
                }
            } catch (error) {
                // Silently fail for background polling to avoid spam
                console.debug('Background email check failed:', error)
            }
        }

        // Set up polling interval (5 seconds)
        const interval = setInterval(pollForNewEmails, 5000)

        // Also poll when the page becomes visible again
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                pollForNewEmails()
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)

        // Cleanup
        return () => {
            clearInterval(interval)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [session, analyticsData])



    useEffect(() => {
        if (analyticsData) {
            let filtered = analyticsData.recentEmails.filter(email => {
                const matchesSearch =
                    email.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    email.recipient.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    email.messageId.toLowerCase().includes(searchQuery.toLowerCase())

                const matchesStatus = statusFilter === 'all' || email.status === statusFilter
                const matchesDomain = domainFilter === 'all' || email.domain === domainFilter

                return matchesSearch && matchesStatus && matchesDomain
            })

            setFilteredEmails(filtered)
        }
    }, [analyticsData, searchQuery, statusFilter, domainFilter])

    const fetchAnalyticsData = async () => {
        try {
            setIsLoading(true)
            setError(null)
            const response = await fetch('/api/analytics')

            if (!response.ok) {
                throw new Error('Failed to fetch analytics data')
            }

            const data: AnalyticsData = await response.json()
            setAnalyticsData(data)
        } catch (error) {
            console.error('Error fetching analytics:', error)
            setError(error instanceof Error ? error.message : 'Failed to load analytics')
            toast.error('Failed to load analytics data')
        } finally {
            setIsLoading(false)
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'received':
                return (
                    <Badge className="bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200 transition-colors">
                        <CheckCircleIcon className="h-3 w-3 mr-1" />
                        Received
                    </Badge>
                )
            case 'processing':
                return (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 transition-colors">
                        <ClockIcon className="h-3 w-3 mr-1" />
                        Processing
                    </Badge>
                )
            case 'forwarded':
                return (
                    <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200 transition-colors">
                        <TrendingUpIcon className="h-3 w-3 mr-1" />
                        Forwarded
                    </Badge>
                )
            case 'failed':
                return (
                    <Badge className="bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-200 transition-colors">
                        <XCircleIcon className="h-3 w-3 mr-1" />
                        Failed
                    </Badge>
                )
            default:
                return (
                    <Badge className="bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 transition-colors">
                        <ClockIcon className="h-3 w-3 mr-1" />
                        {status}
                    </Badge>
                )
        }
    }

    const getAuthBadge = (result: string, type: 'spf' | 'dkim' | 'dmarc' | 'spam' | 'virus') => {
        const isPass = result === 'PASS'
        const isFail = result === 'FAIL'

        if (isPass) {
            return (
                <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                    <CheckCircleIcon className="h-2 w-2 mr-1" />
                    {type.toUpperCase()}
                </Badge>
            )
        } else if (isFail) {
            return (
                <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">
                    <XCircleIcon className="h-2 w-2 mr-1" />
                    {type.toUpperCase()}
                </Badge>
            )
        } else {
            return (
                <Badge className="bg-gray-100 text-gray-600 border-gray-200 text-xs">
                    <AlertTriangleIcon className="h-2 w-2 mr-1" />
                    {type.toUpperCase()}
                </Badge>
            )
        }
    }

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
    }

    const handleEmailClick = (emailId: string) => {
        // Navigate immediately for better UX
        router.push(`/mail/${emailId}`)
        
        // Mark email as read in the background (non-blocking)
        const email = filteredEmails.find(e => e.id === emailId)
        if (email && !email.isRead) {
            // Optimistically update local state immediately
            setAnalyticsData(prev => {
                if (!prev) return prev
                return {
                    ...prev,
                    recentEmails: prev.recentEmails.map(e => 
                        e.id === emailId 
                            ? { ...e, isRead: true, readAt: new Date().toISOString() }
                            : e
                    )
                }
            })
            
            // Update database in the background
            fetch(`/api/emails/${emailId}/read`, {
                method: 'POST',
            }).catch(error => {
                console.error('Failed to mark email as read:', error)
                // Revert optimistic update on error
                setAnalyticsData(prev => {
                    if (!prev) return prev
                    return {
                        ...prev,
                        recentEmails: prev.recentEmails.map(e => 
                            e.id === emailId 
                                ? { ...e, isRead: false, readAt: undefined }
                                : e
                        )
                    }
                })
            })
        }
    }



    if (isLoading) {
        return (
            <div className="flex flex-1 flex-col gap-6 p-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
                </div>

                <div className="flex items-center justify-center py-12">
                    <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        <span className="text-muted-foreground">Loading inbox...</span>
                    </div>
                </div>
            </div>
        )
    }

    if (error || !analyticsData) {
        return (
            <div className="flex flex-1 flex-col gap-6 p-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
                </div>

                <div className="flex items-center justify-center py-12">
                    <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        <span className="text-muted-foreground">Loading inbox...</span>
                    </div>
                </div>
                <div className="flex flex-1 flex-col gap-6 p-6">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
                    </div>

                    <div className="flex items-center justify-center py-12">
                        <div className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                            <span className="text-muted-foreground">Loading inbox...</span>
                        </div>
                    </div>
                </div>
            </div>

        )
    }

    const { stats, recentEmails } = analyticsData

    // Get unique domains for filter
    const uniqueDomains = Array.from(new Set(recentEmails.map(email => email.domain)))

    return (
        <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Header with Gradient */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
            </div>

            {/* Email Activity Section - No Card */}
            <div>

                {/* Filters */}
                <div className="flex items-center gap-4 mb-3">
                    <div className="relative flex-1">
                        <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search emails..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 bg-background"
                        />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="All Statuses" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="received">Received</SelectItem>
                            <SelectItem value="processing">Processing</SelectItem>
                            <SelectItem value="forwarded">Forwarded</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={domainFilter} onValueChange={setDomainFilter}>
                        <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="All Domains" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Domains</SelectItem>
                            {uniqueDomains.map(domain => (
                                <SelectItem key={domain} value={domain}>{domain}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Email List */}
                {filteredEmails.length === 0 ? (
                    <div className="text-center py-12">
                        <MailIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No emails found</h3>
                        <p className="text-muted-foreground">
                            {searchQuery || statusFilter !== 'all' || domainFilter !== 'all'
                                ? 'No emails match your search criteria.'
                                : 'No emails have been received yet.'}
                        </p>
                    </div>
                ) : (
                    <div className="border border-border rounded-lg overflow-hidden bg-background">
                        {filteredEmails.map((email, index) => {
                            // Get first letter of sender name for avatar
                            const senderName = email.from.split('@')[0] || email.from.split('<')[0] || email.from
                            const firstLetter = senderName.charAt(0).toUpperCase()
                            
                            // Generate a consistent color based on sender email
                            const getAvatarStyle = (emailAddress: string) => {
                                const hash = emailAddress.split('').reduce((a, b) => {
                                    a = ((a << 5) - a) + b.charCodeAt(0)
                                    return a & a
                                }, 0)
                                const hue = Math.abs(hash) % 360
                                const hue2 = (hue + 30) % 360
                                return {
                                    background: `linear-gradient(135deg, hsl(${hue}, 70%, 60%) 0%, hsl(${hue2}, 70%, 45%) 100%)`
                                }
                            }

                            return (
                                <div
                                    key={email.id}
                                    className={`flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors cursor-pointer ${
                                        index < filteredEmails.length - 1 ? 'border-b border-border/50' : ''
                                    } ${!email.isRead ? 'bg-blue-50/50' : ''}`}
                                    onClick={() => handleEmailClick(email.id)}
                                >
                                    {/* Avatar with gradient */}
                                    <div 
                                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                                        style={getAvatarStyle(email.from)}
                                    >
                                        {firstLetter}
                                    </div>

                                    {/* Email content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-4">
                                            {/* Sender and Subject */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`text-sm truncate ${email.isRead ? 'font-medium' : 'font-bold'}`}>
                                                        {senderName}
                                                    </span>
                                                    <Badge className="bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 transition-colors text-xs">
                                                        {email.domain}
                                                    </Badge>
                                                    {!email.isRead && (
                                                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                                    )}
                                                </div>
                                                <div className={`text-sm truncate ${email.isRead ? 'text-muted-foreground' : 'text-foreground font-medium'}`}>
                                                    {email.subject}
                                                </div>
                                            </div>

                                            {/* Time */}
                                            <div className="text-xs text-muted-foreground whitespace-nowrap">
                                                <div>
                                                    {formatDistanceToNow(new Date(email.receivedAt), { addSuffix: true })}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Mobile: Show recipient on smaller screens */}
                                        <div className="text-xs text-muted-foreground truncate sm:hidden mt-1">
                                            To: {email.recipient}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>


        </div>
    )
} 