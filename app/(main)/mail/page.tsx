import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDistanceToNow } from 'date-fns'
import { getEmailsList } from '@/app/actions/primary'
import Link from 'next/link'
import { HiCheckCircle, HiClock, HiSearch, HiTrendingUp, HiX, HiDocumentText } from 'react-icons/hi'
import { CustomInboundIcon } from '@/components/icons/customInbound'
import { MarkAllReadButton } from '@/components/mark-all-read-button'

interface MailPageProps {
    searchParams: Promise<{
        search?: string
        status?: string
        domain?: string
        limit?: string
        offset?: string
    }>
}

export default async function MailPage({ searchParams }: MailPageProps) {
    // Await search params
    const params = await searchParams
    
    // Get search params with defaults
    const searchQuery = params.search || ''
    const statusFilter = params.status || 'all'
    const domainFilter = params.domain || 'all'
    const limit = parseInt(params.limit || '50')
    const offset = parseInt(params.offset || '0')

    // Fetch emails server-side
    const emailsResult = await getEmailsList({
        limit,
        offset,
        searchQuery,
        statusFilter,
        domainFilter
    })

    if (emailsResult.error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100/50 p-4 font-outfit">
                <div className="max-w-5xl mx-auto">
                    <Card className="border-red-200 bg-red-50">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-2 text-red-600">
                                <HiX className="h-4 w-4" />
                                <span>{emailsResult.error}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        )
    }

    const { emails, pagination, filters, unreadCount } = emailsResult.data!

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'received':
                return (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                        <HiCheckCircle className="h-3 w-3 mr-1" />
                        Received
                    </Badge>
                )
            case 'processing':
                return (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                        <HiClock className="h-3 w-3 mr-1" />
                        Processing
                    </Badge>
                )
            case 'forwarded':
                return (
                    <Badge className="bg-blue-100 text-blue-800 border-blue-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                        <HiTrendingUp className="h-3 w-3 mr-1" />
                        Forwarded
                    </Badge>
                )
            case 'failed':
                return (
                    <Badge className="bg-rose-100 text-rose-800 border-rose-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                        <HiX className="h-3 w-3 mr-1" />
                        Failed
                    </Badge>
                )
            default:
                return (
                    <Badge className="bg-slate-100 text-slate-700 border-slate-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                        <HiClock className="h-3 w-3 mr-1" />
                        {status}
                    </Badge>
                )
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100/50 p-4 font-outfit">
            <div className="max-w-5xl mx-auto">
                {/* Header Section */}
                <div className="mb-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-semibold text-gray-900 mb-1 tracking-tight">
                                Email Management ({unreadCount} unread)
                            </h2>
                            <p className="text-gray-600 text-sm font-medium">Search and filter your received emails</p>
                        </div>
                        <MarkAllReadButton unreadCount={unreadCount} />
                    </div>
                </div>

                {/* Search and Filters Form */}
                <div className="mb-6">
                    <form method="GET" className="flex items-center gap-3">
                        <div className="relative flex-1">
                            <HiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                name="search"
                                placeholder="Search emails..."
                                defaultValue={searchQuery}
                                className="pl-10 h-10 bg-white border-gray-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg"
                            />
                        </div>
                        
                        <select 
                            name="domain" 
                            defaultValue={domainFilter}
                            className="h-10 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            <option value="all">All Domains</option>
                            {filters.uniqueDomains.map((domain: string) => (
                                <option key={domain} value={domain}>{domain}</option>
                            ))}
                        </select>

                        <Button type="submit" className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                            <HiSearch className="h-4 w-4" />
                            Filter
                        </Button>
                    </form>
                </div>

                {/* Email List */}
                {emails.length === 0 ? (
                    <div className="bg-white/95 backdrop-blur-sm shadow-sm border border-gray-200/60 rounded-xl p-8">
                        <div className="text-center">
                            <CustomInboundIcon 
                                text="EM" 
                                size={48} 
                                backgroundColor="#8b5cf6" 
                                className="mx-auto mb-4" 
                            />
                            <h3 className="text-lg font-semibold mb-2 text-gray-900">No emails found</h3>
                            <p className="text-sm text-slate-500">
                                {searchQuery || statusFilter !== 'all' || domainFilter !== 'all'
                                    ? 'No emails match your search criteria.'
                                    : 'No emails have been received yet.'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {emails.map((email) => {
                            // Get sender name and extract initials
                            const senderName = email.parsedData.fromData?.addresses?.[0]?.name || 
                                             email.from.split('@')[0] || 
                                             email.from.split('<')[0] || 
                                             email.from
                            
                            // Extract initials (1-2 letters)
                            const getInitials = (name: string) => {
                                const words = name.trim().split(/\s+/)
                                if (words.length >= 2) {
                                    // Take first letter of first two words
                                    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase()
                                } else {
                                    // Take first two letters of single word
                                    return name.slice(0, 2).toUpperCase()
                                }
                            }
                            
                            const initials = getInitials(senderName)
                            
                            // Generate consistent color based on sender name
                            const getAvatarColor = (name: string) => {
                                const colors = [
                                    '#6366f1', // indigo
                                    '#8b5cf6', // violet  
                                    '#06b6d4', // cyan
                                    '#10b981', // emerald
                                    '#f59e0b', // amber
                                    '#ef4444', // red
                                    '#ec4899', // pink
                                    '#84cc16', // lime
                                ]
                                const hash = name.split('').reduce((a, b) => {
                                    a = ((a << 5) - a) + b.charCodeAt(0)
                                    return a & a
                                }, 0)
                                return colors[Math.abs(hash) % colors.length]
                            }
                            
                            const avatarColor = getAvatarColor(senderName)

                            return (
                                <Link 
                                    key={email.id}
                                    href={`/mail/${email.id}`}
                                    className={`flex items-center gap-4 p-4 bg-white/95 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200 border border-gray-200/60 rounded-xl group ${
                                        !email.isRead ? 'border-l-4 border-l-[#6366f1]' : ''
                                    }`}
                                >
                                    {/* CustomInboundIcon with sender initials */}
                                    <CustomInboundIcon 
                                        text={initials}
                                        size={40} 
                                        backgroundColor={avatarColor} 
                                    />

                                    {/* Email content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-4">
                                            {/* Sender and Subject */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`text-sm truncate ${email.isRead ? 'font-medium text-gray-700' : 'font-bold text-gray-900'}`}>
                                                        {senderName}
                                                    </span>
                                                    {email.parsedData.hasAttachments && (
                                                        <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs rounded-full px-2 py-0.5">
                                                            <HiDocumentText className="w-3 h-3 mr-1" />
                                                            {email.parsedData.attachmentCount}
                                                        </Badge>
                                                    )}
                                                    {!email.isRead && (
                                                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                                    )}
                                                </div>
                                                <div className={`text-sm truncate ${email.isRead ? 'text-gray-600' : 'text-gray-900 font-medium'}`}>
                                                    {email.subject}
                                                </div>
                                            </div>

                                            {/* Time */}
                                            <div className="text-right flex-shrink-0">
                                                <div className="text-xs text-gray-500 whitespace-nowrap">
                                                    {formatDistanceToNow(new Date(email.receivedAt || new Date()), { addSuffix: true })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            )
                        })}
                    </div>
                )}

                {/* Pagination */}
                {pagination.total > pagination.limit && (
                    <div className="bg-white/95 backdrop-blur-sm shadow-sm border border-gray-200/60 rounded-xl p-4 mt-6">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-gray-600 font-medium">
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
                                        <Button variant="secondary" size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg">
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
                                        <Button variant="secondary" size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg">
                                            Next
                                        </Button>
                                    </Link>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
} 