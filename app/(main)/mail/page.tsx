import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    MailIcon,
    SearchIcon,
    CheckCircleIcon,
    XCircleIcon,
    ClockIcon,
    TrendingUpIcon,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { getEmailsList, markEmailAsRead } from '@/app/actions/primary'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'

interface PageProps {
    searchParams: Promise<{
        search?: string
        status?: string
        domain?: string
        limit?: string
        offset?: string
    }>
}

// Server action for marking email as read
async function markAsReadAction(formData: FormData) {
    'use server'
    const emailId = formData.get('emailId') as string
    if (emailId) {
        await markEmailAsRead(emailId)
    }
}

export default async function MailPage({ searchParams }: PageProps) {
    // Get session on server
    const session = await auth.api.getSession({
        headers: await headers()
    })

    if (!session?.user) {
        redirect('/login')
    }

    // Parse search params
    const params = await searchParams
    const searchQuery = params.search || ''
    const statusFilter = params.status || 'all'
    const domainFilter = params.domain || 'all'
    const limit = parseInt(params.limit || '50')
    const offset = parseInt(params.offset || '0')

    // Fetch emails on server
    const emailsResult = await getEmailsList({
        limit,
        offset,
        searchQuery,
        statusFilter,
        domainFilter
    })

    if (emailsResult.error) {
        return (
            <div className="flex flex-1 flex-col gap-6 p-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
                </div>

                <Card className="border-red-200 bg-red-50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 text-red-600">
                            <MailIcon className="h-4 w-4" />
                            <span>{emailsResult.error}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    const { emails, pagination, filters } = emailsResult.data!

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'received':
                return (
                    <Badge className="bg-purple-100 text-purple-800 border-purple-200">
                        <CheckCircleIcon className="h-3 w-3 mr-1" />
                        Received
                    </Badge>
                )
            case 'processing':
                return (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                        <ClockIcon className="h-3 w-3 mr-1" />
                        Processing
                    </Badge>
                )
            case 'forwarded':
                return (
                    <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                        <TrendingUpIcon className="h-3 w-3 mr-1" />
                        Forwarded
                    </Badge>
                )
            case 'failed':
                return (
                    <Badge className="bg-rose-100 text-rose-800 border-rose-200">
                        <XCircleIcon className="h-3 w-3 mr-1" />
                        Failed
                    </Badge>
                )
            default:
                return (
                    <Badge className="bg-slate-100 text-slate-700 border-slate-200">
                        <ClockIcon className="h-3 w-3 mr-1" />
                        {status}
                    </Badge>
                )
        }
    }

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
        <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
                <p className="text-muted-foreground">
                    {pagination.total} email{pagination.total !== 1 ? 's' : ''} total
                </p>
            </div>

            {/* Filters Form */}
            <form method="GET" className="flex items-center gap-4 mb-3">
                <div className="relative flex-1">
                    <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        name="search"
                        placeholder="Search emails..."
                        defaultValue={searchQuery}
                        className="pl-10 bg-background"
                    />
                </div>
                
                <select 
                    name="status" 
                    defaultValue={statusFilter}
                    className="flex h-10 w-[150px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                    <option value="all">All Statuses</option>
                    <option value="received">Received</option>
                    <option value="processing">Processing</option>
                    <option value="forwarded">Forwarded</option>
                    <option value="failed">Failed</option>
                </select>

                <select 
                    name="domain" 
                    defaultValue={domainFilter}
                    className="flex h-10 w-[150px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                    <option value="all">All Domains</option>
                    {filters.uniqueDomains.map(domain => (
                        <option key={domain} value={domain}>{domain}</option>
                    ))}
                </select>

                <Button type="submit" variant="secondary">
                    Filter
                </Button>
            </form>

            {/* Email List */}
            {emails.length === 0 ? (
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
                    {emails.map((email, index) => {
                        // Get first letter of sender name for avatar
                        const senderName = email.parsedData.fromName || 
                                         email.from.split('@')[0] || 
                                         email.from.split('<')[0] || 
                                         email.from
                        const firstLetter = senderName.charAt(0).toUpperCase()

                        return (
                            <div key={email.id} className={`border-b border-border/50 last:border-b-0`}>
                                <Link 
                                    href={`/mail/${email.id}`}
                                    className={`flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors block ${
                                        !email.isRead ? 'bg-blue-50/50' : ''
                                    }`}
                                >
                                    {/* Avatar with gradient */}
                                    <div 
                                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0"
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
                                                    <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs">
                                                        {email.domain}
                                                    </Badge>
                                                    {email.parsedData.hasAttachments && (
                                                        <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">
                                                            📎 {email.parsedData.attachmentCount}
                                                        </Badge>
                                                    )}
                                                    {!email.isRead && (
                                                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                                    )}
                                                </div>
                                                <div className={`text-sm truncate ${email.isRead ? 'text-muted-foreground' : 'text-foreground font-medium'}`}>
                                                    {email.subject}
                                                </div>
                                            </div>

                                            {/* Time and Status */}
                                            <div className="text-right flex-shrink-0">
                                                <div className="text-xs text-muted-foreground whitespace-nowrap mb-1">
                                                    {formatDistanceToNow(new Date(email.receivedAt), { addSuffix: true })}
                                                </div>
                                                {getStatusBadge(email.status)}
                                            </div>
                                        </div>

                                        {/* Mobile: Show recipient on smaller screens */}
                                        <div className="text-xs text-muted-foreground truncate sm:hidden mt-1">
                                            To: {email.recipient}
                                        </div>
                                    </div>
                                </Link>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Pagination */}
            {pagination.total > pagination.limit && (
                <div className="flex items-center justify-between mt-6">
                    <div className="text-sm text-muted-foreground">
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
                                <Button variant="secondary" size="sm">
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
                                <Button variant="secondary" size="sm">
                                    Next
                                </Button>
                            </Link>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
} 